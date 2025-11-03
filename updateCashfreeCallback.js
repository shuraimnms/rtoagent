const mongoose = require('mongoose');
const Settings = require('./models/Settings');
require('dotenv').config({ path: './.env' });

const updateCallbackUrl = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected...');

    const correctCallbackUrl = `${process.env.FRONTEND_URL}/api/v1/webhooks/cashfree`;

    const settings = await Settings.findOne();

    if (settings) {
      if (settings.cashfree && settings.cashfree.callbackUrl !== correctCallbackUrl) {
        settings.cashfree.callbackUrl = correctCallbackUrl;
        await settings.save();
        console.log(`✅ Cashfree callbackUrl updated to: ${correctCallbackUrl}`);
      } else if (!settings.cashfree) {
        // If cashfree object doesn't exist, create it and set callbackUrl
        settings.cashfree = {
          callbackUrl: correctCallbackUrl,
          enabled: false, // default to false, user can enable from admin panel
          appId: '',
          secretKey: '',
          productionBaseUrl: 'https://api.cashfree.com/pg',
          sandboxBaseUrl: 'https://sandbox.cashfree.com/pg',
          isProduction: false
        };
        await settings.save();
        console.log(`✅ Cashfree object created and callbackUrl set to: ${correctCallbackUrl}`);
      } else {
        console.log('Cashfree callbackUrl is already correct or not set in settings.cashfree.callbackUrl.');
      }
    } else {
      console.warn('⚠️ No Settings document found. Please ensure your application initializes settings.');
    }
  } catch (error) {
    console.error('❌ Error updating Cashfree callback URL:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB Disconnected.');
  }
};

updateCallbackUrl();
