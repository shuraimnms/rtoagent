const Notification = require('../models/Notification');
const Agent = require('../models/Agent');

// Send notification to agents
const sendNotification = async (req, res) => {
  try {
    const { title, message, type = 'info', target, agentId } = req.body;
    const sentBy = req.agent._id;

    // Validate required fields
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }

    if (target === 'specific' && !agentId) {
      return res.status(400).json({
        success: false,
        message: 'Agent ID is required for specific target'
      });
    }

    // Create notification
    const notification = new Notification({
      title,
      message,
      type,
      target,
      agentId: target === 'specific' ? agentId : undefined,
      sentBy
    });

    await notification.save();

    res.status(201).json({
      success: true,
      message: 'Notification sent successfully',
      data: notification
    });

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send notification'
    });
  }
};

// Get notifications for an agent
const getNotifications = async (req, res) => {
  try {
    const agentId = req.agent._id;
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const query = {
      isActive: true,
      $or: [
        { target: 'all' },
        { target: 'specific', agentId: agentId }
      ]
    };

    if (unreadOnly === 'true') {
      query['readBy.agentId'] = { $ne: agentId };
    }

    const notifications = await Notification.find(query)
      .populate('sentBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Add read status for each notification
    const notificationsWithReadStatus = notifications.map(notification => ({
      ...notification,
      isRead: notification.readBy.some(read => read.agentId.toString() === agentId.toString())
    }));

    const total = await Notification.countDocuments(query);

    res.json({
      success: true,
      data: {
        notifications: notificationsWithReadStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const agentId = req.agent._id;

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if agent can access this notification
    if (notification.target === 'specific' && notification.agentId.toString() !== agentId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Check if already read
    const alreadyRead = notification.readBy.some(read => read.agentId.toString() === agentId.toString());

    if (!alreadyRead) {
      notification.readBy.push({
        agentId,
        readAt: new Date()
      });
      await notification.save();
    }

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
};

// Mark all notifications as read for an agent
const markAllAsRead = async (req, res) => {
  try {
    const agentId = req.agent._id;

    const result = await Notification.updateMany(
      {
        isActive: true,
        $or: [
          { target: 'all' },
          { target: 'specific', agentId: agentId }
        ],
        'readBy.agentId': { $ne: agentId }
      },
      {
        $push: {
          readBy: {
            agentId,
            readAt: new Date()
          }
        }
      }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`
    });

  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
};

// Get notification statistics for admin
const getNotificationStats = async (req, res) => {
  try {
    const totalNotifications = await Notification.countDocuments({ isActive: true });

    // Get recent notifications (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentNotifications = await Notification.find({
      isActive: true,
      createdAt: { $gte: thirtyDaysAgo }
    }).sort({ createdAt: -1 });

    // Calculate read rates
    let totalReads = 0;
    let totalPossibleReads = 0;

    for (const notification of recentNotifications) {
      if (notification.target === 'all') {
        // For broadcast notifications, count all agents
        const agentCount = await Agent.countDocuments({ role: 'agent' });
        totalPossibleReads += agentCount;
        totalReads += notification.readBy.length;
      } else {
        // For specific notifications
        totalPossibleReads += 1;
        totalReads += notification.readBy.length;
      }
    }

    const readRate = totalPossibleReads > 0 ? (totalReads / totalPossibleReads) * 100 : 0;

    res.json({
      success: true,
      data: {
        totalNotifications,
        recentNotifications: recentNotifications.length,
        readRate: Math.round(readRate * 100) / 100,
        unreadCount: totalNotifications - totalReads
      }
    });

  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics'
    });
  }
};

// Delete notification (admin only)
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { isActive: false },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    });
  }
};

module.exports = {
  sendNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationStats,
  deleteNotification
};
