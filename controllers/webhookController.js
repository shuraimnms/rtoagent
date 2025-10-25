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

exports.handleJojoUpiWebhook = async (req, res) => {
  try {
    const { user, orderid, amount, txn_status, utr_number, received_from, date, api_txn_id, transactions_id } = req.body;

    console.log('JojoUPI Webhook received:', req.body);

    // Find the transaction by order ID
    const transaction = await Transaction.findOne({ orderId: orderid });

    if (!transaction) {
      console.log('Transaction not found for order ID:', orderid);
      return res.status(200).json({ success: false, message: 'Transaction not found' });
    }

    if (txn_status === 'SUCCESS') {
      // Update transaction status
      transaction.status = 'completed';
      transaction.utrNumber = utr_number;
      transaction.completedAt = new Date(date);
      await transaction.save();

      // Update wallet balance
      const agent = await Agent.findById(transaction.agent);
      if (agent) {
        agent.wallet_balance += parseFloat(amount);
        await agent.save();
      }

      // Create invoice
      const invoice = new Invoice({
        agent: transaction.agent,
        invoiceNumber: `INV-${Date.now()}`,
        items: [{
          description: 'Wallet Top-up',
          amount: parseFloat(amount),
          quantity: 1
        }],
        totalAmount: parseFloat(amount),
        status: 'paid',
        issueDate: new Date(),
        dueDate: new Date()
      });
      await invoice.save();

      console.log('Payment processed successfully for order:', orderid);
    } else if (txn_status === 'FAILED') {
      transaction.status = 'failed';
      await transaction.save();
      console.log('Payment failed for order:', orderid);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('JojoUPI Webhook Error:', error);
    res.status(200).json({ success: false });
  }
};

exports.handleRazorpayWebhook = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const expectedSignature = req.headers['x-razorpay-signature'];

    // Verify webhook signature (implement signature verification)
    // const crypto = require('crypto');
    // const expectedSignature = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');

    const event = req.body.event;
    const paymentEntity = req.body.payload.payment.entity;

    console.log('Razorpay Webhook received:', event);

    if (event === 'payment.captured') {
      const orderId = paymentEntity.notes?.orderId;

      if (!orderId) {
        console.log('No order ID in Razorpay webhook');
        return res.status(200).json({ success: false });
      }

      // Find the transaction by order ID
      const transaction = await Transaction.findOne({ orderId: orderId });

      if (!transaction) {
        console.log('Transaction not found for order ID:', orderId);
        return res.status(200).json({ success: false, message: 'Transaction not found' });
      }

      // Update transaction status
      transaction.status = 'completed';
      transaction.utrNumber = paymentEntity.id;
      transaction.completedAt = new Date(paymentEntity.captured_at * 1000);
      await transaction.save();

      // Update wallet balance
      const agent = await Agent.findById(transaction.agent);
      if (agent) {
        agent.wallet_balance += transaction.amount;
        await agent.save();
      }

      // Create invoice
      const invoice = new Invoice({
        agent: transaction.agent,
        invoiceNumber: `INV-${Date.now()}`,
        items: [{
          description: 'Wallet Top-up',
          amount: transaction.amount,
          quantity: 1
        }],
        totalAmount: transaction.amount,
        status: 'paid',
        issueDate: new Date(),
        dueDate: new Date()
      });
      await invoice.save();

      console.log('Razorpay payment processed successfully for order:', orderId);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Razorpay Webhook Error:', error);
    res.status(200).json({ success: false });
  }
};
