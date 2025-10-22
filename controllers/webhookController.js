const MessageLog = require('../models/MessageLog');
const UnsubscribeList = require('../models/UnsubscribeList');
const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const Settings = require('../models/Settings');

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
 * Handle Cashfree payment webhook
 */
exports.handleCashfreeWebhook = async (req, res) => {
  try {
    console.log('🔄 Cashfree Webhook Received:');
    console.log('Full JSON:', JSON.stringify(req.body, null, 2));

    const {
      order_id,
      order_amount,
      payment_status,
      payment_id,
      customer_details,
      order_meta
    } = req.body;

    // Log the webhook data
    console.log(`📋 Order ID: ${order_id}`);
    console.log(`💰 Amount: ₹${order_amount}`);
    console.log(`📊 Status: ${payment_status}`);
    console.log(`🆔 Payment ID: ${payment_id || 'N/A'}`);

    // For sandbox testing, we'll log and respond
    // In production, you'd verify the signature and update wallet balance
    if (payment_status === 'SUCCESS') {
      console.log('✅ Payment Successful - Ready to update wallet balance');

      // Extract agent ID from order_meta or customer_details
      // This would need to be stored during order creation
      const agentId = customer_details?.customer_id;

      if (agentId) {
        console.log(`👤 Agent ID: ${agentId}`);

        // In production, you'd update the wallet balance here
        // For now, just log that we'd update it
        console.log('💳 Would update wallet balance for agent:', agentId);
      }
    } else {
      console.log('❌ Payment Failed or Pending');
    }

    // Always respond with 200 OK for webhooks
    res.status(200).json({
      status: 'ok',
      message: 'Webhook received successfully'
    });

  } catch (error) {
    console.error('❌ Cashfree Webhook Error:', error);
    // Still respond with 200 to prevent retries
    res.status(200).json({
      status: 'error',
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

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

exports.handleInboundMessage = async (data) => {
  const { from, text, timestamp } = data;

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