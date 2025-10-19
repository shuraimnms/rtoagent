const mongoose = require('mongoose');
const Agent = require('../models/Agent');
require('dotenv').config();

const initializeAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const existingAdmin = await Agent.findOne({ email: process.env.ADMIN_EMAIL });
    if (existingAdmin) {
      console.log('Admin user already exists');
      process.exit(0);
    }

    const admin = await Agent.create({
      name: 'Super Admin',
      email: process.env.ADMIN_EMAIL,
      mobile: '+919876543210',
      password: process.env.ADMIN_PASSWORD,
      role: 'super_admin',
      company_name: 'Shuraim Tech',
      wallet_balance: 1000
    });

    console.log('Super admin created successfully:');
    console.log(`Email: ${admin.email}`);
    console.log('Password: (use the one from .env file)');
    
    process.exit(0);
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
};

initializeAdmin();