const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');

/**
 * @desc    Simple pay button functionality - directly update wallet balance
 * @route   POST /api/v1/pay/add-balance
 * @access  Private
 */
exports.addBalance = async (req, res) => {
  try {
    const { amount } = req.body;
    const agent = req.agent;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    // Get agent settings for validation
    const agentData = await Agent.findById(agent._id);
    const minAmount = agentData.settings.wallet.min_topup_amount;
    const maxAmount = agentData.settings.wallet.max_topup_amount;

    // Validate against admin settings
    if (amount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum top-up amount is ₹${minAmount}`
      });
    }

    if (amount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Maximum top-up amount is ₹${maxAmount}`
      });
    }

    // Update agent wallet balance
    const updatedAgent = await Agent.findByIdAndUpdate(
      agent._id,
      { $inc: { wallet_balance: amount } },
      { new: true }
    );

    // Create transaction record
    await Transaction.create({
      agent: agent._id,
      type: 'topup',
      amount: amount,
      balance_after: updatedAgent.wallet_balance,
      description: `Wallet topup of ₹${amount}`,
      payment_gateway: 'manual'
    });

    res.json({
      success: true,
      message: `₹${amount} added to your wallet`,
      data: {
        new_balance: updatedAgent.wallet_balance
      }
    });

  } catch (error) {
    console.error('Add balance error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get current wallet balance and settings
 * @route   GET /api/v1/pay/balance
 * @access  Private
 */
exports.getBalance = async (req, res) => {
  try {
    const agent = await Agent.findById(req.agent._id).select('wallet_balance settings.wallet');

    // If wallet settings don't exist, use defaults
    const walletSettings = agent.settings?.wallet || {
      min_topup_amount: 10,
      max_topup_amount: 10000,
      topup_amounts: [100, 500, 1000, 2000, 5000],
      auto_topup_enabled: false,
      auto_topup_threshold: 50,
      auto_topup_amount: 500
    };

    res.json({
      success: true,
      data: {
        balance: agent.wallet_balance,
        settings: walletSettings
      }
    });

  } catch (error) {
    console.error('Get balance error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get transaction history
 * @route   GET /api/v1/pay/history
 * @access  Private
 */
exports.getTransactionHistory = async (req, res) => {
  try {
    const transactions = await Transaction.find({ agent: req.agent._id })
      .sort({ createdAt: -1 })
      .populate('agent', 'name email');

    res.json({
      success: true,
      data: {
        transactions: transactions.map(tx => ({
          id: tx._id,
          type: tx.type,
          amount: tx.amount,
          balance_after: tx.balance_after,
          description: tx.description,
          transaction_id: tx.transaction_id,
          payment_gateway: tx.payment_gateway,
          createdAt: tx.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Verify payment
 * @route   GET /api/v1/pay/verify-payment/:transactionId
 * @access  Private
 */
exports.verifyPayment = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const agent = req.agent;

    // Find transaction
    const transaction = await Transaction.findOne({
      transaction_id: transactionId,
      agent: agent._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // If already processed, return success
    if (transaction.type === 'topup') {
      return res.json({
        success: true,
        data: {
          amount: transaction.amount,
          transaction_id: transaction.transaction_id,
          status: 'success'
        }
      });
    }

    // For simplicity, assume payment is successful and update balance
    // In real implementation, verify with payment gateway
    const updatedAgent = await Agent.findByIdAndUpdate(
      agent._id,
      { $inc: { wallet_balance: transaction.amount } },
      { new: true }
    );

    // Update transaction
    transaction.type = 'topup';
    transaction.balance_after = updatedAgent.wallet_balance;
    await transaction.save();

    res.json({
      success: true,
      data: {
        amount: transaction.amount,
        transaction_id: transaction.transaction_id,
        payment_id: transaction.transaction_id,
        status: 'success'
      }
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
