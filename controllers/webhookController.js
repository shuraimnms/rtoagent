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
    const rawBody = req.body.toString();
    const signature = req.headers['x-webhook-signature'];

    console.log('Cashfree Webhook - Raw Body:', rawBody);
    console.log('Cashfree Webhook - Signature:', signature);

    // Verify webhook signature
    if (!cashfreeService.verifyWebhookSignature(rawBody, signature)) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const webhookData = JSON.parse(rawBody);
    console.log('Cashfree Webhook - Parsed Data:', JSON.stringify(webhookData, null, 2));

    const processedData = await cashfreeService.processWebhook(webhookData);
    console.log('Cashfree Webhook - Processed Data:', processedData);

    // Find transaction by orderId
    const transaction = await Transaction.findOne({ transaction_id: processedData.orderId });
    console.log('Cashfree Webhook - Transaction Query Result:', transaction ? 'Found' : 'Not Found');

    if (transaction) {
      console.log('Cashfree Webhook - Found Transaction:', {
        id: transaction._id,
        transaction_id: transaction.transaction_id,
        current_status: transaction.payment_status,
        agent: transaction.agent,
        amount: transaction.amount
      });

      const previousStatus = transaction.payment_status;

      // Update transaction fields
      transaction.payment_status = processedData.status;
      transaction.gateway_response = webhookData;

      // If payment became successful, update wallet balance
      const successStatuses = ['SUCCESS', 'success', 'PAID', 'COMPLETED'];
      if (successStatuses.includes(processedData.status) && !successStatuses.includes(previousStatus)) {
        console.log('Cashfree Webhook - Updating wallet balance for successful payment');

        const agent = await Agent.findById(transaction.agent);
        console.log('Cashfree Webhook - Agent found:', agent ? { id: agent._id, current_balance: agent.wallet_balance } : 'Not Found');

        if (agent) {
          const newBalance = agent.wallet_balance + processedData.amount;
          console.log('Cashfree Webhook - New balance calculation:', {
            current_balance: agent.wallet_balance,
            amount_to_add: processedData.amount,
            new_balance: newBalance
          });

          await Agent.findByIdAndUpdate(transaction.agent, { wallet_balance: newBalance });
          transaction.balance_after = newBalance;

          console.log('Cashfree Webhook - Wallet balance updated successfully');
        } else {
          console.error('Cashfree Webhook - Agent not found for transaction');
        }
      } else {
        console.log('Cashfree Webhook - Payment status transition check:', {
          new_status: processedData.status,
          previous_status: previousStatus,
          should_update_balance: successStatuses.includes(processedData.status) && !successStatuses.includes(previousStatus)
        });
      }

      await transaction.save();
      console.log(`✅ Cashfree Webhook - Transaction ${processedData.orderId} updated to status: ${processedData.status}`);
    } else {
      console.warn(`⚠️ Cashfree Webhook - Transaction not found for orderId: ${processedData.orderId}`);
      console.log('Cashfree Webhook - Available transactions in DB (last 5):');
      const recentTransactions = await Transaction.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('transaction_id payment_status createdAt');
      console.log(recentTransactions);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Cashfree webhook error:', error);
    // Always respond 200 to prevent Cashfree retries
    res.status(200).json({ success: false });
  }
};
