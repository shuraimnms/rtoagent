const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');



/**
 * @desc    Get agent wallet balance
 * @route   GET /api/v1/billing/wallet/balance
 * @access  Private
 */
exports.getWalletBalance = async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id).select('wallet_balance');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data: {
        balance: agent.wallet_balance,
        currency: 'INR'
      }
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get transaction history
 * @route   GET /api/v1/billing/transactions
 * @access  Private
 */
exports.getTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = { agent: req.agent._id };

    // Add optional filters
    if (req.query.type) filter.type = req.query.type;

    // Date range filters
    if (req.query.date_from || req.query.date_to) {
      filter.createdAt = {};
      if (req.query.date_from) filter.createdAt.$gte = new Date(req.query.date_from);
      if (req.query.date_to) filter.createdAt.$lte = new Date(req.query.date_to);
    }

    // Get transactions with pagination
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const total = await Transaction.countDocuments(filter);

    // Get summary statistics
    const stats = await Transaction.aggregate([
      { $match: { agent: req.agent._id } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          total_amount: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        statistics: stats,
        summary: {
          total_transactions: total,
          total_credited: stats.find(s => s._id === 'topup')?.total_amount || 0,
          total_debited: stats.find(s => s._id === 'message_deduction')?.total_amount || 0
        }
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Create payment order using JojoUPI
 * @route   POST /api/v1/billing/wallet/topup
 * @access  Private
 */
exports.createTopupOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Minimum topup amount is ₹1'
      });
    }

    const topupAmount = parseFloat(amount);

    // Get settings
    const settings = await require('../models/Settings').findOne();
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: 'Payment gateway not configured'
      });
    }

    if (!settings.jojoUpi?.enabled || !settings.jojoUpi?.apiKey) {
      return res.status(400).json({
        success: false,
        message: 'JojoUPI not configured'
      });
    }

    // Generate unique order ID
    const orderId = `TOPUP_${Date.now()}_${req.agent._id}`;

    // Create transaction record (pending)
    const transaction = new Transaction({
      agent: req.agent._id,
      type: 'topup',
      amount: topupAmount,
      orderId: orderId,
      status: 'pending',
      description: `Wallet top-up of ₹${topupAmount.toFixed(2)}`,
      gateway: 'jojoupi'
    });

    await transaction.save();

    // Prepare JojoUPI payment request
    const paymentData = {
      api_key: settings.jojoUpi.apiKey,
      orderid: orderId,
      amount: topupAmount.toFixed(2),
      user: req.agent.email || req.agent._id,
      callback_url: settings.jojoUpi.callbackUrl
    };

    // Make request to JojoUPI API
    const axios = require('axios');
    const response = await axios.post(`${settings.jojoUpi.apiUrl}/create-payment`, paymentData);

    if (response.data.success) {
      res.json({
        success: true,
        message: 'Payment order created successfully',
        data: {
          orderId: orderId,
          gateway: 'jojoupi',
          paymentUrl: response.data.payment_url,
          amount: topupAmount
        }
      });
    } else {
      // Delete pending transaction if payment creation failed
      await Transaction.findByIdAndDelete(transaction._id);
      res.status(400).json({
        success: false,
        message: 'Failed to create payment order'
      });
    }
  } catch (error) {
    console.error('Topup error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};



/**
 * @desc    Get all invoices for an agent
 * @route   GET /api/v1/billing/invoices
 * @access  Private
 */
exports.getInvoices = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const invoices = await Invoice.find({ agent: req.agent._id })
      .sort({ issueDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Invoice.countDocuments({ agent: req.agent._id });

    res.json({
      success: true,
      data: { invoices },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get a single invoice by ID
 * @route   GET /api/v1/billing/invoices/:id
 * @access  Private
 */
exports.getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      agent: req.agent._id
    }).populate('agent', 'name email company_name');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    res.json({
      success: true,
      data: { invoice }
    });
  } catch (error) {
    console.error('Get invoice by ID error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get billing analytics
 * @route   GET /api/v1/billing/analytics
 * @access  Private
 */
exports.getBillingAnalytics = async (req, res) => {
  try {
    const agentId = req.agent._id;
    const days = parseInt(req.query.days) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get spending by month
    const monthlySpending = await Transaction.aggregate([
      {
        $match: {
          agent: agentId,
          type: 'message_deduction',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m',
              date: '$createdAt'
            }
          },
          total_spent: { $sum: '$amount' },
          transaction_count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get topup history
    const topupHistory = await Transaction.find({
      agent: agentId,
      type: 'topup',
      createdAt: { $gte: startDate }
    }).sort({ createdAt: -1 });

    // Get current balance
    const agent = await Agent.findById(agentId).select('wallet_balance');

    res.json({
      success: true,
      data: {
        current_balance: agent.wallet_balance,
        period: {
          days: days,
          start_date: startDate,
          end_date: new Date()
        },
        monthly_spending: monthlySpending,
        topup_history: topupHistory,
        summary: {
          total_spent: monthlySpending.reduce((sum, month) => sum + month.total_spent, 0),
          total_topups: topupHistory.reduce((sum, topup) => sum + topup.amount, 0),
          average_monthly_spend: monthlySpending.length > 0 ?
            monthlySpending.reduce((sum, month) => sum + month.total_spent, 0) / monthlySpending.length : 0
        }
      }
    });
  } catch (error) {
    console.error('Get billing analytics error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
