const MessageLog = require('../models/MessageLog');
const UnsubscribeList = require('../models/UnsubscribeList');
const Agent = require('../models/Agent');
const Settings = require('../models/Settings');
const Transaction = require('../models/Transaction');
const cashfreeService = require('../services/cashfreeService');

/**
 * General webhook handler
 */
exports.handleWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;

    switch (type) {
      case 'message_status':
        await this.handleMessageStatus(data);
        break;

      case 'inbound_message':
        await this.handleInboundMessage(data);
        break;

      default:
        console.log('Unknown webhook type:', type);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(200).json({ success: false });
  }
};

/**
 * Handle message delivery status updates
 */
exports.handleMessageStatus = async (data) => {
  const { message_id, status, recipient, timestamp } = data;

  const messageLog = await MessageLog.findOne({ provider_message_id: message_id });
  if (!messageLog) return;

  switch (status) {
    case 'delivered':
      messageLog.status = 'DELIVERED';
      messageLog.delivered_at = new Date(timestamp);
      break;

    case 'read':
      messageLog.status = 'READ';
      messageLog.read_at = new Date(timestamp);
      break;

    case 'failed':
    case 'undelivered':
      messageLog.status = 'FAILED';
      messageLog.error_message = data.reason || 'Delivery failed';
      break;
  }

  await messageLog.save();
};

/**
 * Handle inbound messages (e.g. user replies like "STOP")
 */
exports.handleInboundMessage = async (data) => {
  const { from, text } = data;

  if (text && text.trim().toLowerCase() === 'stop') {
    await UnsubscribeList.findOneAndUpdate(
      { mobile: from },
      {
        mobile: from,
        reason: 'STOP'
      },
      { upsert: true, new: true }
    );
  }
};

/**
 * Handle Cashfree payment webhook
 */
exports.handleCashfreeWebhook = async (req, res) => {
  try {
    console.log('🔄 Cashfree Webhook - Received webhook request');

    // If Cashfree sends raw body (Buffer), handle it
    let rawBody;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    } else if (typeof req.body === 'object') {
      rawBody = JSON.stringify(req.body);
    } else {
      rawBody = req.body;
    }

    const signature = req.headers['x-webhook-signature'];
    console.log('📝 Raw body length:', rawBody?.length || 0);
    console.log('🔐 Signature present:', !!signature);

    // 🚧 Skip signature validation when testing locally
    const isLocal = process.env.NODE_ENV !== 'production';
    if (!isLocal) {
      if (!signature) {
        console.error('❌ Missing Cashfree signature');
        return res.status(400).json({ success: false, message: 'Signature missing' });
      }

      const validSignature = cashfreeService.verifyWebhookSignature(rawBody, signature);
      if (!validSignature) {
        console.error('❌ Invalid Cashfree signature');
        return res.status(400).json({ success: false, message: 'Invalid signature' });
      }
    } else {
      console.log('⚠️ Skipping signature validation in local mode');
    }

    // Parse the webhook body
    const webhookData = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
    console.log('📦 Webhook data received:', JSON.stringify(webhookData, null, 2));

    // Extract order/payment info - FIXED: Remove optional chaining that causes __.get error
    let orderId, orderStatus, orderAmount;

    // Handle different webhook data structures safely without optional chaining
    if (webhookData.data && webhookData.data.order && webhookData.data.order.order_id) {
      // New structure with data wrapper
      orderId = webhookData.data.order.order_id;
      orderStatus = webhookData.data.order.order_status;
      orderAmount = webhookData.data.order.order_amount;
    } else if (webhookData.data && webhookData.data.order_id) {
      // Direct data structure
      orderId = webhookData.data.order_id;
      orderStatus = webhookData.data.order_status;
      orderAmount = webhookData.data.order_amount;
    } else {
      // Legacy structure
      orderId = webhookData.order_id;
      orderStatus = webhookData.order_status;
      orderAmount = webhookData.order_amount;
    }

    console.log('💳 Extracted:', { orderId, orderStatus, orderAmount });

    if (!orderId) {
      console.error('❌ Missing order_id in webhook');
      return res.status(200).json({ success: false, message: 'Missing order_id' });
    }

    // Find transaction
    const transaction = await Transaction.findOne({ transaction_id: orderId });
    if (!transaction) {
      console.warn('⚠️ Transaction not found for order:', orderId);
      return res.status(200).json({ success: false, message: 'Transaction not found' });
    }

    console.log('✅ Transaction found:', {
      id: transaction._id,
      currentStatus: transaction.payment_status,
      amount: transaction.amount,
      agent: transaction.agent
    });

    const previousStatus = transaction.payment_status;
    const newStatus = (orderStatus || 'UNKNOWN').toUpperCase();

    // Update transaction status and store webhook payload
    transaction.payment_status = newStatus;
    transaction.gateway_response = webhookData;

    // Success states list
    const successStatuses = ['SUCCESS', 'PAID', 'COMPLETED'];
    const wasSuccessful = successStatuses.includes(newStatus);
    const wasPreviouslySuccessful = successStatuses.includes(previousStatus);

    // If payment just succeeded — update wallet
    if (wasSuccessful && !wasPreviouslySuccessful) {
      console.log('💰 Processing successful payment for', orderId);

      const agent = await Agent.findById(transaction.agent);
      if (!agent) {
        console.error('❌ Agent not found for transaction:', transaction.agent);
        return res.status(200).json({ success: false, message: 'Agent not found' });
      }

      const currentBalance = agent.wallet_balance || 0;
      const amountToAdd = orderAmount ? parseFloat(orderAmount) : transaction.amount;
      const newBalance = currentBalance + amountToAdd;

      console.log('🧮 Updating wallet:', {
        oldBalance: currentBalance,
        add: amountToAdd,
        newBalance
      });

      await Agent.findByIdAndUpdate(transaction.agent, {
        wallet_balance: newBalance,
        updatedAt: new Date()
      });

      transaction.balance_after = newBalance;
      console.log('✅ Wallet updated successfully for agent:', agent._id);
    } else {
      console.log('ℹ️ Payment not successful or already processed:', {
        newStatus,
        wasSuccessful,
        wasPreviouslySuccessful
      });
    }

    // Save transaction update
    await transaction.save();
    console.log('🎉 Webhook processed successfully for:', orderId);

    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('💥 Webhook Error:', error.message);
    console.error('💥 Stack trace:', error.stack);
    // Always return 200 to prevent Cashfree retries
    return res.status(200).json({ success: false, message: error.message });
  }
};

/**
 * Simple test webhook endpoint
 */
exports.testWebhook = async (req, res) => {
  try {
    console.log('🧪 Test webhook received:', req.body);
    console.log('📋 Headers:', req.headers);
    
    res.status(200).json({
      success: true,
      message: 'Webhook test successful',
      data: req.body,
      headers: req.headers
    });
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};