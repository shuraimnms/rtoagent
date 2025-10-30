const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  type: {
    type: String,
    enum: ['topup', 'message_deduction', 'refund', 'adjustment'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balance_after: {
    type: Number,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  transaction_id: {
    type: String,
    default: null
  },
  payment_gateway: {
    type: String,
    enum: ['cashfree', 'razorpay', 'jojoUpi', 'manual'],
    default: 'manual'
  }
}, {
  timestamps: true
});

// Index for efficient queries
transactionSchema.index({ agent: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
