const MessageLog = require('../models/MessageLog');
const Reminder = require('../models/Reminder');
const Agent = require('../models/Agent');
const msg91Service = require('../services/msg91Service');

/**
 * @desc    Get all message logs for the agent
 * @route   GET /api/v1/messages
 * @access  Private
 */
exports.getMessageLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { agent: req.agent._id };
    
    // Add optional filters
    if (req.query.status) filter.status = req.query.status;
    if (req.query.template_name) filter.template_name = req.query.template_name;
    if (req.query.message_type) filter.message_type = req.query.message_type;
    
    if (req.query.customer_mobile) {
      filter.customer_mobile = { 
        $regex: req.query.customer_mobile, 
        $options: 'i' 
      };
    }

    // Date range filters
    if (req.query.date_from || req.query.date_to) {
      filter.createdAt = {};
      if (req.query.date_from) filter.createdAt.$gte = new Date(req.query.date_from);
      if (req.query.date_to) filter.createdAt.$lte = new Date(req.query.date_to);
    }

    // Get message logs with pagination
    const messageLogs = await MessageLog.find(filter)
      .populate({
        path: 'reminder',
        populate: {
          path: 'customer',
          select: 'name vehicle_number'
        }
      })
      .populate('agent', 'name email company_name')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Get total count for pagination
    const total = await MessageLog.countDocuments(filter);

    // Get statistics
    const stats = await MessageLog.aggregate([
      { $match: { agent: req.agent._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate delivery rate
    const totalSent = await MessageLog.countDocuments({ 
      agent: req.agent._id,
      status: { $in: ['SENT', 'DELIVERED', 'READ'] }
    });
    const totalMessages = await MessageLog.countDocuments({ agent: req.agent._id });
    const deliveryRate = totalMessages > 0 ? (totalSent / totalMessages * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: { 
        messageLogs,
        statistics: {
          by_status: stats,
          total_messages: totalMessages,
          delivery_rate: deliveryRate
        }
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        status: req.query.status,
        template_name: req.query.template_name,
        customer_mobile: req.query.customer_mobile,
        date_from: req.query.date_from,
        date_to: req.query.date_to
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
 * @desc    Get a single message log by ID
 * @route   GET /api/v1/messages/:id
 * @access  Private
 */
exports.getMessageLog = async (req, res) => {
  try {
    const messageLog = await MessageLog.findOne({
      _id: req.params.id,
      agent: req.agent._id
    })
    .populate({
      path: 'reminder',
      populate: {
        path: 'customer',
        select: 'name mobile vehicle_number email'
      }
    })
    .populate('agent', 'name email mobile company_name');

    if (!messageLog) {
      return res.status(404).json({
        success: false,
        message: 'Message log not found'
      });
    }

    res.json({
      success: true,
      data: { messageLog }
    });

  } catch (error) {
    console.error('Get message log error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Retry sending a failed message
 * @route   POST /api/v1/messages/:id/retry
 * @access  Private
 */
exports.retryMessage = async (req, res) => {
  try {
    const messageLog = await MessageLog.findOne({
      _id: req.params.id,
      agent: req.agent._id,
      status: 'FAILED'
    }).populate({
      path: 'reminder',
      populate: ['customer', 'agent']
    });

    if (!messageLog) {
      return res.status(404).json({
        success: false,
        message: 'Failed message log not found or message is not in failed status'
      });
    }

    // Check agent wallet balance
    const agent = await Agent.findById(req.agent._id);
    const messageCost = agent.settings.per_message_cost || 1.0;

    if (agent.wallet_balance < messageCost) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance to retry message',
        data: {
          current_balance: agent.wallet_balance,
          required_balance: messageCost
        }
      });
    }

    let result;
    
    if (messageLog.reminder) {
      // This is a scheduled reminder message
      const schedulerService = require('../services/schedulerService');
      result = await schedulerService.processReminder(messageLog.reminder);
    } else {
      // This is a test or manual message
      result = await msg91Service.sendTemplateMessage({
        mobile: messageLog.customer_mobile,
        template_name: messageLog.template_name,
        variables: reconstructVariables(messageLog.variables_sent, messageLog.template_name),
        agent: req.agent
      });
    }

      if (result.success) {
        // Update message log
        messageLog.status = 'DELIVERED';
        messageLog.sent_at = new Date();
        messageLog.delivered_at = new Date();
        messageLog.provider_message_id = result.provider_message_id;
        messageLog.provider_response = result.provider_response;
        messageLog.retry_count += 1;
        messageLog.error_message = null;
        await messageLog.save();

      // Deduct from wallet
      await Agent.findByIdAndUpdate(req.agent._id, {
        $inc: { wallet_balance: -messageCost }
      });

      res.json({
        success: true,
        message: 'Message retried successfully',
        data: {
          message_log: messageLog,
          cost_deducted: messageCost,
          new_balance: agent.wallet_balance - messageCost
        }
      });
    } else {
      // Update retry count even if failed
      messageLog.retry_count += 1;
      messageLog.error_message = result.error;
      await messageLog.save();

      res.status(400).json({
        success: false,
        message: 'Failed to retry message',
        error: result.error,
        retry_count: messageLog.retry_count
      });
    }

  } catch (error) {
    console.error('Retry message error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get message statistics and analytics
 * @route   GET /api/v1/messages/stats/analytics
 * @access  Private
 */
exports.getMessageAnalytics = async (req, res) => {
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
          createdAt: { $gte: startDate }
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

    // Get message counts by template
    const templateStats = await MessageLog.aggregate([
      { 
        $match: { 
          agent: agentId,
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: '$template_name',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get daily message counts for the period
    const dailyStats = await MessageLog.aggregate([
      { 
        $match: { 
          agent: agentId,
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt'
            }
          },
          count: { $sum: 1 },
          cost: { $sum: '$cost' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get total counts
    const totalMessages = await MessageLog.countDocuments({ 
      agent: agentId,
      createdAt: { $gte: startDate }
    });
    
    const successfulMessages = await MessageLog.countDocuments({ 
      agent: agentId,
      status: { $in: ['SENT', 'DELIVERED', 'READ'] },
      createdAt: { $gte: startDate }
    });

    const failedMessages = await MessageLog.countDocuments({ 
      agent: agentId,
      status: 'FAILED',
      createdAt: { $gte: startDate }
    });

    const totalCost = await MessageLog.aggregate([
      { 
        $match: { 
          agent: agentId,
          createdAt: { $gte: startDate }
        } 
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$cost' }
        }
      }
    ]);

    const deliveryRate = totalMessages > 0 ? (successfulMessages / totalMessages * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        period: {
          days: days,
          start_date: startDate,
          end_date: new Date()
        },
        overview: {
          total_messages: totalMessages,
          successful_messages: successfulMessages,
          failed_messages: failedMessages,
          delivery_rate: deliveryRate,
          total_cost: totalCost[0]?.total || 0
        },
        by_status: statusStats,
        by_template: templateStats,
        daily_breakdown: dailyStats
      }
    });

  } catch (error) {
    console.error('Get message analytics error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Delete a message log
 * @route   DELETE /api/v1/messages/:id
 * @access  Private
 */
exports.deleteMessageLog = async (req, res) => {
  try {
    const messageLog = await MessageLog.findOneAndDelete({
      _id: req.params.id,
      agent: req.agent._id
    });

    if (!messageLog) {
      return res.status(404).json({
        success: false,
        message: 'Message log not found'
      });
    }

    res.json({
      success: true,
      message: 'Message log deleted successfully',
      data: { messageLog }
    });

  } catch (error) {
    console.error('Delete message log error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Export message logs to CSV
 * @route   GET /api/v1/messages/export/csv
 * @access  Private
 */
exports.exportMessageLogs = async (req, res) => {
  try {
    const { start_date, end_date, format = 'csv' } = req.query;

    const filter = { agent: req.agent._id };
    
    if (start_date || end_date) {
      filter.createdAt = {};
      if (start_date) filter.createdAt.$gte = new Date(start_date);
      if (end_date) filter.createdAt.$lte = new Date(end_date);
    }

    const messageLogs = await MessageLog.find(filter)
      .populate({
        path: 'reminder',
        populate: {
          path: 'customer',
          select: 'name vehicle_number'
        }
      })
      .sort({ createdAt: -1 })
      .limit(1000); // Limit for export

    if (format === 'json') {
      // Return as JSON
      res.json({
        success: true,
        data: {
          message_logs: messageLogs,
          export_info: {
            format: 'json',
            count: messageLogs.length,
            exported_at: new Date().toISOString()
          }
        }
      });
    } else {
      // Convert to CSV
  const csvData = convertToCSV(messageLogs);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=message-logs-${Date.now()}.csv`);
      res.send(csvData);
    }

  } catch (error) {
    console.error('Export message logs error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to reconstruct variables from stored array
function reconstructVariables(variablesArray, template_name) {
  if (!variablesArray || !Array.isArray(variablesArray)) {
    return {};
  }

  const baseVars = {
    customer_name: variablesArray[0] || 'Customer',
    vehicle_number: variablesArray[1] || 'N/A',
    vehicle_type: variablesArray[2] || 'Vehicle',
    license_number: variablesArray[3] || 'N/A',
    expiry_date: variablesArray[4] || 'N/A',
    days_left: variablesArray[5] || '0',
    agent_name: variablesArray[6] || 'Agent',
    agent_mobile: variablesArray[7] || '+919876543210'
  };

  return baseVars;
}

// Helper function to convert message logs to CSV
function convertToCSV(messageLogs) {
  const headers = [
    'Message ID',
    'Customer Mobile',
    'Template Name',
    'Status',
    'Sent At',
    'Cost',
    'Provider Message ID',
    'Error Message',
    'Message Type',
    'Customer Name',
    'Vehicle Number'
  ];

  let csv = headers.join(',') + '\n';

  messageLogs.forEach(log => {
    const customerName = log.reminder && log.reminder.customer ? log.reminder.customer.name : 'N/A';
    const vehicleNumber = log.reminder && log.reminder.customer ? log.reminder.customer.vehicle_number : 'N/A';
    
    const row = [
      log._id,
      log.customer_mobile,
      log.template_name,
      log.status,
      log.sent_at ? new Date(log.sent_at).toISOString() : 'N/A',
      log.cost,
      log.provider_message_id || 'N/A',
      log.error_message || 'N/A',
      log.message_type,
      customerName,
      vehicleNumber
    ].map(field => `"${field}"`).join(',');

    csv += row + '\n';
  });

  return csv;
}