const mongoose = require('mongoose');

const messageLogSchema = new mongoose.Schema({
  reminder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reminder',
    required: false, // Make it optional
    default: null
  },
  customer_mobile: {
    type: String,
    required: true
  },
  template_name: {
    type: String,
    required: true
  },
  variables_sent: {
    type: [String],
    default: []
  },
  provider_message_id: String,
  provider_response: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['ENQUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'],
    default: 'ENQUEUED'
  },
  sent_at: {
    type: Date,
    default: Date.now
  },
  delivered_at: Date,
  read_at: Date,
  error_message: String,
  retry_count: {
    type: Number,
    default: 0
  },
  cost: {
    type: Number,
    default: 0
  },
  message_type: {
    type: String,
    enum: ['scheduled', 'test', 'manual'],
    default: 'scheduled'
  },
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  }
}, {
  timestamps: true
});

// Fix: Check if model already exists before creating
module.exports = mongoose.models.MessageLog || mongoose.model('MessageLog', messageLogSchema);