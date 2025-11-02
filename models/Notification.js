const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['info', 'warning', 'admin'],
    default: 'info'
  },
  target: {
    type: String,
    enum: ['all', 'specific'],
    default: 'all'
  },
  agentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: function() {
      return this.target === 'specific';
    }
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  readBy: [{
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ target: 1, agentId: 1, createdAt: -1 });
notificationSchema.index({ 'readBy.agentId': 1 });

module.exports = mongoose.model('Notification', notificationSchema);
