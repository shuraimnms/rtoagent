const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const CashfreeService = require('../services/cashfreeService');

/**
 * @desc    Create payment link for wallet top-up
 * @route   POST /api/v1/payment/create-link
 * @access  Private
 */
exports.createPaymentLink = async (req, res) => {
  try {
    const { amount, purpose } = req.body;
    const agent = req.agent;

    // Validate amount - must be positive integer >= 10
    if (!amount || !Number.isInteger(Number(amount)) || amount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a positive integer with minimum ₹10'
      });
    }

    // Validate agent mobile - must be 10 digits (extract from international format if needed)
    let mobileNumber = agent.mobile;
    if (mobileNumber.startsWith('+91')) {
      mobileNumber = mobileNumber.substring(3);
    }
    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mobile number. Must be 10 digits.'
      });
    }

    // Create payment link using Cashfree only
    const result = await CashfreeService.createPaymentLink(agent, amount, purpose);

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
        payment_gateway: result.payment_gateway || 'CASHFREE'
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

    // Find the transaction to determine which gateway was used
    const transaction = await Transaction.findOne({
      reference_id: order_id,
      agent: agent._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Verify payment using Cashfree only
    const result = await CashfreeService.verifyPayment(order_id);

    if (result.success) {
      if (result.status === 'SUCCESS') {
        if (transaction.status === 'PENDING') {
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