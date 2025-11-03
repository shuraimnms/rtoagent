const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');
const cashfreeService = require('../services/cashfreeService');

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

    // Hardcoded to only use Cashfree
    const service = cashfreeService;
    const gatewayName = 'cashfree';
    const descriptionSuffix = 'via Cashfree';

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

    console.log('Payment Verification - Order ID:', orderId, 'Agent:', agent._id);

    // Get transaction by order ID
    const transaction = await Transaction.findOne({
      transaction_id: orderId,
      agent: agent._id
    });

    if (!transaction) {
      console.log('Payment Verification - Transaction not found for orderId:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    console.log('Payment Verification - Found transaction:', {
      id: transaction._id,
      current_status: transaction.payment_status,
      amount: transaction.amount
    });

    // Hardcoded to only use Cashfree
    const service = cashfreeService;

    // Check payment status with the appropriate service
    const statusResponse = await service.getOrderStatus(orderId);

    if (!statusResponse.success) {
      console.log('Payment Verification - Failed to get order status from Cashfree');
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment status'
      });
    }

    console.log('Payment Verification - Cashfree status response:', statusResponse);

    // Update transaction if status changed
    if (transaction.payment_status !== statusResponse.paymentStatus) {
      const previousStatus = transaction.payment_status;
      console.log('Payment Verification - Status changed from', previousStatus, 'to', statusResponse.paymentStatus);

      transaction.payment_status = transaction.payment_status = statusResponse.paymentStatus;
      transaction.gateway_response = statusResponse.data;

      // If payment became successful, update wallet balance
      const successStatuses = ['SUCCESS', 'success', 'PAID', 'COMPLETED'];
      if (successStatuses.includes(statusResponse.paymentStatus) && !successStatuses.includes(previousStatus)) {
        console.log('Payment Verification - Updating wallet balance for successful payment');

        const agentDoc = await Agent.findById(agent._id);
        const newBalance = agentDoc.wallet_balance + transaction.amount;

        console.log('Payment Verification - Balance calculation:', {
          current_balance: agentDoc.wallet_balance,
          amount_to_add: transaction.amount,
          new_balance: newBalance
        });

        await Agent.findByIdAndUpdate(agent._id, { wallet_balance: newBalance });
        transaction.balance_after = newBalance;

        console.log('Payment Verification - Wallet balance updated successfully');
      } else {
        console.log('Payment Verification - No balance update needed');
      }

      await transaction.save();
      console.log('Payment Verification - Transaction saved with new status');
    } else {
      console.log('Payment Verification - Status unchanged, no update needed');
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

/**
 * @desc    Manually update payment status (admin/fallback)
 * @route   POST /api/v1/pay/manual-update/:orderId
 * @access  Private (Admin only)
 */
exports.manualPaymentUpdate = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const agent = req.agent;

    console.log('Manual Payment Update - Order ID:', orderId, 'New Status:', status);

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

    const previousStatus = transaction.payment_status;

    // Update transaction status
    transaction.payment_status = status;
    transaction.gateway_response = { manual_update: true, updated_by: agent._id, updated_at: new Date() };

    // If payment became successful, update wallet balance
    const successStatuses = ['SUCCESS', 'success', 'PAID', 'COMPLETED'];
    if (successStatuses.includes(status) && !successStatuses.includes(previousStatus)) {
      const agentDoc = await Agent.findById(agent._id);
      const newBalance = agentDoc.wallet_balance + transaction.amount;

      await Agent.findByIdAndUpdate(agent._id, { wallet_balance: newBalance });
      transaction.balance_after = newBalance;

      console.log('Manual Payment Update - Balance updated to:', newBalance);
    }

    await transaction.save();

    res.json({
      success: true,
      message: `Payment status updated to ${status}`,
      data: {
        orderId,
        status: transaction.payment_status,
        amount: transaction.amount,
        balance_after: transaction.balance_after
      }
    });

  } catch (error) {
    console.error('Manual payment update error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
