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
  jojoUpi: {
    enabled: {
      type: Boolean,
      default: true
    },
    apiKey: String,
    apiUrl: {
      type: String,
      default: 'https://upi.jojopay.in/partner/auth-login.php'
    },
    callbackUrl: String
  },
  cashfree: {
    enabled: {
      type: Boolean,
      default: true
    },
    appId: String,
    secretKey: String,
    baseUrl: {
      type: String,
      default: 'https://api.cashfree.com/pg'
    },
    callbackUrl: String
  },
  paymentGateway: {
    primary: {
      type: String,
      enum: ['cashfree', 'jojoupi'],
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
