const mongoose = require('mongoose');
const Settings = require('../models/Settings');
require('dotenv').config();

async function updateSettingsForJojoUpi() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rto_reminder_system', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Update settings with JojoUPI configuration
    const settings = await Settings.findOne();
    if (settings) {
      settings.jojoUpi = {
        apiKey: '17f13317ce1ea927ccedb77fa3732b61', // From the provided API key
        apiUrl: 'https://api.jojoupi.com',
        callbackUrl: 'https://rto-reminder-backend.onrender.com/api/v1/webhook/jojoupi'
      };
      await settings.save();
      console.log('Updated settings with JojoUPI configuration');
    } else {
      // Create new settings document
      const newSettings = new Settings({
        msg91: {
          authKey: process.env.MSG91_AUTH_KEY || '',
          senderId: process.env.MSG91_SENDER_ID || '',
          flows: {}
        },
        pricing: {
          perMessageCost: 1.0,
          currency: 'INR'
        },
        system: {
          maxRetries: 3,
          schedulerInterval: 5
        },
        jojoUpi: {
          apiKey: '17f13317ce1ea927ccedb77fa3732b61',
          apiUrl: 'https://api.jojoupi.com',
          callbackUrl: 'https://rto-reminder-backend.onrender.com/api/v1/webhook/jojoupi'
        }
      });
      await newSettings.save();
      console.log('Created new settings document with JojoUPI configuration');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

updateSettingsForJojoUpi();
