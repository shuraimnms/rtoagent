const Agent = require('../models/Agent');
const Customer = require('../models/Customer');
const Reminder = require('../models/Reminder');
const MessageLog = require('../models/MessageLog');
const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const Transaction = require('../models/Transaction');
const FraudAlert = require('../models/FraudAlert');

// Agent Management Functions
exports.getAllAgents = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let query = {};

    // Add filters
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { mobile: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const agents = await Agent.find(query)
      .select('-password')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Agent.countDocuments(query);

    res.json({
      success: true,
      data: {
        agents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all agents error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.createAgent = async (req, res) => {
  try {
    const { name, email, mobile, password } = req.body;

    // Check if agent already exists
    const existingAgent = await Agent.findOne({ $or: [{ email }, { mobile }] });
    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Agent with this email or mobile already exists'
      });
    }

    const agent = await Agent.create({
      name,
      email,
      mobile,
      password,
      role: 'agent'
    });

    res.status(201).json({
      success: true,
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          email: agent.email,
          mobile: agent.mobile,
          wallet_balance: agent.wallet_balance,
          createdAt: agent.createdAt
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAgentDetails = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).select('-password');
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data: { agent }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-password');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data: { agent }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Advanced Analytics Functions
exports.getAdvancedAnalytics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // User growth trends (agents and customers)
    const agentGrowth = await Agent.aggregate([
      { $match: { createdAt: { $gte: ninetyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const customerGrowth = await Customer.aggregate([
      { $match: { createdAt: { $gte: ninetyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Revenue projections (simple linear trend)
    const revenueHistory = await Transaction.aggregate([
      { $match: { createdAt: { $gte: ninetyDaysAgo }, type: 'topup' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Customer acquisition metrics
    const customerAcquisition = await Customer.aggregate([
      { $match: { createdAt: { $gte: ninetyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        agentGrowth,
        customerGrowth,
        revenueHistory,
        customerAcquisition
      }
    });
  } catch (error) {
    console.error('Advanced analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch advanced analytics' });
  }
};

// System Performance Monitoring
exports.getSystemPerformance = async (req, res) => {
  try {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // API response times (simulated - in real app, you'd track this)
    const apiResponseTimes = {
      average: 245, // ms
      p95: 450,
      p99: 800,
      trend: 'stable'
    };

    // Error rates
    const totalMessages = await MessageLog.countDocuments({ createdAt: { $gte: last24Hours } });
    const failedMessages = await MessageLog.countDocuments({
      createdAt: { $gte: last24Hours },
      status: { $in: ['FAILED', 'ERROR'] }
    });
    const errorRate = totalMessages > 0 ? (failedMessages / totalMessages) * 100 : 0;

    // Service uptime (simulated)
    const uptime = {
      overall: 99.8,
      last24h: 100,
      last7d: 99.9,
      last30d: 99.8
    };

    // Active services status
    const services = [
      { name: 'MSG91 Service', status: 'operational', uptime: 99.9 },
      { name: 'Database', status: 'operational', uptime: 99.95 },
      { name: 'Payment Gateway', status: 'operational', uptime: 99.7 },
      { name: 'Scheduler', status: 'operational', uptime: 100 }
    ];

    res.json({
      success: true,
      data: {
        apiResponseTimes,
        errorRate,
        uptime,
        services
      }
    });
  } catch (error) {
    console.error('System performance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system performance data' });
  }
};

// Security Insights
exports.getSecurityInsights = async (req, res) => {
  try {
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Failed login attempts (simulated - would need auth logs)
    const failedLogins = await AuditLog.countDocuments({
      action: 'LOGIN_FAILED',
      timestamp: { $gte: last7Days }
    });

    // Suspicious activities
    const suspiciousActivities = await FraudAlert.countDocuments({
      createdAt: { $gte: last7Days },
      status: 'active'
    });

    // Security alerts
    const securityAlerts = await AuditLog.find({
      action: { $in: ['UNAUTHORIZED_ACCESS', 'SUSPICIOUS_ACTIVITY', 'SECURITY_BREACH'] },
      timestamp: { $gte: last7Days }
    }).sort({ timestamp: -1 }).limit(10);

    res.json({
      success: true,
      data: {
        failedLogins,
        suspiciousActivities,
        securityAlerts: securityAlerts.map(alert => ({
          id: alert._id,
          type: alert.action,
          description: alert.details || 'Security event detected',
          timestamp: alert.timestamp,
          severity: alert.severity || 'medium'
        }))
      }
    });
  } catch (error) {
    console.error('Security insights error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch security insights' });
  }
};

// Update agent wallet
exports.updateAgentWallet = async (req, res) => {
  try {
    const { amount, type, description } = req.body;

    const agent = await Agent.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    let newBalance;
    if (type === 'add') {
      newBalance = agent.wallet_balance + amount;
    } else if (type === 'subtract') {
      newBalance = Math.max(0, agent.wallet_balance - amount);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Use "add" or "subtract"'
      });
    }

    // Update agent balance
    agent.wallet_balance = newBalance;
    await agent.save();

    // Create transaction record
    await Transaction.create({
      agent: agent._id,
      type: type === 'add' ? 'topup' : 'message_deduction',
      amount: type === 'add' ? amount : -amount,
      balance_after: newBalance,
      description: description || `Admin ${type === 'add' ? 'credited' : 'debited'} ₹${amount}`
    });

    res.json({
      success: true,
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          wallet_balance: agent.wallet_balance
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Delete agent
exports.deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Delete all related data
    await Promise.all([
      Customer.deleteMany({ created_by_agent: agent._id }),
      Reminder.deleteMany({ agent: agent._id }),
      MessageLog.deleteMany({ agent: agent._id }),
      Transaction.deleteMany({ agent: agent._id })
    ]);

    await Agent.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Agent and all related data deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get all customers across all agents
exports.getAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = {};

    // Add filters
    if (req.query.agent && req.query.agent !== 'all') {
      query.created_by_agent = req.query.agent;
    }

    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { mobile: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { vehicle_number: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const customers = await Customer.find(query)
      .populate('created_by_agent', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Customer.countDocuments(query);

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Update a specific customer (by admin)
exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: { customer }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Delete a specific customer (by admin)
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Delete all related reminders and messages
    await Reminder.deleteMany({ customer: customer._id });
    await MessageLog.deleteMany({ customer: customer._id });

    await Customer.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Customer and all related data deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get all reminders across all agents
exports.getAllReminders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reminders = await Reminder.find()
      .populate('customer')
      .populate('agent', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Reminder.countDocuments();

    res.json({
      success: true,
      data: { reminders },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get all messages across all agents
exports.getAllMessages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let query = {};

    // Add filters
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    if (req.query.agent && req.query.agent !== 'all') {
      query.agent = req.query.agent;
    }

    if (req.query.search) {
      query.$or = [
        { customer_mobile: { $regex: req.query.search, $options: 'i' } },
        { template_name: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const messages = await MessageLog.find(query)
      .populate('reminder')
      .populate('agent', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await MessageLog.countDocuments(query);

    res.json({
      success: true,
      data: { messages, totalPages: Math.ceil(total / limit) },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Export messages to CSV
exports.exportMessages = async (req, res) => {
  try {
    let query = {};

    // Add filters
    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    if (req.query.agent && req.query.agent !== 'all') {
      query.agent = req.query.agent;
    }

    if (req.query.search) {
      query.$or = [
        { customer_mobile: { $regex: req.query.search, $options: 'i' } },
        { template_name: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const messages = await MessageLog.find(query)
      .populate('agent', 'name email')
      .sort({ createdAt: -1 });

    // Create CSV content
    const csvHeaders = 'Date,Agent,Mobile,Template,Status,Cost,Error\n';
    const csvRows = messages.map(msg => {
      const date = new Date(msg.sent_at).toLocaleString('en-IN');
      const agent = msg.agent?.name || 'N/A';
      const mobile = msg.customer_mobile;
      const template = msg.template_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const status = msg.status;
      const cost = msg.cost || 0;
      const error = msg.error_message || '';

      return `"${date}","${agent}","${mobile}","${template}","${status}","${cost}","${error}"`;
    }).join('\n');

    const csvContent = csvHeaders + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="messages_export.csv"');
    res.send(csvContent);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get all transactions across all agents
exports.getAllTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find()
      .populate('agent', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Transaction.countDocuments();

    res.json({
      success: true,
      data: { transactions },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Update global settings (MSG91 keys, pricing, etc.)
exports.updateGlobalSettings = async (req, res) => {
  try {
    console.log('=== Update Global Settings Request ===');
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    
    const { msg91, pricing, system, wallet } = req.body;

    // Find existing settings or create new ones
    let settings = await Settings.findOne();
    if (!settings) {
      console.log('No existing settings found, creating new one');
      settings = new Settings();
    }

    // Validate wallet settings if provided
    if (wallet) {
      const validationErrors = [];
      const fieldsToValidate = [
        'min_topup_amount', 'max_topup_amount', 'daily_topup_limit',
        'monthly_topup_limit', 'auto_topup_threshold', 'auto_topup_amount'
      ];

      fieldsToValidate.forEach(field => {
        if (wallet[field] !== undefined && wallet[field] !== null) {
          if (typeof wallet[field] !== 'number' || isNaN(wallet[field]) || wallet[field] < 0) {
            validationErrors.push(`${field.replace(/_/g, ' ')} must be a valid non-negative number.`);
          }
        }
      });

      const min = wallet.min_topup_amount;
      const max = wallet.max_topup_amount;
      if (min !== undefined && min !== null && max !== undefined && max !== null && min > max) {
        validationErrors.push('Minimum top-up amount cannot be greater than maximum top-up amount.');
      }

      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Wallet settings validation failed.',
          errors: validationErrors
        });
      }
    }

    // Update MSG91 settings
    if (msg91) {
      settings.msg91 = {
        authKey: msg91.authKey || settings.msg91?.authKey || '',
        senderId: msg91.senderId || settings.msg91?.senderId || '',
        flows: msg91.flows || settings.msg91?.flows || {}
      };
    }

    // Update pricing settings
    if (pricing) {
      if (pricing.perMessageCost !== undefined && (typeof pricing.perMessageCost !== 'number' || pricing.perMessageCost < 0)) {
        return res.status(400).json({
          success: false,
          message: 'Per message cost must be a valid non-negative number.'
        });
      }
      settings.pricing = {
        perMessageCost: pricing.perMessageCost,
        currency: pricing.currency || 'INR'
      };
      // Update all agents' pricing settings
      await Agent.updateMany({}, {
        $set: {
          'settings.per_message_cost': pricing.perMessageCost,
          'settings.currency': pricing.currency || 'INR'
        }
      });
    }

    // Update wallet settings
    if (wallet) {
      settings.wallet = {
        min_topup_amount: wallet.min_topup_amount ?? 10,
        max_topup_amount: wallet.max_topup_amount ?? 10000,
        topup_amounts: wallet.topup_amounts ?? [100, 500, 1000, 2000, 5000],
        auto_topup_enabled: wallet.auto_topup_enabled ?? false,
        auto_topup_threshold: wallet.auto_topup_threshold ?? 50,
        auto_topup_amount: wallet.auto_topup_amount ?? 500,
        daily_topup_limit: wallet.daily_topup_limit ?? 5000,
        monthly_topup_limit: wallet.monthly_topup_limit ?? 25000
      };

      // Update all agents' wallet settings
      await Agent.updateMany({}, {
        $set: {
          'settings.wallet': settings.wallet
        }
      });
    }

    // Update system settings
    if (system) {
      settings.system = {
        maxRetries: system.maxRetries,
        schedulerInterval: system.schedulerInterval
      };
    }

        await settings.save();
    console.log('Settings saved successfully');

    res.json({
      success: true,
      message: 'Global settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating global settings:', error);
    console.error('Error stack:', error.stack);
    
    // Check if it's a validation error
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update settings'
    });
  }
};

// Get global settings
exports.getGlobalSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();

    // If no settings exist, create default ones
    if (!settings) {
      settings = new Settings({
        msg91: {
          authKey: process.env.MSG91_AUTH_KEY || '',
          senderId: process.env.MSG91_SENDER_ID || '',
          flows: {
            drivingLicense: process.env.MSG91_FLOW_DRIVING_LICENSE || '',
            fitnessCertificate: process.env.MSG91_FLOW_FITNESS || '',
            nocHypothecation: process.env.MSG91_FLOW_NOC || '',
            pucCertificate: process.env.MSG91_FLOW_PUC || '',
            roadTax: process.env.MSG91_FLOW_ROAD_TAX || '',
            vehicleInsurance: process.env.MSG91_FLOW_INSURANCE || ''
          }
        },
        pricing: {
          perMessageCost: 1.0,
          currency: 'INR'
        },
        system: {
          maxRetries: 3,
          schedulerInterval: 5
        }
      });
      await settings.save();
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get admin dashboard stats
exports.getDashboardStats = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(new Date().setDate(new Date().getDate() - 30));

    const [
      totalAgents,
      totalCustomers,
      totalReminders,
      totalMessages,
      totalRevenue,
      recentAgents,
      recentTransactions
    ] = await Promise.all([
      Agent.countDocuments(),
      Customer.countDocuments(),
      Reminder.countDocuments(),
      MessageLog.countDocuments(),
      Transaction.aggregate([
        { $match: { type: 'topup' } }, // Revenue should be from topups
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Agent.find().sort({ createdAt: -1 }).limit(5).select('name email createdAt'),
      Transaction.find().populate('agent', 'name').sort({ createdAt: -1 }).limit(10)
    ]);

    // Get message status breakdown
    const messageStats = await MessageLog.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get reminder status breakdown
    const reminderStats = await Reminder.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get messages per day for the last 30 days
    const messagesPerDay = await MessageLog.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', count: 1, _id: 0 } }
    ]);

    // Get wallet usage stats per day (daily net usage)
    const walletUsageData = await Transaction.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          credits: {
            $sum: {
              $cond: [{ $eq: ['$type', 'topup'] }, '$amount', 0]
            }
          },
          debits: {
            $sum: {
              $cond: [{ $eq: ['$type', 'message_deduction'] }, { $abs: '$amount' }, 0]
            }
          }
        }
      },
      {
        $project: {
          date: '$_id',
          usage: { $subtract: ['$credits', '$debits'] },
          _id: 0
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Get recent activity from AuditLog
    const activityData = await AuditLog.find()
      .populate('performedBy', 'name')
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();
    
    const formattedActivity = activityData
      ? activityData.map(log => ({
          description: `${log.performedBy?.name || 'System'} performed ${log.action} on ${log.entityType}`,
          timestamp: new Date(log.timestamp).toLocaleString()
        }))
      : [];

    // Wallet usage for the last 30 days (credits vs debits)
    const successRateTrend = await Promise.all(
      messagesPerDay.map(async (day) => {
        const dayStart = new Date(day.date + 'T00:00:00.000Z');
        const dayEnd = new Date(day.date + 'T23:59:59.999Z');

        const totalMessages = await MessageLog.countDocuments({
          createdAt: { $gte: dayStart, $lte: dayEnd }
        });

        const successfulMessages = await MessageLog.countDocuments({
          createdAt: { $gte: dayStart, $lte: dayEnd },
          status: 'DELIVERED'
        });

        const rate = totalMessages > 0 ? (successfulMessages / totalMessages) * 100 : 0;

        return {
          date: day.date,
          rate: Math.round(rate * 100) / 100 // Round to 2 decimal places
        };
      })
    );
    
    const walletStats = await Transaction.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: null,
          credits: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
          debits: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } },
        },
      },
      { $project: { _id: 0, credits: 1, debits: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalAgents,
          totalCustomers,
          totalReminders,
          totalMessages,
          totalRevenue: totalRevenue[0] ? totalRevenue[0].total : 0,
        },
        messageStats: messageStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        reminderStats: reminderStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        recentAgents,
        recentTransactions,
        messagesPerDay,
        walletUsageData,
        walletStats: walletStats[0] || { credits: 0, debits: 0 },
        activityData: formattedActivity,
        successRateTrend,
      },
    });
  } catch (error) {
    console.error('Admin Dashboard Stats Error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Verify MSG91 configuration
 * @route   GET /api/v1/admin/settings/verify-msg91
 * @access  Private (Admin)
 */
exports.verifyMSG91Config = async (req, res) => {
  try {
    const msg91Service = require('../services/msg91Service');
    const verificationResult = await msg91Service.verifyConfiguration();

    res.json({
      success: true,
      message: 'MSG91 configuration status retrieved.',
      data: verificationResult
    });

  } catch (error) {
    console.error('MSG91 verification error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify MSG91 configuration' });
  }
};

/**
 * @desc    Reset all wallet usage data
 * @route   POST /api/v1/admin/reset/wallet-usage
 * @access  Private (Admin)
 */
exports.resetWalletUsage = async (req, res) => {
  try {
    // This is a destructive operation.
    // It will delete all transactions that are not 'topup'.
    await Transaction.deleteMany({ type: { $ne: 'topup' } });

    // Reset all agent wallet balances to 0
    await Agent.updateMany({}, { $set: { wallet_balance: 0 } });

    res.json({
      success: true,
      message: 'All wallet usage data has been reset. Balances are now 0.'
    });
  } catch (error) {
    console.error('Reset wallet usage error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset wallet usage data' });
  }
};

/**
 * @desc    Reset total revenue data
 * @route   POST /api/v1/admin/reset/total-revenue
 * @access  Private (Admin)
 */
exports.resetTotalRevenue = async (req, res) => {
  try {
    // This is a destructive operation.
    // It will delete all 'topup' transactions.
    await Transaction.deleteMany({ type: 'topup' });

    res.json({
      success: true,
      message: 'Total revenue data has been reset.'
    });
  } catch (error) {
    console.error('Reset total revenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset total revenue data' });
  }
};

/**
 * @desc    Get wallet usage analytics for the last 30 days
 * @route   GET /api/v1/admin/analytics/wallet-usage
 * @access  Private (Admin)
 */
exports.getWalletUsageAnalytics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const walletUsage = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          amount: { $lt: 0 } // Only consider debits/usage
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          dailyUsage: { $sum: { $abs: '$amount' } } // Sum of absolute debits
        }
      },
      { $sort: { _id: 1 } }
    ]);

    let totalUsage = 0;
    let peakUsage = 0;
    let peakDay = 'N/A';

    walletUsage.forEach(day => {
      totalUsage += day.dailyUsage;
      if (day.dailyUsage > peakUsage) {
        peakUsage = day.dailyUsage;
        peakDay = day._id;
      }
    });

    const averageDailyUsage = walletUsage.length > 0 ? totalUsage / walletUsage.length : 0;

    res.json({
      success: true,
      data: {
        totalUsage: Math.round(totalUsage),
        averageDaily: Math.round(averageDailyUsage),
        peakDay: peakDay,
        dailyData: walletUsage // Optionally return daily breakdown
      }
    });
  } catch (error) {
    console.error('Get wallet usage analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch wallet usage analytics' });
  }
};

/**
 * @desc    Get revenue analytics for the last 30 days
 * @route   GET /api/v1/admin/analytics/revenue
 * @access  Private (Admin)
 */
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const revenueData = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          type: 'topup' // Only consider topups as revenue
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          dailyRevenue: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    let totalRevenue = 0;
    let peakRevenue = 0;
    let peakDay = 'N/A';

    revenueData.forEach(day => {
      totalRevenue += day.dailyRevenue;
      if (day.dailyRevenue > peakRevenue) {
        peakRevenue = day.dailyRevenue;
        peakDay = day._id;
      }
    });

    const averageDailyRevenue = revenueData.length > 0 ? totalRevenue / revenueData.length : 0;

    res.json({
      success: true,
      data: {
        totalRevenue: Math.round(totalRevenue),
        averageDaily: Math.round(averageDailyRevenue),
        peakDay: peakDay,
        dailyData: revenueData // Optionally return daily breakdown
      }
    });
  } catch (error) {
    console.error('Get revenue analytics error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue analytics' });
  }
};

/**
 * @desc    Export wallet usage data to CSV
 * @route   GET /api/v1/admin/export/wallet-usage
 * @access  Private (Admin)
 */
exports.exportWalletUsage = async (req, res) => {
  try {
    const transactions = await Transaction.find({ amount: { $lt: 0 } }) // Only debits
      .populate('agent', 'name email')
      .sort({ createdAt: -1 });

    const csvHeaders = 'Date,Agent Name,Agent Email,Description,Amount,Balance After\n';
    const csvRows = transactions.map(tx => {
      const date = new Date(tx.createdAt).toLocaleString('en-IN');
      const agentName = tx.agent?.name || 'N/A';
      const agentEmail = tx.agent?.email || 'N/A';
      const description = tx.description || '';
      const amount = tx.amount;
      const balanceAfter = tx.balance_after;

      return `"${date}","${agentName}","${agentEmail}","${description}","${amount}","${balanceAfter}"`;
    }).join('\n');

    const csvContent = csvHeaders + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="wallet_usage_export.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Export wallet usage error:', error);
    res.status(500).json({ success: false, message: 'Failed to export wallet usage data' });
  }
};

/**
 * @desc    Export revenue data to CSV
 * @route   GET /api/v1/admin/export/revenue
 * @access  Private (Admin)
 */
exports.exportRevenue = async (req, res) => {
  try {
    const transactions = await Transaction.find({ type: 'topup' }) 
      .populate('agent', 'name email')
      .sort({ createdAt: -1 });

    const csvHeaders = 'Date,Agent Name,Agent Email,Description,Amount,Transaction ID\n';
    const csvRows = transactions.map(tx => {
      const date = new Date(tx.createdAt).toLocaleString('en-IN');
      const agentName = tx.agent?.name || 'N/A';
      const agentEmail = tx.agent?.email || 'N/A';
      const description = tx.description || 'Top-up';
      const amount = tx.amount;
      const transactionId = tx.transaction_id || 'N/A';

      return `"${date}","${agentName}","${agentEmail}","${description}","${amount}","${transactionId}"`;
    }).join('\n');

    const csvContent = csvHeaders + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue_export.csv"');
    res.send(csvContent);
  } catch (error) {
    console.error('Export revenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to export revenue data' });
  }
};
