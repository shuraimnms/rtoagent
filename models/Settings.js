const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  msg91: {
    authKey: {
      type: String,
      required: true
    },
    senderId: {
      type: String,
      required: true
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
  razorpay: {
    keyId: {
      type: String,
      trim: true
    },
    keySecret: {
      type: String,
      trim: true
    },
    isProduction: {
      type: Boolean,
      default: false
    },
    enabled: {
      type: Boolean,
      default: true
    }
  },
  cashfree: {
    appId: {
      type: String,
      trim: true
    },
    secretKey: {
      type: String,
      trim: true
    },
    isProduction: {
      type: Boolean,
      default: false
    },
    enabled: {
      type: Boolean,
      default: false
    }
  },
  paymentGateway: {
    primary: {
      type: String,
      enum: ['razorpay', 'cashfree'],
      default: 'razorpay'
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
