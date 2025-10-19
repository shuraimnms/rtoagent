const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  mobile: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^\+\d{10,15}$/.test(v);
      },
      message: 'Mobile must be in E.164 format'
    }
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  vehicle_number: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  created_by_agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  language: {
    type: String,
    enum: ['en', 'hi', 'te'],
    default: 'en'
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

customerSchema.index({ mobile: 1, created_by_agent: 1 }, { unique: true });

// Fix: Check if model already exists before creating
module.exports = mongoose.models.Customer || mongoose.model('Customer', customerSchema);