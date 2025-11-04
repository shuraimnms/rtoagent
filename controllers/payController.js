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

    console.log('🔍 Payment Verification - Starting for order:', orderId);

    // Find transaction
    const transaction = await Transaction.findOne({
      transaction_id: orderId,
      agent: agent._id
    });

    if (!transaction) {
      console.log('❌ Payment Verification - Transaction not found');
      console.error('❌ Payment Verification - Transaction not found for orderId:', orderId, 'agent:', agent._id);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    console.log('✅ Payment Verification - Transaction found:', {
      status: transaction.payment_status,
      amount: transaction.amount,
      balanceAfter: transaction.balance_after
    });

    // Check with Cashfree API
    const statusResponse = await cashfreeService.getOrderStatus(orderId);

    if (!statusResponse.success) {
      console.log('❌ Payment Verification - Failed to get status from Cashfree');
      console.error('❌ Payment Verification - Cashfree API error:', statusResponse.error);
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment status'
      });
    }

    console.log('📊 Payment Verification - Cashfree response:', {
      orderStatus: statusResponse.orderStatus,
      paymentStatus: statusResponse.paymentStatus
    });

    const currentStatus = transaction.payment_status;
    let newStatus = statusResponse.paymentStatus;

    // Map UNKNOWN to a valid status
    if (newStatus === 'UNKNOWN') {
      newStatus = 'pending';
    }

    // Update if status changed
    if (currentStatus !== newStatus) {
      console.log('🔄 Payment Verification - Status changed:', currentStatus, '→', newStatus);

      // Skip validation for this update to avoid enum issues
      transaction.set('payment_status', newStatus, { strict: false });
      transaction.gateway_response = statusResponse.data;

      // Check if payment became successful
      const successStatuses = ['SUCCESS', 'success', 'PAID', 'COMPLETED'];
      const becameSuccessful = successStatuses.includes(newStatus) && !successStatuses.includes(currentStatus);

      if (becameSuccessful) {
        console.log('💰 Payment Verification - Processing successful payment');

        // Get current agent balance
        const agentDoc = await Agent.findById(agent._id);
        const currentBalance = agentDoc.wallet_balance || 0;
        const amountToAdd = transaction.amount;
        const newBalance = currentBalance + amountToAdd;

        console.log('🧮 Payment Verification - Balance update:', {
          current: currentBalance,
          adding: amountToAdd,
          new: newBalance
        });

        // Update agent balance
        await Agent.findByIdAndUpdate(agent._id, {
          wallet_balance: newBalance,
          updatedAt: new Date()
        });

        transaction.balance_after = newBalance;
        console.log('✅ Payment Verification - Balance updated successfully');
      } else {
        console.log('ℹ️ Payment Verification - No balance update needed');
      }

      await transaction.save({ validateBeforeSave: false });
      console.log('💾 Payment Verification - Transaction saved');
    } else {
      console.log('ℹ️ Payment Verification - Status unchanged');
    }

    // Return current transaction state
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
    console.error('💥 Payment Verification - Error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
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

/**
 * @desc    Handle Cashfree payment webhook
 * @route   POST /api/v1/pay/webhook
 * @access  Public
 */
exports.webhookHandler = async (req, res) => {
  try {
    console.log('🔔 Webhook received:', req.body);

    const { order_id, order_status, order_amount, cf_payment_id, payment_mode, reference_id } = req.body;

    if (!order_id) {
      console.log('❌ Missing order_id');
      return res.status(400).json({ success: false, message: 'Missing order_id' });
    }

    console.log('🔍 Looking for transaction with order_id:', order_id);
    const transaction = await Transaction.findOne({ transaction_id: order_id });
    if (!transaction) {
      console.log('⚠️ Transaction not found for order_id:', order_id);
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    console.log('✅ Transaction found:', transaction._id, 'Current status:', transaction.payment_status);

    // Update transaction
    const previousStatus = transaction.payment_status;
    transaction.payment_status = order_status || 'UNKNOWN';
    transaction.gateway_response = req.body;

    console.log('🔄 Updating transaction status from', previousStatus, 'to', transaction.payment_status);
    await transaction.save({ validateBeforeSave: false });
    console.log('💾 Transaction saved successfully');

    // If success, update wallet
    const successStatuses = ['PAID', 'SUCCESS', 'COMPLETED'];
    if (successStatuses.includes(order_status)) {
      console.log('💰 Processing successful payment for agent:', transaction.agent);
      const agent = await Agent.findById(transaction.agent);
      if (agent) {
        const currentBalance = agent.wallet_balance || 0;
        const newBalance = currentBalance + transaction.amount;
        console.log('🧮 Updating balance from', currentBalance, 'to', newBalance);
        await Agent.findByIdAndUpdate(agent._id, { wallet_balance: newBalance });
        transaction.balance_after = newBalance;
        await transaction.save({ validateBeforeSave: false });
        console.log('💰 Wallet updated for agent:', agent._id, 'New balance:', newBalance);
      } else {
        console.log('⚠️ Agent not found for ID:', transaction.agent);
      }
    }

    console.log('✅ Webhook processed for:', order_id);
    return res.json({ success: true, message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('💥 Webhook error:', error.message);
    console.error('💥 Webhook error stack:', error.stack);
    return res.status(500).json({ success: false, message: 'Something went wrong!', error: error.message });
  }
};
