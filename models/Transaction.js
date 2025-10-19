const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  type: {
    type: String,
    enum: ['topup', 'message_deduction', 'refund', 'transaction_fee', 'gst'],
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
  description: String,
  reference_id: String,
  payment_gateway_response: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Fix: Check if model already exists before creating
module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);