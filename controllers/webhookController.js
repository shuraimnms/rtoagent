const MessageLog = require('../models/MessageLog');
const UnsubscribeList = require('../models/UnsubscribeList');
const Agent = require('../models/Agent');
const Settings = require('../models/Settings');
<<<<<<< HEAD
const Transaction = require('../models/Transaction');
const cashfreeService = require('../services/cashfreeService');
=======
>>>>>>> d14d0c85b1d128149b48b68dce6f3db03885e37c

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

<<<<<<< HEAD
/**
 * Handle Cashfree payment webhook
 */
exports.handleCashfreeWebhook = async (req, res) => {
  try {
    const rawBody = JSON.stringify(req.body);
    const signature = req.headers['x-webhook-signature'];

    // Verify webhook signature
    if (!cashfreeService.verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const webhookData = req.body;

    // Process the webhook data
    const processedData = await cashfreeService.processWebhook(webhookData);

    // Find and update transaction
    const transaction = await Transaction.findOne({ transaction_id: processedData.orderId });

    if (transaction) {
      // Update transaction status
      transaction.payment_status = processedData.status;
      transaction.gateway_response = webhookData;

      // If payment successful, update wallet balance
      if (processedData.status === 'success' && transaction.payment_status !== 'success') {
        const agent = await Agent.findById(transaction.agent);
        const newBalance = agent.wallet_balance + processedData.amount;

        await Agent.findByIdAndUpdate(transaction.agent, { wallet_balance: newBalance });
        transaction.balance_after = newBalance;
      }

      await transaction.save();
      console.log(`Transaction ${processedData.orderId} updated to status: ${processedData.status}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Cashfree webhook error:', error);
    res.status(200).json({ success: false }); // Return 200 to prevent retries
  }
};

=======
>>>>>>> d14d0c85b1d128149b48b68dce6f3db03885e37c



