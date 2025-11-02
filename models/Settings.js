const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  msg91: {
    authKey: {
      type: String,
      default: ''
    },
    senderId: {
      type: String,
      default: ''
    },
    flows: {
      drivingLicense: String,
      fitnessCertificate: String,
      nocHypothecation: String,
      pucCertificate: String,
      roadTax: String,
      vehicleInsurance: String
    }
  },
  pricing: {
    perMessageCost: {
      type: Number,
      default: 1.0,
      min: 0
    },
    currency: {
      type: String,
      enum: ['INR', 'USD', 'EUR'],
      default: 'INR'
    }
  },
  system: {
    maxRetries: {
      type: Number,
      default: 3,
      min: 1,
      max: 10
    },
    schedulerInterval: {
      type: Number,
      default: 5,
      min: 1,
      max: 60
    }
  },
  wallet: {
    min_topup_amount: {
      type: Number,
      default: 10,
      min: 1
    },
    max_topup_amount: {
      type: Number,
      default: 10000,
      min: 1
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
      default: 50,
      min: 0
    },
    auto_topup_amount: {
      type: Number,
      default: 500,
      min: 1
    },
    daily_topup_limit: {
      type: Number,
      default: 5000,
      min: 0
    },
    monthly_topup_limit: {
      type: Number,
      default: 25000,
      min: 0
    }
  },
  razorpay: {
    keyId: String,
    keySecret: String,
    isProduction: {
      type: Boolean,
      default: false
    }
  },
  jojoUpi: {
    apiKey: String,
    apiUrl: String,
    callbackUrl: String,
    enabled: {
      type: Boolean,
      default: true
    }
  },
  cashfree: {
    enabled: {
      type: Boolean,
      default: false
    },
    appId: String,
    secretKey: String,
    baseUrl: {
      type: String,
      default: 'https://api.cashfree.com/pg'
    },
    callbackUrl: String,
    isProduction: {
      type: Boolean,
      default: false
    }
  },
  paymentGateway: {
    primary: {
      type: String,
      enum: ['cashfree', 'razorpay', 'jojoUpi', 'jojoupi'],
      default: 'cashfree'
    }
  }

}, {
  timestamps: true
});

// Ensure only one settings document exists
settingsSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existing = await this.constructor.findOne();
    if (existing) {
      throw new Error('Only one global settings document can exist');
    }
  }
  next();
});

// Fix: Check if model already exists before creating
module.exports = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
