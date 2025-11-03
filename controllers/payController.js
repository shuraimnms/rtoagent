const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const cashfreeService = require('../services/cashfreeService');
const jojoupiService = require('../services/jojoupiService');
const razorpayService = require('../services/razorpayService');
const axios = require('axios');

/**
 * @desc    Simple pay button functionality - directly update wallet balance
 * @route   POST /api/v1/pay/add-balance
 * @access  Private
 */
exports.addBalance = async (req, res) => {
  try {
    const { amount } = req.body;
    const agent = req.agent;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get global settings for validation
    let globalSettings = await Settings.findOne();
    let minAmount = 10; // default
    let maxAmount = 10000; // default

    if (globalSettings && globalSettings.wallet) {
      minAmount = globalSettings.wallet.min_topup_amount || 10;
      maxAmount = globalSettings.wallet.max_topup_amount || 10000;
    }

    // Validate against admin settings
    if (amount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum top-up amount is ₹${minAmount}`
      });
    }

    if (amount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Maximum top-up amount is ₹${maxAmount}`
      });
    }

    // Update agent wallet balance
    const updatedAgent = await Agent.findByIdAndUpdate(
      agent._id,
      { $inc: { wallet_balance: amount } },
      { new: true }
    );

    // Create transaction record
    await Transaction.create({
      agent: agent._id,
      type: 'topup',
      amount: amount,
      balance_after: updatedAgent.wallet_balance,
      description: `Wallet topup of ₹${amount}`,
      payment_gateway: 'manual'
    });

    res.json({
      success: true,
      message: `₹${amount} added to your wallet`,
      data: {
        new_balance: updatedAgent.wallet_balance
      }
    });

  } catch (error) {
    console.error('Add balance error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get current wallet balance and settings
 * @route   GET /api/v1/pay/balance
 * @access  Private
 */
exports.getBalance = async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id).select('wallet_balance');

    // Get global wallet settings
    let globalSettings = await Settings.findOne();
    let walletSettings = {
      min_topup_amount: 10,
      max_topup_amount: 10000,
      topup_amounts: [100, 500, 1000, 2000, 5000],
      auto_topup_enabled: false,
      auto_topup_threshold: 50,
      auto_topup_amount: 500
    };

    if (globalSettings && globalSettings.wallet) {
      walletSettings = {
        min_topup_amount: globalSettings.wallet.min_topup_amount || 10,
        max_topup_amount: globalSettings.wallet.max_topup_amount || 10000,
        topup_amounts: globalSettings.wallet.topup_amounts || [100, 500, 1000, 2000, 5000],
        auto_topup_enabled: globalSettings.wallet.auto_topup_enabled || false,
        auto_topup_threshold: globalSettings.wallet.auto_topup_threshold || 50,
        auto_topup_amount: globalSettings.wallet.auto_topup_amount || 500
      };
    }

    // Check if payment integration is enabled
    let paymentEnabled = false;
    if (globalSettings && globalSettings.paymentIntegration && globalSettings.paymentIntegration.enabled) {
      paymentEnabled = true;
    }

    res.json({
      success: true,
      data: {
        balance: agent.wallet_balance,
        settings: walletSettings,
        paymentEnabled: paymentEnabled
      }
    });

  } catch (error) {
    console.error('Get balance error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get transaction history
 * @route   GET /api/v1/pay/history
 * @access  Private
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ agent: req.agent._id })
      .sort({ createdAt: -1 })
      .populate('agent', 'name email');

    res.json({
      success: true,
      data: {
        transactions: transactions.map(tx => ({
          id: tx._id,
          type: tx.type,
          amount: tx.amount,
          balance_after: tx.balance_after,
          description: tx.description,
          transaction_id: tx.transaction_id,
          payment_gateway: tx.payment_gateway,
          createdAt: tx.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Initiate wallet top-up (normal or payment gateway)
 * @route   POST /api/v1/pay/topup
 * @access  Private
 */
exports.initiateTopup = async (req, res) => {
  try {
    const { amount } = req.body;
    const agent = req.agent;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get global settings
    const globalSettings = await Settings.findOne();

    // Check if payment integration is enabled
    const paymentIntegrationEnabled = globalSettings?.paymentIntegration?.enabled || false;

    if (!paymentIntegrationEnabled) {
      // Normal top-up mode
      return await handleNormalTopup(amount, agent, globalSettings, res);
    } else {
      // Payment gateway mode
      return await handlePaymentGatewayTopup(amount, agent, globalSettings, res);
    }

  } catch (error) {
    console.error('Topup initiation error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Handle normal wallet top-up (manual credit)
 */
async function handleNormalTopup(amount, agent, globalSettings, res) {
  // Validate amount against settings
  let minAmount = 10;
  let maxAmount = 10000;

  if (globalSettings && globalSettings.wallet) {
    minAmount = globalSettings.wallet.min_topup_amount || 10;
    maxAmount = globalSettings.wallet.max_topup_amount || 10000;
  }

  if (amount < minAmount) {
    return res.status(400).json({
      success: false,
      message: `Minimum top-up amount is ₹${minAmount}`
    });
  }

  if (amount > maxAmount) {
    return res.status(400).json({
      success: false,
      message: `Maximum top-up amount is ₹${maxAmount}`
    });
  }

  // Update agent wallet balance
  const updatedAgent = await Agent.findByIdAndUpdate(
    agent._id,
    { $inc: { wallet_balance: amount } },
    { new: true }
  );

  // Create transaction record
  await Transaction.create({
    agent: agent._id,
    type: 'topup',
    amount: amount,
    balance_after: updatedAgent.wallet_balance,
    description: `Wallet topup of ₹${amount}`,
    payment_gateway: 'manual',
    payment_status: 'success'
  });

  res.json({
    success: true,
    message: `₹${amount} added to your wallet`,
    data: {
      new_balance: updatedAgent.wallet_balance,
      mode: 'normal'
    }
  });
}

/**
 * Handle payment gateway top-up (dynamic based on primary gateway)
 */
async function handlePaymentGatewayTopup(amount, agent, globalSettings, res) {
  try {
    // Validate amount against settings
    let minAmount = 10;
    let maxAmount = 10000;

    if (globalSettings && globalSettings.wallet) {
      minAmount = globalSettings.wallet.min_topup_amount || 10;
      maxAmount = globalSettings.wallet.max_topup_amount || 10000;
    }

    if (amount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum top-up amount is ₹${minAmount}`
      });
    }

    if (amount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Maximum top-up amount is ₹${maxAmount}`
      });
    }

    // Get primary payment gateway
    const primaryGateway = globalSettings?.paymentGateway?.primary || 'cashfree';

    let service, gatewayName, descriptionSuffix;
    switch (primaryGateway) {
      case 'cashfree':
        service = cashfreeService;
        gatewayName = 'cashfree';
        descriptionSuffix = 'via Cashfree';
        break;
      case 'jojoupi':
      case 'jojoUpi':
        service = jojoupiService;
        gatewayName = 'jojoupi';
        descriptionSuffix = 'via JojoUPI';
        break;
      case 'razorpay':
        service = razorpayService;
        gatewayName = 'razorpay';
        descriptionSuffix = 'via Razorpay';
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported payment gateway'
        });
    }

    // Generate order ID
    const orderId = service.generateOrderId();

    // Create order data
    const orderData = {
      orderId,
      orderAmount: amount,
      customerDetails: {
        customerId: agent._id.toString(),
        email: agent.email,
        phone: agent.mobile,
        name: agent.name
      },
      orderMeta: {
        source: 'wallet_topup'
      }
    };

    const response = await service.createOrder(orderData);

    if (!response.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to create payment order',
        error: response.error
      });
    }

    // Create pending transaction record
    await Transaction.create({
      agent: agent._id,
      type: 'topup',
      amount: amount,
      balance_after: agent.wallet_balance, // Will be updated on success
      description: `Wallet topup of ₹${amount} ${descriptionSuffix}`,
      transaction_id: orderId,
      payment_gateway: gatewayName,
      payment_status: 'pending',
      gateway_response: response.data
    });

    res.json({
      success: true,
      message: 'Payment order created successfully',
      data: {
        orderId: response.orderId,
        paymentLink: response.paymentLink,
        paymentSessionId: response.paymentSessionId,
        mode: 'payment_gateway'
      }
    });

  } catch (error) {
    console.error('Payment gateway topup error:', error);
    res.status(400).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.message
    });
  }
}

/**
 * @desc    Verify payment status (for payment gateway mode)
 * @route   GET /api/v1/pay/verify-payment/:orderId
 * @access  Private
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const agent = req.agent;

    // Get transaction by order ID
    const transaction = await Transaction.findOne({
      transaction_id: orderId,
      agent: agent._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Get primary payment gateway from settings
    const globalSettings = await Settings.findOne();
    const primaryGateway = globalSettings?.paymentGateway?.primary || 'cashfree';

    let service;
    switch (primaryGateway) {
      case 'cashfree':
        service = cashfreeService;
        break;
      case 'jojoupi':
      case 'jojoUpi':
        service = jojoupiService;
        break;
      case 'razorpay':
        service = razorpayService;
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Unsupported payment gateway'
        });
    }

    // Check payment status with the appropriate service
    const statusResponse = await service.getOrderStatus(orderId);

    if (!statusResponse.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment status'
      });
    }

    // Update transaction if status changed
    if (transaction.payment_status !== statusResponse.paymentStatus) {
      transaction.payment_status = statusResponse.paymentStatus;
      transaction.gateway_response = statusResponse.data;

      // If payment successful, update wallet balance
      if (statusResponse.paymentStatus === 'success' && transaction.payment_status !== 'success') {
        const agentDoc = await Agent.findById(agent._id);
        const newBalance = agentDoc.wallet_balance + transaction.amount;

        await Agent.findByIdAndUpdate(agent._id, { wallet_balance: newBalance });
        transaction.balance_after = newBalance;
      }

      await transaction.save();
    }

    res.json({
      success: true,
      data: {
        orderId,
        status: transaction.payment_status,
        amount: transaction.amount,
        balance_after: transaction.balance_after
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
