const mongoose = require('mongoose');

const fraudAlertSchema = new mongoose.Schema({
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  alertType: {
    type: String,
    required: true,
    enum: [
      'HIGH_MESSAGE_VOLUME',
      'UNUSUAL_ACTIVITY',
      'SUSPICIOUS_LOGIN',
      'WALLET_ANOMALY',
      'BULK_OPERATION',
      'FAILED_ATTEMPTS'
    ]
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  description: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['active', 'investigated', 'resolved', 'dismissed'],
    default: 'active'
  },
  triggeredAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: Date,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  resolutionNotes: String
}, {
  timestamps: true
});

// Indexes
fraudAlertSchema.index({ agent: 1, status: 1, triggeredAt: -1 });
fraudAlertSchema.index({ alertType: 1, triggeredAt: -1 });
fraudAlertSchema.index({ severity: 1, status: 1 });

module.exports = mongoose.model('FraudAlert', fraudAlertSchema);
