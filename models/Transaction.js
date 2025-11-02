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
<<<<<<< HEAD
    enum: ['cashfree', 'manual'],
=======
    enum: ['cashfree', 'razorpay', 'jojoUpi', 'manual'],
>>>>>>> d14d0c85b1d128149b48b68dce6f3db03885e37c
    default: 'manual'
  }
}, {
  timestamps: true
});

// Index for efficient queries
transactionSchema.index({ agent: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
