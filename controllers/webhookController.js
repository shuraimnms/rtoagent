const MessageLog = require('../models/MessageLog');
const UnsubscribeList = require('../models/UnsubscribeList');
const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const Settings = require('../models/Settings');
const CashfreeService = require('../services/cashfreeService');

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

/**
 * @desc    Cashfree webhook handler
 * @route   POST /api/v1/webhook/cashfree
 * @access  Public
 */
exports.handleCashfreeWebhook = async (req, res) => {
  try {
    console.log('Cashfree Webhook Received:', req.body);

    // Verify webhook signature for security
    const signature = req.headers['x-webhook-signature'] || req.body.signature;
    if (!signature) {
      console.error('Cashfree Webhook: Missing signature');
      return res.status(400).json({
        success: false,
        message: 'Missing webhook signature'
      });
    }

    const isValidSignature = CashfreeService.verifyWebhookSignature(req.body, signature);
    if (!isValidSignature) {
      console.error('Cashfree Webhook: Invalid signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    // Process webhook
    const webhookData = await CashfreeService.handleWebhook(req.body);

    if (!webhookData.success) {
      return res.status(400).json({
        success: false,
        message: webhookData.error
      });
    }

    const { agentId, orderId, amount, status, utr } = webhookData;

    // Find the pending transaction
    const transaction = await Transaction.findOne({
      reference_id: orderId,
      agent: agentId
    });

    if (!transaction) {
      console.error('Transaction not found for order:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    if (transaction.status !== 'PENDING') {
      console.log('Transaction already processed:', orderId);
      return res.json({
        success: true,
        message: 'Transaction already processed'
      });
    }

    if (status === 'SUCCESS') {
      // Update agent wallet
      const agent = await Agent.findById(agentId);
      const newBalance = agent.wallet_balance + amount;

      await Agent.findByIdAndUpdate(agentId, {
        wallet_balance: newBalance
      });

      // Update transaction
      transaction.status = 'COMPLETED';
      transaction.balance_after = newBalance;
      transaction.payment_gateway_response = req.body;
      await transaction.save();

      console.log(`Wallet top-up successful for agent ${agentId}. Amount: ${amount}, New Balance: ${newBalance}`);

    } else if (status === 'FAILED') {
      // Mark transaction as failed
      transaction.status = 'FAILED';
      transaction.payment_gateway_response = req.body;
      await transaction.save();

      console.log(`Wallet top-up failed for agent ${agentId}. Amount: ${amount}`);
    }

    // Always return success to Cashfree
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Cashfree Webhook processing error:', error);
    // Still return success to Cashfree to prevent retries
    res.json({
      success: true,
      message: 'Webhook received'
    });
  }
};


