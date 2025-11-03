const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(async () => {
  console.log('Connected to MongoDB');

  const Transaction = require('./models/Transaction');
  const Agent = require('./models/Agent');

  // Check recent transactions
  console.log('\n=== RECENT TRANSACTIONS ===');
  const transactions = await Transaction.find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('agent', 'name email wallet_balance');

  transactions.forEach((tx, index) => {
    console.log(`${index + 1}. Transaction ID: ${tx.transaction_id}`);
    console.log(`   Status: ${tx.payment_status}`);
    console.log(`   Amount: ${tx.amount}`);
    console.log(`   Agent: ${tx.agent?.name} (${tx.agent?.email})`);
    console.log(`   Agent Balance: ${tx.agent?.wallet_balance}`);
    console.log(`   Created: ${tx.createdAt}`);
    console.log('---');
  });

  // Check agents with balances
  console.log('\n=== AGENTS WITH BALANCES ===');
  const agents = await Agent.find({ wallet_balance: { $gt: 0 } })
    .select('name email wallet_balance')
    .sort({ wallet_balance: -1 });

  agents.forEach((agent, index) => {
    console.log(`${index + 1}. ${agent.name} (${agent.email}): ₹${agent.wallet_balance}`);
  });

  process.exit(0);
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});
