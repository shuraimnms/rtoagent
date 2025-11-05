const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings'); // Added import
const cashfreeService = require('../services/cashfreeService'); // Added import

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
      payment_gateway: 'manual',
      payment_status: 'success' // Manual top-ups are always successful
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
          createdAt: tx.createdAt,
          payment_status: tx.payment_status // Include payment status
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
      transaction_id: response.orderId, // Use response.orderId
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
 * @desc    Handle Cashfree webhook
 * @route   POST /api/v1/payments/webhook
 * @access  Public (called by Cashfree)
 */
exports.handleCashfreeWebhook = async (req, res) => {
  try {
    console.log('💰 Cashfree Webhook Received:', req.body);

    const {
      order_id,
      order_status,
      order_amount,
      cf_payment_id,
      payment_mode,
      reference_id
    } = req.body;

    // Validate required fields
    if (!order_id || !order_status || !order_amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Only process successful payments
    if (order_status !== 'PAID') {
      return res.json({
        success: true,
        message: `Payment status: ${order_status} - No action required`
      });
    }

    // Extract agent ID from order_id (format: CF_timestamp_agentId)
    const orderParts = order_id.split('_');
    if (orderParts.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const agentId = orderParts[2];
    const amount = parseFloat(order_amount);

    // Find agent
    const agent = await Agent.findById(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Check if payment already processed using cf_payment_id or order_id
    const existingTransaction = await Transaction.findOne({
      $or: [{ transaction_id: cf_payment_id }, { reference_id: order_id }]
    });

    if (existingTransaction) {
      // If transaction exists and is already successful, no action needed
      if (existingTransaction.payment_status === 'success') {
        console.log(`ℹ️ Payment already processed successfully for order: ${order_id}`);
        return res.json({ success: true, message: 'Payment already processed successfully' });
      }
      // If transaction exists but is pending, update it
      if (existingTransaction.payment_status === 'pending') {
        console.log(`🔄 Updating pending transaction for order: ${order_id}`);
        await Agent.findByIdAndUpdate(agent._id, { $inc: { wallet_balance: amount } }); // Credit wallet
        await Transaction.findByIdAndUpdate(existingTransaction._id, {
          payment_status: 'success',
          transaction_id: cf_payment_id, // Ensure cf_payment_id is set
          balance_after: agent.wallet_balance + amount, // Update balance_after
          payment_gateway_response: req.body
        });
        console.log(`✅ Transaction ${order_id} status updated to success and wallet credited.`);
        return res.json({ success: true, message: 'Payment status updated to success' });
      }
    }

    // Update agent wallet
    const newBalance = agent.wallet_balance + amount;
    await Agent.findByIdAndUpdate(agentId, {
      wallet_balance: newBalance
    });

    // Create transaction record
    await Transaction.create({
      agent: agentId,
      type: 'topup',
      amount: amount,
      balance_after: newBalance,
      description: `Wallet topup of ₹${amount} via ${payment_mode || 'Cashfree'}`,
      reference_id: order_id,
      transaction_id: cf_payment_id, // Store Cashfree payment ID
      payment_status: 'success', // Mark as success
      payment_gateway: 'cashfree', // Explicitly set gateway
      payment_gateway_response: req.body
    });

    console.log(`✅ Payment processed: Agent ${agentId} +₹${amount}`);

    res.json({
      success: true,
      message: 'Payment processed successfully'
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

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

    // ✅ CRITICAL: Check if payment was already processed (success OR failure)
    const finalStatuses = ['success', 'SUCCESS', 'PAID', 'COMPLETED', 'failed', 'FAILED', 'CANCELLED'];
    if (finalStatuses.includes(transaction.payment_status)) {
      console.log('ℹ️ Payment already has final status:', transaction.payment_status);
      return res.json({
        success: true,
        data: {
          orderId,
          status: transaction.payment_status,
          amount: transaction.amount,
          balance_after: transaction.balance_after,
          alreadyProcessed: true
        }
      });
    }

    // Check with Cashfree API
    const statusResponse = await cashfreeService.getOrderStatus(orderId);

    if (!statusResponse.success) {
      console.log('❌ Payment Verification - Failed to get status from Cashfree');
      return res.status(400).json({
        success: false,
        message: 'Failed to verify payment status'
      });
    }

    console.log('📊 Payment Verification - Cashfree response:', {
      orderStatus: statusResponse.orderStatus,
      paymentStatus: statusResponse.paymentStatus,
      fullResponse: statusResponse.data
    });

    const currentStatus = transaction.payment_status;
    let newStatus = statusResponse.orderStatus; // Use orderStatus

    // Map Cashfree statuses to your system statuses
    let systemStatus = 'pending';
    
    // ✅ CRITICAL: Define success and failure statuses clearly
    const successStatuses = ['PAID', 'SUCCESS', 'COMPLETED'];
    const failureStatuses = ['FAILED', 'CANCELLED', 'EXPIRED', 'TERMINATED', 'ACTIVE']; // Treat ACTIVE as failed for redirection purposes
    
    if (successStatuses.includes(newStatus)) {
      systemStatus = 'success';
    } else if (failureStatuses.includes(newStatus)) {
      systemStatus = 'failed';
    } else {
      systemStatus = 'pending';
    }

    console.log('🔄 Status Mapping:', {
      cashfreeStatus: newStatus,
      systemStatus: systemStatus,
      currentStatus: currentStatus
    });

    // Only process if status changed
    if (currentStatus !== systemStatus) {
      console.log('🔄 Payment Verification - Status changed:', currentStatus, '→', systemStatus);

      transaction.payment_status = systemStatus;
      transaction.gateway_response = statusResponse.data;

      // ✅ CRITICAL: Only update balance for SUCCESSFUL payments
      if (systemStatus === 'success') {
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
        
      } else if (systemStatus === 'failed') {
        console.log('❌ Payment Verification - Payment failed, NO balance update');
        // For failed payments, balance_after should remain the same as before
        transaction.balance_after = agent.wallet_balance; // Current balance, no change
      }

      await transaction.save({ validateBeforeSave: false });
      console.log('💾 Payment Verification - Transaction saved with status:', systemStatus);
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
        balance_after: transaction.balance_after,
        cashfreeStatus: newStatus // Include for debugging
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
    const successStatuses = ['SUCCESS', 'success', 'PAID', 'COMPLETED', 'ACTIVE'];
    if (successStatuses.includes(status)) {
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
