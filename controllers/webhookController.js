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

    // Get raw body and signature
    const rawBody = req.body.toString();
    const signature = req.headers['x-webhook-signature'];

    console.log('📝 Cashfree Webhook - Raw body length:', rawBody.length);
    console.log('🔐 Cashfree Webhook - Signature present:', !!signature);

    // Verify webhook signature
    if (!cashfreeService.verifyWebhookSignature(rawBody, signature)) {
      console.error('❌ Cashfree Webhook - Invalid signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    // Parse webhook data
    const webhookData = JSON.parse(rawBody);
    console.log('📦 Cashfree Webhook - Event type:', webhookData.type || 'unknown');

    // Process webhook data
    const processedData = await cashfreeService.processWebhook(webhookData);
    console.log('⚙️ Cashfree Webhook - Processed data:', {
      orderId: processedData.orderId,
      amount: processedData.amount,
      status: processedData.status
    });

    // Find transaction
    const transaction = await Transaction.findOne({ transaction_id: processedData.orderId });

    if (!transaction) {
      console.warn('⚠️ Cashfree Webhook - Transaction not found:', processedData.orderId);
      return res.status(200).json({ success: false, message: 'Transaction not found' });
    }

    console.log('✅ Cashfree Webhook - Transaction found:', {
      id: transaction._id,
      currentStatus: transaction.payment_status,
      amount: transaction.amount,
      agent: transaction.agent
    });

    const previousStatus = transaction.payment_status;
    const newStatus = processedData.status;

    // Update transaction
    transaction.payment_status = newStatus;
    transaction.gateway_response = webhookData;

    // Check if payment became successful
    const successStatuses = ['SUCCESS', 'success', 'PAID', 'COMPLETED'];
    const wasSuccessful = successStatuses.includes(newStatus);
    const wasPreviouslySuccessful = successStatuses.includes(previousStatus);

    if (wasSuccessful && !wasPreviouslySuccessful) {
      console.log('💰 Cashfree Webhook - Processing successful payment');

      // Get agent
      const agent = await Agent.findById(transaction.agent);
      if (!agent) {
        console.error('❌ Cashfree Webhook - Agent not found:', transaction.agent);
        return res.status(200).json({ success: false, message: 'Agent not found' });
      }

      // Calculate new balance
      const currentBalance = agent.wallet_balance || 0;
      const amountToAdd = transaction.amount;
      const newBalance = currentBalance + amountToAdd;

      console.log('🧮 Cashfree Webhook - Balance calculation:', {
        current: currentBalance,
        adding: amountToAdd,
        new: newBalance
      });

      // Update agent balance
      await Agent.findByIdAndUpdate(transaction.agent, {
        wallet_balance: newBalance,
        updatedAt: new Date()
      });

      // Update transaction
      transaction.balance_after = newBalance;

      console.log('✅ Cashfree Webhook - Wallet balance updated successfully');
    } else {
      console.log('ℹ️ Cashfree Webhook - No balance update needed:', {
        newStatus,
        wasSuccessful,
        wasPreviouslySuccessful
      });
    }

    // Save transaction
    await transaction.save();

    console.log('🎉 Cashfree Webhook - Processing complete:', {
      orderId: processedData.orderId,
      finalStatus: newStatus,
      balanceUpdated: wasSuccessful && !wasPreviouslySuccessful
    });

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('💥 Cashfree Webhook - Error:', error);
    // Always return 200 to prevent retries
    res.status(200).json({ success: false, error: error.message });
  }
};
