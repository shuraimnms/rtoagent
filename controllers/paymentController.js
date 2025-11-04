const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');

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

    // Check if payment already processed
    const existingTransaction = await Transaction.findOne({
      reference_id: order_id
    });

    if (existingTransaction) {
      return res.json({
        success: true,
        message: 'Payment already processed'
      });
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
      description: `Wallet top-up via ${payment_mode || 'Cashfree'}`,
      reference_id: order_id,
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
 * @desc    Verify payment manually
 * @route   POST /api/v1/payments/verify
 * @access  Private
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { order_id, payment_id } = req.body;

    if (!order_id) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required'
      });
    }

    // Find transaction by order_id
    const transaction = await Transaction.findOne({
      reference_id: order_id,
      agent: req.agent._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found or not verified yet'
      });
    }

    // Get updated agent balance
    const agent = await Agent.findById(req.agent._id);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        amount: transaction.amount,
        order_id: order_id,
        payment_id: payment_id,
        new_balance: agent.wallet_balance,
        transaction: transaction
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};

/**
 * @desc    Create Cashfree payment order
 * @route   POST /api/v1/payments/create-order
 * @access  Private
 */
exports.createPaymentOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required and must be at least ₹100'
      });
    }

    // Generate unique order ID
    const order_id = `CF_${Date.now()}_${req.agent._id}`;

    // In a real implementation, you would call Cashfree API here
    // For now, return the order details
    const paymentData = {
      order_id: order_id,
      order_amount: amount,
      order_currency: 'INR',
      customer_details: {
        customer_id: req.agent._id.toString(),
        customer_name: req.agent.name,
        customer_email: req.agent.email,
        customer_phone: req.agent.mobile
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/payment-success?order_id=${order_id}`
      }
    };

    res.json({
      success: true,
      message: 'Payment order created',
      data: paymentData
    });

  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};
