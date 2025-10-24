const mongoose = require('mongoose');
const Settings = require('../models/Settings');
const Transaction = require('../models/Transaction');
require('dotenv').config();

async function updateSettingsAndDeleteTopups() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Update settings to set primary gateway to 'razorpay'
    const settingsUpdate = await Settings.findOneAndUpdate(
      {},
      { $set: { 'paymentGateway.primary': 'razorpay' } },
      { new: true, upsert: true }
    );
    console.log('Updated settings:', settingsUpdate.paymentGateway);

    // Delete all topup transactions
    const deleteResult = await Transaction.deleteMany({ type: 'topup' });
    console.log(`Deleted ${deleteResult.deletedCount} topup transactions`);

    // Check Razorpay keys
    const settings = await Settings.findOne();
    if (!settings.razorpay || !settings.razorpay.keyId || !settings.razorpay.keySecret) {
      console.log('WARNING: Razorpay keys are not configured in settings!');
      console.log('Please set them in the admin panel.');
    } else {
      console.log('Razorpay keys are configured.');
    }

    console.log('Operation completed successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

updateSettingsAndDeleteTopups();
