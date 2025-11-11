const Reminder = require('../models/Reminder');
const Customer = require('../models/Customer');
const MessageLog = require('../models/MessageLog');
const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const msg91Service = require('../services/msg91Service');
const mongoose = require('mongoose');

const VALID_REMINDER_TYPES = [
  'vehicle_insurance_reminder',
  'puc_certificate_reminder',
  'fitness_certificate_reminder',
  'driving_license_reminder',
  'road_tax_reminder',
  'noc_hypothecation_reminder'
];

const validateReminderData = (req, res, next) => {
  const { reminder_type, expiry_date } = req.body;

  if (reminder_type && !VALID_REMINDER_TYPES.includes(reminder_type)) {
    return res.status(400).json({
      success: false,
      message: `Invalid reminder type. Must be one of: ${VALID_REMINDER_TYPES.join(', ')}`
    });
  }

  if (expiry_date) {
    const inputDate = new Date(expiry_date);

    if (isNaN(inputDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Expiry date is invalid' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inputDateUTC = new Date(inputDate.toISOString().split('T')[0]);
    const todayUTC = new Date(today.toISOString().split('T')[0]);

    if (inputDateUTC < todayUTC) {
      return res.status(400).json({ success: false, message: 'Expiry date cannot be in the past' });
    }
  }

  next();
};

exports.createReminder = [validateReminderData, async (req, res) => {
  try {
    console.log('Incoming request body for createReminder:', req.body); // Added for debugging
    const {
      customer,
      reminder_type,
      vehicle_number,
      license_number,
      vehicle_type,
      expiry_date,
      lead_times = [30, 7, 3, 1],
      language = 'en'
    } = req.body;

    if (!customer || !reminder_type || !expiry_date) {
      console.error('Validation Error: Missing required fields (customer, reminder_type, expiry_date)'); // Added for debugging
      return res.status(400).json({
        success: false,
        message: 'Customer, reminder_type, and expiry_date are required fields'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(customer)) {
      console.error('Validation Error: Invalid customer ID format:', customer); // Added for debugging
      return res.status(400).json({ success: false, message: 'Invalid customer ID format' });
    }

    const customerExists = await Customer.findOne({
      _id: customer,
      created_by_agent: req.agent._id
    });

    if (!customerExists) {
      console.error('Validation Error: Customer not found or access denied for customer ID:', customer); // Added for debugging
      return res.status(404).json({
        success: false,
        message: 'Customer not found or you do not have permission to access this customer'
      });
    }

    if (!Array.isArray(lead_times) || lead_times.some(time => time <= 0)) {
      console.error('Validation Error: Invalid lead times:', lead_times); // Added for debugging
      return res.status(400).json({
        success: false,
        message: 'Lead times must be an array of positive numbers'
      });
    }

    const agent = await Agent.findById(req.agent._id).select('wallet_balance settings');
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }

    const perMessageCost = agent.settings?.per_message_cost || 1.0;

    if (agent.wallet_balance < perMessageCost) {
      console.error('Validation Error: Insufficient wallet balance. Current:', agent.wallet_balance, 'Required:', perMessageCost); // Added for debugging
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance to create reminder',
        data: {
          current_balance: agent.wallet_balance,
          required_balance: perMessageCost,
          needed: perMessageCost - agent.wallet_balance
        }
      });
    }

    agent.wallet_balance -= perMessageCost;
    await agent.save();

    try {
      await Transaction.create({
        agent: req.agent._id,
        type: 'reminder_creation',
        amount: -perMessageCost,
        balance_after: agent.wallet_balance,
        description: `Cost for creating reminder of type '${reminder_type}'`,
        payment_status: 'success'
      });
    } catch (transactionError) {
      console.error('Transaction creation error:', transactionError);
      agent.wallet_balance += perMessageCost;
      await agent.save();
      return res.status(400).json({
        success: false,
        message: 'Failed to record transaction for reminder creation',
        error: transactionError.message
      });
    }

    const reminderData = {
      customer,
      agent: req.agent._id,
      reminder_type,
      expiry_date: new Date(expiry_date),
      lead_times: lead_times.sort((a, b) => b - a),
      language
    };

    if (vehicle_number) reminderData.vehicle_number = vehicle_number;
    if (license_number) reminderData.license_number = license_number;
    if (vehicle_type) reminderData.vehicle_type = vehicle_type;

    const reminder = await Reminder.create(reminderData);

    await reminder.populate('customer');

    res.status(201).json({
      success: true,
      message: 'Reminder created successfully',
      data: { reminder }
    });

  } catch (error) {
    console.error('Create reminder error (catch block):', error); // Added for debugging
    if (error.name === 'ValidationError') {
      console.error('Mongoose Validation Errors:', error.errors); // Added for debugging
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to create reminder'
    });
  }
}];

exports.getReminders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filterConditions = { agent: req.agent._id };

    if (req.query.status && req.query.status !== 'all') {
      filterConditions.status = req.query.status;
    }

    if (req.query.expiry_from || req.query.expiry_to) {
      filterConditions.expiry_date = {};
      if (req.query.expiry_from) filterConditions.expiry_date.$gte = new Date(req.query.expiry_from);
      if (req.query.expiry_to) filterConditions.expiry_date.$lte = new Date(req.query.expiry_to);
    }

    if (req.query.next_send_from || req.query.next_send_to) {
      filterConditions.next_send_date = {};
      if (req.query.next_send_from) filterConditions.next_send_date.$gte = new Date(req.query.next_send_from);
      if (req.query.next_send_to) filterConditions.next_send_date.$lte = new Date(req.query.next_send_to);
    }

    const basePipeline = [
      {
        $lookup: {
          from: 'customers',
          localField: 'customer',
          foreignField: '_id',
          as: 'customer'
        }
      },
      {
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: 'agents',
          localField: 'agent',
          foreignField: '_id',
          as: 'agentInfo'
        }
      },
      {
        $unwind: {
          path: '$agentInfo',
          preserveNullAndEmptyArrays: true
        }
      }
    ];

    if (req.query.search) {
      const searchTerm = req.query.search.trim();
      if (searchTerm) {
        const searchRegex = new RegExp(searchTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        filterConditions.$or = [
          { 'customer.name': searchRegex },
          { vehicle_number: searchRegex },
          { reminder_type: searchRegex }
        ];
      }
    }

    basePipeline.push({ $match: filterConditions });

    const totalPipeline = [...basePipeline, { $count: "total" }];
    const totalResult = await Reminder.aggregate(totalPipeline).catch(err => {
      console.error("Aggregation total count error:", err);
      return [];
    });
    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    const dataPipeline = [
      ...basePipeline,
      { $sort: { next_send_date: 1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const reminders = await Reminder.aggregate(dataPipeline);

    const stats = await Reminder.aggregate([
      { $match: { agent: req.agent._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        reminders,
        statistics: stats
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        status: req.query.status,
        reminder_type: req.query.reminder_type,
        search: req.query.search,
        expiry_from: req.query.expiry_from,
        expiry_to: req.query.expiry_to
      }
    });

  } catch (error) {
    console.error('Get reminders error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      agent: req.agent._id
    })
    .populate('customer')
    .populate('agent', 'name email mobile company_name wallet_balance');

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    const messageLogs = await MessageLog.find({ reminder: reminder._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: {
        reminder,
        message_logs: messageLogs,
        messageLogs: messageLogs
      }
    });

  } catch (error) {
    console.error('Get reminder error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateReminder = [validateReminderData, async (req, res) => {
  try {
    const {
      reminder_type,
      vehicle_number,
      license_number,
      vehicle_type,
      expiry_date,
      lead_times,
      language,
      status
    } = req.body;

    let reminder = await Reminder.findOne({
      _id: req.params.id,
      agent: req.agent._id
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    const updateFields = {};
    if (reminder_type) updateFields.reminder_type = reminder_type;
    if (vehicle_number) updateFields.vehicle_number = vehicle_number;
    if (license_number) updateFields.license_number = license_number;
    if (vehicle_type) updateFields.vehicle_type = vehicle_type;
    if (expiry_date) updateFields.expiry_date = new Date(expiry_date);
    if (lead_times) updateFields.lead_times = lead_times.sort((a, b) => b - a);
    if (language) updateFields.language = language;
    if (status) updateFields.status = status;

    reminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('customer').populate('agent');

    res.json({
      success: true,
      message: 'Reminder updated successfully',
      data: { reminder }
    });

  } catch (error) {
    console.error('Update reminder error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}];

exports.deleteReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOneAndDelete({
      _id: req.params.id,
      agent: req.agent._id
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    await MessageLog.deleteMany({ reminder: req.params.id });

    res.json({
      success: true,
      message: 'Reminder deleted successfully',
      data: { reminder }
    });

  } catch (error) {
    console.error('Delete reminder error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.sendTestMessage = async (req, res) => {
  try {
    const { mobile, template_name, test_variables } = req.body;

    if (!mobile || !template_name) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number and template name are required'
      });
    }

    if (!/^\+\d{10,15}$/.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number format. Use E.164 format: +919876543210'
      });
    }

    const agent = await Agent.findById(req.agent._id);
    const messageCost = agent.settings.per_message_cost || 1.0;

    const msg91Status = await msg91Service.verifyConfiguration();
    const isSimulation = msg91Status.mode === 'simulation';

    if (!isSimulation && agent.wallet_balance < messageCost) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance to send message',
        data: {
          current_balance: agent.wallet_balance,
          required_balance: messageCost,
          needed: messageCost - agent.wallet_balance
        }
      });
    }

    const result = await msg91Service.sendTestMessage(
      mobile, 
      template_name, 
      test_variables
    );

    const messageLogData = {
      reminder: null,
      customer_mobile: mobile,
      template_name: template_name,
      variables_sent: test_variables || {},
      provider_message_id: result.provider_message_id,
      provider_response: result.provider_response,
      status: result.success ? 'SENT' : 'FAILED',
      sent_at: new Date(),
      cost: isSimulation ? 0 : messageCost,
      message_type: 'test',
      agent: req.agent._id
    };

    if (result.success) {
      let newBalance = agent.wallet_balance;
      if (!isSimulation) {
        await Agent.findByIdAndUpdate(req.agent._id, {
          $inc: { wallet_balance: -messageCost }
        });
        newBalance = agent.wallet_balance - messageCost;
      }

      try {
        const messageLog = await MessageLog.create(messageLogData);

        const responseData = {
          provider_message_id: result.provider_message_id,
          provider_response: result.provider_response,
          mode: isSimulation ? 'simulation' : 'production',
          message_log: {
            id: messageLog._id,
            status: messageLog.status,
            sent_at: messageLog.sent_at
          }
        };

        if (!isSimulation) {
          responseData.cost_deducted = messageCost;
          responseData.new_balance = newBalance;
        } else {
          responseData.note = 'No cost deducted in simulation mode';
        }

        res.json({
          success: true,
          message: isSimulation ? 
            'Test message simulated successfully (MSG91 not configured)' : 
            'Test message sent successfully to MSG91',
          data: responseData
        });

      } catch (logError) {
        console.error('MessageLog creation error:', logError);
        const responseData = {
          provider_message_id: result.provider_message_id,
          provider_response: result.provider_response,
          mode: isSimulation ? 'simulation' : 'production',
          log_error: 'Failed to create message log',
          log_error_details: logError.message
        };

        if (!isSimulation) {
          responseData.cost_deducted = messageCost;
          responseData.new_balance = agent.wallet_balance - messageCost;
        }

        res.json({
          success: true,
          message: 'Test message sent but failed to log',
          data: responseData
        });
      }

    } else {
      messageLogData.status = 'FAILED';
      messageLogData.error_message = result.error?.message || result.error;
      try {
        await MessageLog.create(messageLogData);
      } catch (logError) {
        console.error('Failed message log error:', logError);
      }

      res.status(400).json({
        success: false,
        message: 'Failed to send test message via MSG91',
        error: result.error,
        mode: msg91Status.mode,
        troubleshooting: {
          step1: 'Check MSG91_AUTH_KEY in .env file',
          step2: 'Check WABA (WhatsApp Business Account) status in MSG91 dashboard. Ensure Display Name is approved.',
          step3: 'Verify template names match exactly in MSG91 dashboard',
          step4: 'Ensure MSG91 account has sufficient balance',
          step5: 'Check if templates are approved in MSG91 dashboard',
          step6: 'Verify mobile number format and country code',
          step7: 'Check namespace configuration'
        }
      });
    }

  } catch (error) {
    console.error('Test message error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: errors.join(', ')
      });
    }

    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.bulkCreateReminders = async (req, res) => {
  try {
    const { reminders } = req.body;

    if (!reminders || !Array.isArray(reminders) || reminders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Reminders array is required and must not be empty'
      });
    }

    const validReminderTypes = [
      'vehicle_insurance_reminder',
      'puc_certificate_reminder',
      'fitness_certificate_reminder',
      'driving_license_reminder',
      'road_tax_reminder',
      'noc_hypothecation_reminder'
    ];

    const validationErrors = [];
    const validReminders = [];

    for (let i = 0; i < reminders.length; i++) {
      const reminderData = reminders[i];
      const errors = [];

      if (!reminderData.customer) errors.push('customer is required');
      if (!reminderData.reminder_type) errors.push('reminder_type is required');
      if (!reminderData.expiry_date) errors.push('expiry_date is required');

      if (reminderData.reminder_type && !validReminderTypes.includes(reminderData.reminder_type)) {
        errors.push(`reminder_type must be one of: ${validReminderTypes.join(', ')}`);
      }

      if (reminderData.expiry_date) {
        const expiryDate = new Date(reminderData.expiry_date);
        if (expiryDate <= new Date()) {
          errors.push('expiry_date must be in the future');
        }
      }

      if (reminderData.customer) {
        const customerExists = await Customer.findOne({
          _id: reminderData.customer,
          created_by_agent: req.agent._id
        });
        if (!customerExists) {
          errors.push('customer not found or access denied');
        }
      }

      if (errors.length > 0) {
        validationErrors.push({
          index: i,
          data: reminderData,
          errors: errors
        });
      } else {
        validReminders.push({
          ...reminderData,
          agent: req.agent._id,
          expiry_date: new Date(reminderData.expiry_date),
          lead_times: reminderData.lead_times || [30, 7, 3, 1],
          language: reminderData.language || 'en'
        });
      }
    }

    if (validationErrors.length === reminders.length) {
      return res.status(400).json({
        success: false,
        message: 'All reminders failed validation',
        data: { errors: validationErrors }
      });
    }

    const createdReminders = await Reminder.insertMany(validReminders);

    await Reminder.populate(createdReminders, { path: 'customer' });

    res.status(201).json({
      success: true,
      message: `Successfully created ${createdReminders.length} out of ${reminders.length} reminders`,
      data: {
        created: createdReminders.length,
        failed: validationErrors.length,
        reminders: createdReminders,
        errors: validationErrors.length > 0 ? validationErrors : undefined
      }
    });

  } catch (error) {
    console.error('Bulk create reminders error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const agentId = req.agent._id;

    const totalReminders = await Reminder.countDocuments({ agent: agentId });
    const totalCustomers = await Customer.countDocuments({ created_by_agent: agentId });
    
    const statusStats = await Reminder.aggregate([
      { $match: { agent: agentId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const typeStats = await Reminder.aggregate([
      { $match: { agent: agentId } },
      {
        $group: {
          _id: '$reminder_type',
          count: { $sum: 1 }
        }
      }
    ]);

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingReminders = await Reminder.find({
      agent: agentId,
      next_send_date: { 
        $gte: new Date(),
        $lte: nextWeek
      },
      status: 'PENDING'
    })
    .populate('customer', 'name mobile vehicle_number')
    .sort({ next_send_date: 1 })
    .limit(10);

    const recentMessages = await MessageLog.find({
      agent: agentId
    })
    .populate({
      path: 'reminder',
      populate: {
        path: 'customer',
        select: 'name mobile'
      }
    })
    .sort({ createdAt: -1 })
    .limit(10);

    const agent = await Agent.findById(agentId).select('wallet_balance settings');

    if (!agent) {
      console.error('Dashboard stats error: Agent not found for ID', agentId);
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    const perMessageCost = agent.settings?.per_message_cost || 1.0;

    res.json({
      success: true,
      data: {
        overview: {
          total_reminders: totalReminders,
          total_customers: totalCustomers,
          wallet_balance: agent.wallet_balance,
          per_message_cost: perMessageCost
        },
        statistics: {
          by_status: statusStats,
          by_type: typeStats
        },
        upcoming_reminders: upcomingReminders,
        recent_messages: recentMessages
      }
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    console.error('Dashboard stats full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to fetch dashboard statistics'
    });
  }
};

exports.sendReminderNow = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      agent: req.agent._id
    }).populate('customer').populate('agent');

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    if (reminder.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot send completed reminder'
      });
    }

    if (reminder.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot send cancelled reminder'
      });
    }

    const schedulerService = require('../services/schedulerService');

    await schedulerService.processReminder(reminder);

    const updatedReminder = await Reminder.findById(reminder._id)
      .populate('customer')
      .populate('agent');

    res.json({
      success: true,
      message: 'Reminder processing triggered',
      data: { reminder: updatedReminder }
    });

  } catch (error) {
    console.error('Send reminder now error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getExpiringSoon = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const expiringReminders = await Reminder.find({
      agent: req.agent._id,
      expiry_date: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('customer', 'name mobile vehicle_number')
    .sort({ expiry_date: 1 });

    res.json({
      success: true,
      data: {
        days_range: days,
        total_count: expiringReminders.length,
        reminders: expiringReminders
      }
    });

  } catch (error) {
    console.error('Get expiring soon error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getReminderMessages = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      agent: req.agent._id
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    const messageLogs = await MessageLog.find({ reminder: req.params.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await MessageLog.countDocuments({ reminder: req.params.id });

    res.json({
      success: true,
      data: { messageLogs },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get reminder messages error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.cancelReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findOneAndUpdate(
      {
        _id: req.params.id,
        agent: req.agent._id
      },
      {
        status: 'CANCELLED',
        next_send_date: null
      },
      { new: true }
    ).populate('customer');

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    res.json({
      success: true,
      message: 'Reminder cancelled successfully',
      data: { reminder }
    });

  } catch (error) {
    console.error('Cancel reminder error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.rescheduleReminder = async (req, res) => {
  try {
    const { expiry_date, lead_times } = req.body;

    const reminder = await Reminder.findOne({
      _id: req.params.id,
      agent: req.agent._id
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found'
      });
    }

    const updateFields = {};
    if (expiry_date) {
      const expiryDate = new Date(expiry_date);
      if (expiryDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Expiry date must be in the future'
        });
      }
      updateFields.expiry_date = expiryDate;
    }

    if (lead_times) {
      if (!Array.isArray(lead_times) || lead_times.some(time => time <= 0)) {
        return res.status(400).json({
          success: false,
          message: 'Lead times must be an array of positive numbers'
        });
      }
      updateFields.lead_times = lead_times.sort((a, b) => b - a);
    }

    updateFields.status = 'PENDING';

    const updatedReminder = await Reminder.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('customer').populate('agent');

    res.json({
      success: true,
      message: 'Reminder rescheduled successfully',
      data: { reminder: updatedReminder }
    });

  } catch (error) {
    console.error('Reschedule reminder error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
