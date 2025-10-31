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
    enum: ['super_admin', 'admin', 'agent_admin', 'support'],
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
    },
    wallet: {
      min_topup_amount: {
        type: Number,
        default: 10
      },
      max_topup_amount: {
        type: Number,
        default: 10000
      },
      topup_amounts: {
        type: [Number],
        default: [100, 500, 1000, 2000, 5000]
      },
      auto_topup_enabled: {
        type: Boolean,
        default: false
      },
      auto_topup_threshold: {
        type: Number,
        default: 50
      },
      auto_topup_amount: {
        type: Number,
        default: 500
      },
      daily_topup_limit: {
        type: Number,
        default: 5000
      },
      monthly_topup_limit: {
        type: Number,
        default: 25000
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