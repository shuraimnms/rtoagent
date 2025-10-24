const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const Settings = require('../models/Settings');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const axios = require('axios');

/**
 * Initializes the Razorpay SDK with credentials from the database settings.
 */
async function initializeRazorpay() {
  const settings = await Settings.findOne();
  if (!settings || !settings.razorpay || !settings.razorpay.keyId || !settings.razorpay.keySecret) {
    throw new Error('Razorpay settings are not configured in the admin panel.');
  }

  const instance = new Razorpay({
    key_id: settings.razorpay.keyId,
    key_secret: settings.razorpay.keySecret,
  });

  return { instance, settings };
}

/**
 * Initializes Cashfree credentials from the database settings.
 */
async function initializeCashfree() {
  const settings = await Settings.findOne();
  if (!settings || !settings.cashfree || !settings.cashfree.appId || !settings.cashfree.secretKey) {
    throw new Error('Cashfree settings are not configured in the admin panel.');
  }

  const baseUrl = settings.cashfree.isProduction ? 'https://api.cashfree.com' : 'https://sandbox.cashfree.com';

  return {
    appId: settings.cashfree.appId,
    secretKey: settings.cashfree.secretKey,
    baseUrl,
    settings
  };
}



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
 * @desc    Create payment order for wallet topup
 * @route   POST /api/v1/billing/wallet/topup
 * @access  Private
 */
exports.createTopupOrder = async (req, res) => {
  try {
    const { amount, gateway = 'razorpay' } = req.body;

    if (!amount || amount < 99) { // amount is now in INR
      return res.status(400).json({
        success: false,
        message: 'Minimum topup amount is ₹99'
      });
    }

    const baseAmount = parseFloat(amount);
    const transactionFee = baseAmount * 0.02; // 2% transaction fee
    const gstAmount = transactionFee * 0.18; // 18% GST on the fee
    const totalAmount = parseFloat((baseAmount + transactionFee + gstAmount).toFixed(2));
    const agent = await Agent.findById(req.agent._id);

    // Check which gateway is primary or requested
    const settings = await Settings.findOne();
    const primaryGateway = settings?.paymentGateway?.primary || 'razorpay';
    const selectedGateway = gateway || primaryGateway;

    if (selectedGateway === 'razorpay') {
      const { instance, settings: razorpaySettings } = await initializeRazorpay();

      const options = {
        amount: Math.round(totalAmount * 100), // amount in the smallest currency unit (paise)
        currency: "INR",
        receipt: `rt_${req.agent._id}_${Date.now().toString(36)}`,
        notes: {
          agentId: req.agent._id.toString(),
          baseAmount: baseAmount,
          transactionFee: transactionFee,
          gstAmount: gstAmount,
        },
      };

      const order = await instance.orders.create(options);

      res.json({
        success: true,
        data: {
          gateway: 'razorpay',
          order,
          key_id: razorpaySettings.razorpay.keyId,
          base_amount: baseAmount,
          transaction_fee: transactionFee,
          gst_amount: gstAmount,
          total_amount: totalAmount,
        }
      });
    } else if (selectedGateway === 'cashfree') {
      const { appId, secretKey, baseUrl } = await initializeCashfree();

      const orderId = `CF_${req.agent._id}_${Date.now()}`;

      const orderData = {
        order_id: orderId,
        order_amount: totalAmount,
        order_currency: "INR",
        customer_details: {
          customer_id: req.agent._id.toString(),
          customer_email: req.agent.email || 'customer@example.com',
          customer_phone: req.agent.phone || '9999999999',
        },
        order_meta: {
          return_url: `${process.env.FRONTEND_URL || 'https://rtoagent.netlify.app'}/billing?order_id={order_id}&status={order_status}`,
          notify_url: `${process.env.BACKEND_URL || 'https://rto-reminder-api.onrender.com'}/api/v1/webhook/cashfree`,
        },
        order_note: `Wallet top-up for agent ${req.agent._id}`,
        order_tags: {
          agentId: req.agent._id.toString(),
          baseAmount: baseAmount.toString(),
          transactionFee: transactionFee.toString(),
          gstAmount: gstAmount.toString(),
        }
      };

      try {
        const response = await axios.post(`${baseUrl}/pg/orders`, orderData, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-version': '2023-08-01',
            'x-client-id': appId,
            'x-client-secret': secretKey,
          },
        });

        const order = response.data;

        // Use the payment_session_id from the response to construct the payment link
        const paymentLink = `${baseUrl.replace('api.', 'payments.')}/pg/${order.payment_session_id}`;

        res.json({
          success: true,
          data: {
            gateway: 'cashfree',
            order: {
              order_id: order.order_id,
              payment_link: paymentLink,
            },
            base_amount: baseAmount,
            transaction_fee: transactionFee,
            gst_amount: gstAmount,
            total_amount: totalAmount,
          }
        });
      } catch (cashfreeError) {
        console.error('Cashfree order creation error:', cashfreeError.response?.data || cashfreeError.message);
        return res.status(400).json({
          success: false,
          message: 'Failed to create Cashfree order. Please check your Cashfree settings.',
          error: cashfreeError.response?.data?.message || cashfreeError.message
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment gateway selected'
      });
    }
  } catch (error) {
    console.error('Create topup order error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Verify and process payment
 * @route   POST /api/v1/billing/wallet/topup/verify
 * @access  Private
 */
exports.verifyTopupPayment = async (req, res) => {
  try {
    const { gateway = 'razorpay', razorpay_order_id, razorpay_payment_id, razorpay_signature, base_amount, transaction_fee, gst_amount, cashfree_order_id, cashfree_payment_id } = req.body;

    if (gateway === 'razorpay') {
      const { instance } = await initializeRazorpay();

      const body = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac('sha256', instance.key_secret)
        .update(body.toString())
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed. Signature mismatch.'
        });
      }

      const paymentDetails = await instance.payments.fetch(razorpay_payment_id);

      // Update agent wallet balance
      const agent = await Agent.findByIdAndUpdate(
        req.agent._id,
        { $inc: { wallet_balance: base_amount } },
        { new: true }
      );

      // Create transaction record
      const transaction = new Transaction({
        agent: req.agent._id,
        type: 'topup',
        amount: base_amount,
        balance_after: agent.wallet_balance,
        reference_id: razorpay_payment_id,
        description: `Wallet top-up via Razorpay`,
        payment_gateway_response: paymentDetails
      });

      await transaction.save();

      // Record transaction fee and GST
      await Transaction.create([
        {
          agent: req.agent._id,
          type: 'transaction_fee',
          amount: -transaction_fee,
          balance_after: agent.wallet_balance,
          description: `Transaction fee for top-up of ₹${base_amount.toFixed(2)}`
        },
        {
          agent: req.agent._id,
          type: 'gst',
          amount: -gst_amount,
          balance_after: agent.wallet_balance,
          description: `GST on transaction fee for top-up of ₹${base_amount.toFixed(2)}`
        }
      ]);

      // Create Invoice
      const invoiceCount = await Invoice.countDocuments();
      const invoice = await Invoice.create({
        agent: req.agent._id,
        transaction: transaction._id,
        invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`,
        issueDate: new Date(),
        baseAmount: base_amount,
        transactionFee: transaction_fee,
        gstAmount: gst_amount,
        totalAmount: parseFloat((base_amount + transaction_fee + gst_amount).toFixed(2)),
        status: 'paid'
      });

      res.json({
        success: true,
        message: 'Wallet topped up successfully',
        data: {
          new_balance: agent.wallet_balance,
          transaction: transaction,
          invoice: invoice
        }
      });
    } else if (gateway === 'cashfree') {
      const { appId, secretKey, baseUrl } = await initializeCashfree();

      try {
        // Verify payment status with Cashfree
        const response = await axios.get(`${baseUrl}/pg/orders/${cashfree_order_id}`, {
          headers: {
            'Content-Type': 'application/json',
            'x-api-version': '2023-08-01',
            'x-client-id': appId,
            'x-client-secret': secretKey,
          },
        });

        const orderDetails = response.data;

        if (orderDetails.order_status !== 'PAID') {
          return res.status(400).json({
            success: false,
            message: 'Payment not completed or failed.'
          });
        }

        // Check if payment already processed
        const existingTransaction = await Transaction.findOne({
          agent: req.agent._id,
          reference_id: cashfree_payment_id || cashfree_order_id,
          type: 'topup'
        });

        if (existingTransaction) {
          return res.status(400).json({
            success: false,
            message: 'Payment already processed.'
          });
        }

        // Update agent wallet balance
        const agent = await Agent.findByIdAndUpdate(
          req.agent._id,
          { $inc: { wallet_balance: base_amount } },
          { new: true }
        );

        // Create transaction record
        const transaction = new Transaction({
          agent: req.agent._id,
          type: 'topup',
          amount: base_amount,
          balance_after: agent.wallet_balance,
          reference_id: cashfree_payment_id || cashfree_order_id,
          description: `Wallet top-up via Cashfree`,
          payment_gateway_response: orderDetails
        });

        await transaction.save();

        // Record transaction fee and GST
        await Transaction.create([
          {
            agent: req.agent._id,
            type: 'transaction_fee',
            amount: -transaction_fee,
            balance_after: agent.wallet_balance,
            description: `Transaction fee for top-up of ₹${base_amount.toFixed(2)}`
          },
          {
            agent: req.agent._id,
            type: 'gst',
            amount: -gst_amount,
            balance_after: agent.wallet_balance,
            description: `GST on transaction fee for top-up of ₹${base_amount.toFixed(2)}`
          }
        ]);

        // Create Invoice
        const invoiceCount = await Invoice.countDocuments();
        const invoice = await Invoice.create({
          agent: req.agent._id,
          transaction: transaction._id,
          invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`,
          issueDate: new Date(),
          baseAmount: base_amount,
          transactionFee: transaction_fee,
          gstAmount: gst_amount,
          totalAmount: parseFloat((base_amount + transaction_fee + gst_amount).toFixed(2)),
          status: 'paid'
        });

        res.json({
          success: true,
          message: 'Wallet topped up successfully',
          data: {
            new_balance: agent.wallet_balance,
            transaction: transaction,
            invoice: invoice
          }
        });
      } catch (cashfreeError) {
        console.error('Cashfree payment verification error:', cashfreeError.response?.data || cashfreeError.message);
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed. Please contact support if amount was debited.',
          error: cashfreeError.response?.data?.message || cashfreeError.message
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment gateway'
      });
    }
  } catch (error) {
    console.error('Verify topup payment error:', error);
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
