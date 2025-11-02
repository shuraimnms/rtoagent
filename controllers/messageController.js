const MessageLog = require('../models/MessageLog');
const Agent = require('../models/Agent');
const msg91Service = require('../services/msg91Service');

/**
 * @desc    Get message logs for the agent
 * @route   GET /api/v1/messages
 * @access  Private
 */
exports.getMessageLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filterConditions = { agent: req.agent._id };

    // Add optional filters
    if (req.query.status) filterConditions.status = req.query.status;
    if (req.query.message_type) filterConditions.message_type = req.query.message_type;

    // Search filter - search in customer name, mobile, or template name
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filterConditions.$or = [
        { customer_mobile: searchRegex },
        { template_name: searchRegex },
        { 'reminder.customer.name': searchRegex },
        { 'reminder.customer.mobile': searchRegex }
      ];
    }

    // Date range filters
    if (req.query.date_from || req.query.date_to) {
      filterConditions.sent_at = {};
      if (req.query.date_from) filterConditions.sent_at.$gte = new Date(req.query.date_from);
      if (req.query.date_to) filterConditions.sent_at.$lte = new Date(req.query.date_to);
    }

    const messageLogs = await MessageLog.find(filterConditions)
      .populate({
        path: 'reminder',
        populate: {
          path: 'customer',
          select: 'name mobile'
        },
        select: 'reminder_type vehicle_number customer'
      })
      .sort({ sent_at: -1 })
      .skip(skip)
      .limit(limit);

    // Transform the data to include customer info at the top level
    const transformedLogs = messageLogs.map(log => ({
      ...log.toObject(),
      customer_name: log.reminder?.customer?.name || 'Unknown Customer',
      customer_mobile: log.reminder?.customer?.mobile || log.customer_mobile
    }));

    const total = await MessageLog.countDocuments(filterConditions);

    res.json({
      success: true,
      data: { messageLogs: transformedLogs },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get message logs error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get message statistics
 * @route   GET /api/v1/messages/stats
 * @access  Private
 */
exports.getMessageStats = async (req, res) => {
  try {
    const agentId = req.agent._id;
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get message counts by status
    const statusStats = await MessageLog.aggregate([
      {
        $match: {
          agent: agentId,
          sent_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total_cost: { $sum: '$cost' }
        }
      }
    ]);

    // Get messages by type
    const typeStats = await MessageLog.aggregate([
      {
        $match: {
          agent: agentId,
          sent_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$message_type',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get daily message counts
    const dailyStats = await MessageLog.aggregate([
      {
        $match: {
          agent: agentId,
          sent_at: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$sent_at'
            }
          },
          sent: {
            $sum: { $cond: [{ $eq: ['$status', 'SENT'] }, 1, 0] }
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
          },
          total_cost: { $sum: '$cost' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        period: {
          days: days,
          start_date: startDate,
          end_date: new Date()
        },
        statistics: {
          by_status: statusStats,
          by_type: typeStats,
          daily: dailyStats
        },
        summary: {
          total_messages: statusStats.reduce((sum, stat) => sum + stat.count, 0),
          total_cost: statusStats.reduce((sum, stat) => sum + stat.total_cost, 0),
          success_rate: statusStats.length > 0 ?
            (statusStats.find(s => s._id === 'SENT')?.count || 0) /
            statusStats.reduce((sum, stat) => sum + stat.count, 0) * 100 : 0
        }
      }
    });
  } catch (error) {
    console.error('Get message stats error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Retry failed messages
 * @route   POST /api/v1/messages/retry-failed
 * @access  Private
 */
exports.retryFailedMessages = async (req, res) => {
  try {
    const failedMessages = await MessageLog.find({
      agent: req.agent._id,
      status: 'FAILED'
    }).limit(10);

    if (failedMessages.length === 0) {
      return res.json({
        success: true,
        message: 'No failed messages to retry',
        data: { retried: 0 }
      });
    }

    let retried = 0;
    let errors = [];

    for (const message of failedMessages) {
      try {
        // Attempt to resend the message
        const result = await msg91Service.sendTestMessage(
          message.customer_mobile,
          message.template_name,
          message.variables_sent
        );

        if (result.success) {
          // Update the message log
          await MessageLog.findByIdAndUpdate(message._id, {
            status: 'SENT',
            provider_message_id: result.provider_message_id,
            provider_response: result.provider_response,
            sent_at: new Date()
          });
          retried++;
        } else {
          errors.push({
            message_id: message._id,
            error: result.error
          });
        }
      } catch (error) {
        errors.push({
          message_id: message._id,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Retried ${retried} out of ${failedMessages.length} failed messages`,
      data: {
        retried: retried,
        failed: errors.length,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Retry failed messages error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
