const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  mobile: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['super_admin', 'agent_admin', 'support'],
    default: 'agent_admin'
  },
  company_name: {
    type: String,
    trim: true
  },
  wallet_balance: {
    type: Number,
    default: 0
  },
  is_active: {
    type: Boolean,
    default: true
  },
  settings: {
    per_message_cost: {
      type: Number,
      default: 1.0
    },
    signature: {
      type: String,
      default: 'Shuraim RTO Services'
    },
    notifications: {
      email_reminders: {
        type: Boolean,
        default: true
      },
      sms_reminders: {
        type: Boolean,
        default: true
      },
      reminder_lead_times: {
        type: [Number],
        default: [30, 7, 3, 1]
      },
      low_balance_alert: {
        type: Boolean,
        default: true
      },
      low_balance_threshold: {
        type: Number,
        default: 100
      }
    },
    security: {
      two_factor_enabled: {
        type: Boolean,
        default: false
      },
      session_timeout: {
        type: Number,
        default: 24
      }
    }
  }
}, {
  timestamps: true
});

agentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

agentSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Fix: Check if model already exists before creating
module.exports = mongoose.models.Agent || mongoose.model('Agent', agentSchema);