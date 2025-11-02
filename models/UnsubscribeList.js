const mongoose = require('mongoose');

const unsubscribeSchema = new mongoose.Schema({
  mobile: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^\+\d{10,15}$/.test(v);
      },
      message: 'Mobile must be in E.164 format'
    }
  },
  reason: {
    type: String,
    enum: ['STOP', 'unsubscribed', 'bounced'],
    default: 'STOP'
  },
  created_by_agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  }
}, {
  timestamps: true
});

// Fix: Check if model already exists before creating
module.exports = mongoose.models.UnsubscribeList || mongoose.model('UnsubscribeList', unsubscribeSchema);