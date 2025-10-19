const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE_AGENT',
      'UPDATE_AGENT',
      'DELETE_AGENT',
      'CREATE_CUSTOMER',
      'UPDATE_CUSTOMER',
      'DELETE_CUSTOMER',
      'CREATE_REMINDER',
      'UPDATE_REMINDER',
      'DELETE_REMINDER',
      'SEND_MESSAGE',
      'WALLET_TOPUP',
      'WALLET_DEDUCTION',
      'LOGIN',
      'LOGOUT',
      'SETTINGS_UPDATE',
      'NOTIFICATION_SEND',
      'ADMIN_ACTION'
    ]
  },
  entityType: {
    type: String,
    required: true,
    enum: ['Agent', 'Customer', 'Reminder', 'Message', 'Transaction', 'Notification', 'Settings']
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: String,
  userAgent: String,
  oldValues: mongoose.Schema.Types.Mixed,
  newValues: mongoose.Schema.Types.Mixed,
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
auditLogSchema.index({ performedBy: 1, timestamp: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
