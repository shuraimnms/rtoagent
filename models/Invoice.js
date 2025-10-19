const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
    unique: true
  },
  invoiceNumber: {
    type: String,
    required: true,
    unique: true
  },
  issueDate: {
    type: Date,
    default: Date.now
  },
  baseAmount: {
    type: Number,
    required: true
  },
  transactionFee: {
    type: Number,
    required: true
  },
  gstAmount: {
    type: Number,
    required: true
  },
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['paid', 'pending', 'cancelled'],
    default: 'paid'
  }
}, {
  timestamps: true
});

invoiceSchema.index({ agent: 1, issueDate: -1 });

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);