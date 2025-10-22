const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const Agent = require('./models/Agent');
    const Customer = require('./models/Customer');
    const Reminder = require('./models/Reminder');
    const MessageLog = require('./models/MessageLog');
    const Transaction = require('./models/Transaction');

    const [agents, customers, reminders, messages, revenue] = await Promise.all([
      Agent.countDocuments(),
      Customer.countDocuments(),
      Reminder.countDocuments(),
      MessageLog.countDocuments(),
      Transaction.aggregate([{$match: {type: 'topup'}}, {$group: {_id: null, total: {$sum: '$amount'}}}])
    ]);

    console.log('Database Data:', {
      agents,
      customers,
      reminders,
      messages,
      revenue: revenue[0] ? revenue[0].total : 0
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkDatabase();
