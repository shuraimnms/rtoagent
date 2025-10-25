const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const JOJOUPIService = require('../services/jojoupiService');

/**
 * @desc    Create payment link for wallet top-up
 * @route   POST /api/v1/payment/create-link
 * @access  Private
 */
exports.createPaymentLink = async (req, res) => {
  try {
    const { amount, purpose } = req.body;
    const agent = req.agent;

    // Validate amount
    if (!amount || amount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Minimum top-up amount is ₹10'
      });
    }

    // Create payment link
    const result = await JOJOUPIService.createPaymentLink(agent, amount, purpose);

    if (result.success) {
      // Create pending transaction record
      const transaction = await Transaction.create({
        agent: agent._id,
        type: 'topup',
        amount: amount,
        balance_after: agent.wallet_balance,
        description: `Wallet top-up - ${purpose}`,
        reference_id: result.order_id,
        status: 'PENDING',
        payment_gateway: 'JOJOUPI'
      });

      res.json({
        success: true,
        message: 'Payment link created successfully',
        data: {
          payment_url: result.payment_url,
          order_id: result.order_id,
          qr_code: result.qr_code,
          transaction_id: transaction._id
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('Create payment link error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Verify payment status
 * @route   POST /api/v1/payment/verify
 * @access  Private
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { order_id } = req.body;
    const agent = req.agent;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Verify payment with JOJOUPI
    const result = await JOJOUPIService.verifyPayment(order_id);

    if (result.success) {
      if (result.status === 'SUCCESS') {
        // Find the pending transaction
        const transaction = await Transaction.findOne({
          reference_id: order_id,
          agent: agent._id
        });

        if (transaction && transaction.status === 'PENDING') {
          // Update agent wallet
          const updatedAgent = await Agent.findByIdAndUpdate(
            agent._id,
            {
              $inc: { wallet_balance: result.amount }
            },
            { new: true }
          );

          // Update transaction status
          transaction.status = 'COMPLETED';
          transaction.balance_after = updatedAgent.wallet_balance;
          transaction.payment_gateway_response = result.response;
          await transaction.save();

          res.json({
            success: true,
            message: 'Payment verified successfully',
            data: {
              amount: result.amount,
              new_balance: updatedAgent.wallet_balance,
              utr: result.utr,
              transaction_date: result.transaction_date
            }
          });
        } else {
          res.json({
            success: true,
            message: 'Payment already processed',
            data: {
              amount: result.amount,
              status: 'ALREADY_PROCESSED'
            }
          });
        }
      } else {
        res.status(400).json({
          success: false,
          message: `Payment status: ${result.status}`
        });
      }
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    JOJOUPI webhook handler
 * @route   POST /api/v1/webhook/jojoupi
 * @access  Public
 */
exports.handleWebhook = async (req, res) => {
  try {
    console.log('JOJOUPI Webhook Received:', req.body);

    // Process webhook
    const webhookData = await JOJOUPIService.handleWebhook(req.body);

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

    // Always return success to JOJOUPI
    res.json({
      success: true,
      message: 'Webhook processed successfully'
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return success to JOJOUPI to prevent retries
    res.json({
      success: true,
      message: 'Webhook received'
    });
  }
};

/**
 * @desc    Get payment history
 * @route   GET /api/v1/payment/history
 * @access  Private
 */
exports.getPaymentHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({
      agent: req.agent._id,
      type: 'topup'
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Transaction.countDocuments({
      agent: req.agent._id,
      type: 'topup'
    });

    res.json({
      success: true,
      data: { transactions },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get wallet balance
 * @route   GET /api/v1/payment/wallet
 * @access  Private
 */
exports.getWalletBalance = async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id).select('wallet_balance name email');

    res.json({
      success: true,
      data: {
        wallet_balance: agent.wallet_balance,
        agent_name: agent.name,
        agent_email: agent.email
      }
    });

  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};