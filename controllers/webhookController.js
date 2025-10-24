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
      data: {
        order: { order_id, order_amount, order_tags },
        payment: { payment_status, cf_payment_id },
        customer_details,
      },
      type,
    } = req.body;

    // Log the webhook data
    console.log(`📋 Order ID: ${order_id}`);
    console.log(`💰 Amount: ₹${order_amount}`);
    console.log(`📊 Status: ${payment_status}`);
    console.log(`🆔 Payment ID: ${cf_payment_id || 'N/A'}`);
    console.log(`🔔 Event Type: ${type}`);

    // We are interested in successful payment events
    if (type === 'PAYMENT_SUCCESS_WEBHOOK' && payment_status === 'SUCCESS') {
      console.log('✅ Payment Successful - Ready to update wallet balance');

      const agentId = order_tags?.agentId;
      const baseAmount = parseFloat(order_tags?.baseAmount);
      const transactionFee = parseFloat(order_tags?.transactionFee);
      const gstAmount = parseFloat(order_tags?.gstAmount);

      if (!agentId || isNaN(baseAmount)) {
        console.error('❌ Missing agentId or baseAmount in webhook order_tags.');
        return res.status(400).json({ status: 'error', message: 'Missing required tags.' });
      }

      console.log(`👤 Agent ID: ${agentId}, Base Amount: ${baseAmount}`);

      // --- Idempotency Check: Ensure we don't process the same payment twice ---
      const existingTransaction = await Transaction.findOne({ reference_id: cf_payment_id });
      if (existingTransaction) {
        console.log(`⚠️ Payment ${cf_payment_id} already processed. Skipping.`);
        return res.status(200).json({ status: 'ok', message: 'Webhook already processed.' });
      }

      // --- Update Wallet and Create Records ---
      const agent = await Agent.findByIdAndUpdate(
        agentId,
        { $inc: { wallet_balance: baseAmount } },
        { new: true }
      );

      if (!agent) {
        console.error(`❌ Agent with ID ${agentId} not found.`);
        return res.status(404).json({ status: 'error', message: 'Agent not found.' });
      }

      const transaction = await Transaction.create({
        agent: agentId,
        type: 'topup',
        amount: baseAmount,
        balance_after: agent.wallet_balance,
        reference_id: cf_payment_id,
        description: `Wallet top-up via Cashfree`,
        payment_gateway_response: req.body.data,
      });

      // Create Invoice
      const invoiceCount = await Invoice.countDocuments();
      await Invoice.create({
        agent: agentId,
        transaction: transaction._id,
        invoiceNumber: `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`,
        issueDate: new Date(),
        baseAmount: baseAmount,
        transactionFee: transactionFee,
        gstAmount: gstAmount,
        totalAmount: order_amount,
        status: 'paid',
      });

      console.log(`💳 Wallet updated for agent ${agentId}. New balance: ₹${agent.wallet_balance}`);

    } else {
      console.log(`🔶 Ignoring webhook event type "${type}" with status "${payment_status}"`);
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