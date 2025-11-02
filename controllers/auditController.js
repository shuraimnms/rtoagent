const AuditLog = require('../models/AuditLog');
const FraudAlert = require('../models/FraudAlert');
const Agent = require('../models/Agent');
const MessageLog = require('../models/MessageLog');

// Log an action
const logAction = async (action, entityType, entityId, performedBy, details = {}, req = null) => {
  try {
    const auditLog = new AuditLog({
      action,
      entityType,
      entityId,
      performedBy,
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('User-Agent')
    });

    await auditLog.save();

    // Check for suspicious activity
    await checkForFraudAlerts(action, performedBy, details);

  } catch (error) {
    console.error('Error logging audit action:', error);
  }
};

// Get audit logs with filtering
const getAuditLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      action,
      entityType,
      performedBy,
      startDate,
      endDate,
      search
    } = req.query;

    const query = {};

    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    if (performedBy) query.performedBy = performedBy;

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (search) {
      query.$or = [
        { 'details.description': { $regex: search, $options: 'i' } },
        { 'details.message': { $regex: search, $options: 'i' } }
      ];
    }

    const logs = await AuditLog.find(query)
      .populate('performedBy', 'name email')
      .sort({ timestamp: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await AuditLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs'
    });
  }
};

// Get fraud alerts
const getFraudAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'active', severity } = req.query;

    const query = {};
    if (status !== 'all') query.status = status;
    if (severity) query.severity = severity;

    const alerts = await FraudAlert.find(query)
      .populate('agent', 'name email')
      .populate('resolvedBy', 'name email')
      .sort({ triggeredAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await FraudAlert.countDocuments(query);

    res.json({
      success: true,
      data: {
        alerts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching fraud alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch fraud alerts'
    });
  }
};

// Resolve fraud alert
const resolveFraudAlert = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { resolutionNotes } = req.body;

    const alert = await FraudAlert.findByIdAndUpdate(
      alertId,
      {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: req.agent._id,
        resolutionNotes
      },
      { new: true }
    ).populate('agent', 'name email');

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Fraud alert not found'
      });
    }

    res.json({
      success: true,
      message: 'Fraud alert resolved',
      data: { alert }
    });

  } catch (error) {
    console.error('Error resolving fraud alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve fraud alert'
    });
  }
};

// Check for fraud patterns and create alerts
const checkForFraudAlerts = async (action, agentId, details) => {
  try {
    const agent = await Agent.findById(agentId);
    if (!agent) return;

    // Check for high message volume in last hour
    if (action === 'SEND_MESSAGE') {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const messageCount = await MessageLog.countDocuments({
        agent: agentId,
        sent_at: { $gte: oneHourAgo }
      });

      if (messageCount > 100) { // Threshold for suspicious activity
        await FraudAlert.create({
          agent: agentId,
          alertType: 'HIGH_MESSAGE_VOLUME',
          severity: 'high',
          description: `High message volume detected: ${messageCount} messages in the last hour`,
          details: { messageCount, timeWindow: '1 hour' }
        });
      }
    }

    // Check for unusual wallet activity
    if (action === 'WALLET_TOPUP' && details.amount > 50000) { // Large topup
      await FraudAlert.create({
        agent: agentId,
        alertType: 'WALLET_ANOMALY',
        severity: 'medium',
        description: `Large wallet topup detected: ₹${details.amount}`,
        details
      });
    }

    // Check for bulk operations
    if (action === 'CREATE_CUSTOMER' && details.bulkOperation) {
      const recentBulkOps = await AuditLog.countDocuments({
        performedBy: agentId,
        action: 'CREATE_CUSTOMER',
        'details.bulkOperation': true,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      if (recentBulkOps > 5) {
        await FraudAlert.create({
          agent: agentId,
          alertType: 'BULK_OPERATION',
          severity: 'low',
          description: `Multiple bulk customer imports detected in 24 hours`,
          details: { bulkOperationsCount: recentBulkOps }
        });
      }
    }

  } catch (error) {
    console.error('Error checking for fraud alerts:', error);
  }
};

// Get audit statistics
const getAuditStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalLogs,
      activeAlerts,
      criticalAlerts,
      recentLogs
    ] = await Promise.all([
      AuditLog.countDocuments({ timestamp: { $gte: thirtyDaysAgo } }),
      FraudAlert.countDocuments({ status: 'active' }),
      FraudAlert.countDocuments({ status: 'active', severity: { $in: ['high', 'critical'] } }),
      AuditLog.find({ timestamp: { $gte: thirtyDaysAgo } })
        .populate('performedBy', 'name')
        .sort({ timestamp: -1 })
        .limit(10)
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        totalLogs,
        activeAlerts,
        criticalAlerts,
        recentLogs
      }
    });

  } catch (error) {
    console.error('Error fetching audit stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit statistics'
    });
  }
};

module.exports = {
  logAction,
  getAuditLogs,
  getFraudAlerts,
  resolveFraudAlert,
  checkForFraudAlerts,
  getAuditStats
};
