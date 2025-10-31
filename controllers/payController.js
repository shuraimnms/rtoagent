const Agent = require('../models/Agent');
const Transaction = require('../models/Transaction');
const Settings = require('../models/Settings');

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

    // Get global settings for validation
    let globalSettings = await Settings.findOne();
    let minAmount = 10; // default
    let maxAmount = 10000; // default

    if (globalSettings && globalSettings.wallet) {
      minAmount = globalSettings.wallet.min_topup_amount || 10;
      maxAmount = globalSettings.wallet.max_topup_amount || 10000;
    }

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
    const agent = await Agent.findById(req.agent._id).select('wallet_balance');

    // Get global wallet settings
    let globalSettings = await Settings.findOne();
    let walletSettings = {
      min_topup_amount: 10,
      max_topup_amount: 10000,
      topup_amounts: [100, 500, 1000, 2000, 5000],
      auto_topup_enabled: false,
      auto_topup_threshold: 50,
      auto_topup_amount: 500
    };

    if (globalSettings && globalSettings.wallet) {
      walletSettings = {
        min_topup_amount: globalSettings.wallet.min_topup_amount || 10,
        max_topup_amount: globalSettings.wallet.max_topup_amount || 10000,
        topup_amounts: globalSettings.wallet.topup_amounts || [100, 500, 1000, 2000, 5000],
        auto_topup_enabled: globalSettings.wallet.auto_topup_enabled || false,
        auto_topup_threshold: globalSettings.wallet.auto_topup_threshold || 50,
        auto_topup_amount: globalSettings.wallet.auto_topup_amount || 500
      };
    }

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
