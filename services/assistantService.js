const Reminder = require('../models/Reminder');
const Transaction = require('../models/Transaction');
const Customer = require('../models/Customer');
const MessageLog = require('../models/MessageLog');
const Fuse = require('fuse.js');
const { v4: uuidv4 } = require('uuid');

// --- 1. Knowledge Base ---
// A simple key-value store for general information.
// This can be expanded or moved to a database.
const knowledgeBase = {
  greeting: {
    keywords: ['hi', 'hello', 'hey', 'yo', 'greetings'],
    response: "Hello! I'm your RTO Assistant. How can I help you today?"
  },
  help: {
    keywords: ['help', 'what can you do', 'guide'],
    response: "I can help you with tasks like: 'show vehicles expiring this week', 'what is my wallet balance?', 'show failed messages', or 'create a new customer'. How can I assist?"
  },
  features: {
    keywords: ['feature', 'features', 'capability', 'capabilities', 'what can you do', 'what can this do'],
    response: "I can help you find expiring reminders, show recent transactions, and navigate the app. This RTO Reminder System helps you manage customer reminders for insurance, PUC, and more, by automatically sending WhatsApp messages before expiry dates."
  },
  pricing: {
    keywords: ['pricing', 'price', 'cost', 'how much', 'plans'],
    response: "Pricing is based on a per-message cost, which is deducted from your agent wallet. You can find more details on the 'Pricing' page. You can top up your wallet in the 'Billing' section."
  },
  billing: {
    keywords: ['billing', 'wallet', 'balance', 'top up', 'topup', 'recharge'],
    response: "You can view your transaction history, check your wallet balance, and add more funds on the 'Billing' page. You can ask me to 'go to billing' to navigate there."
  },
  support: {
    keywords: ['support', 'help', 'contact'],
    response: "For support, please visit the 'Support' page or contact our admin team directly."
  },
  add_customer: {
    keywords: ['add customer', 'new customer', 'create customer'],
    response: "You can add a new customer by going to the 'Customers' page and clicking 'Add Customer'. Or, you can tell me to do it by typing: create customer [Name] [Mobile Number] [Vehicle Number]"
  },
  import_customers: {
    keywords: ['import', 'bulk', 'csv'],
    response: 'To add multiple customers at once, go to the "Customers" page and use the "Import CSV" feature. Make sure your file matches the sample format.'
  },
  create_reminder: {
    keywords: ['create reminder', 'new reminder', 'add reminder'],
    response: 'To create a reminder, go to the "Reminders" page and click "Create Reminder". You will need to select a customer, choose a reminder type, and set the expiry date.'
  },
  how_reminders_work: {
    keywords: ['how do reminders work', 'scheduling', 'automated'],
    response: 'The system automatically schedules messages to be sent at predefined intervals (e.g., 30, 7, and 3 days) before a reminder\'s expiry date.'
  },
  message_status: {
    keywords: ['message status', 'sent', 'delivered', 'failed'],
    response: 'In the "Messages" log, "Sent" means the message left our system. "Delivered" confirms it reached the customer\'s device. "Failed" indicates a delivery problem.'
  }
};

// --- 2. Intent Handlers ---
// Each handler performs an action and returns a response for the chatbot.

async function handleGetExpiringReminders(agentId, params) {
  const { days } = params;
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const reminders = await Reminder.find({
    agent: agentId,
    expiry_date: { $gte: new Date(), $lte: endDate },
    status: { $ne: 'COMPLETED' }
  })
  .populate('customer', 'name vehicle_number')
  .sort({ expiry_date: 1 })
  .limit(10)
  .lean();

  return {
    action: 'show_expiring_reminders',
    payload: { reminders, days },
    message: `Here are the reminders expiring in the next ${days} days.`
  };
}

async function handleNavigate(agentId, params) {
  return {
    action: 'navigate',
    payload: { path: params.path },
    message: params.message
  };
}

async function handleGetTransactions(agentId) {
  const transactions = await Transaction.find({ agent: agentId })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return {
    action: 'show_transactions',
    payload: { transactions },
    message: "Here are your 5 most recent transactions."
  };
}

async function handleGetCustomerDetails(agentId, params) {
  const { searchTerm } = params;

  if (!searchTerm) {
    return {
      action: 'talk',
      message: "Please tell me which customer you're looking for. You can use their name, mobile number, or vehicle number."
    };
  }

  // Build a flexible query
  const query = {
    created_by_agent: agentId,
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { mobile: { $regex: searchTerm, $options: 'i' } },
      { vehicle_number: { $regex: searchTerm, $options: 'i' } }
    ]
  };

  const customer = await Customer.findOne(query).lean();

  if (!customer) {
    return {
      action: 'talk',
      message: `I couldn't find a customer matching "${searchTerm}". Please try again.`
    };
  }

  return {
    action: 'show_customer_details',
    payload: { customer },
    message: `Here are the details for ${customer.name}:`
  };
}

async function handleGetStats(agentId, params) {
  const { entity } = params;
  let count = 0;
  let entityLabel = '';

  if (entity === 'customers') {
    count = await Customer.countDocuments({ created_by_agent: agentId });
    entityLabel = 'customers';
  } else if (entity === 'messages') {
    count = await MessageLog.countDocuments({ agent: agentId });
    entityLabel = 'messages sent';
  } else {
    return { action: 'talk', message: "I'm not sure which total you're asking for." };
  }

  return { action: 'talk', message: `You currently have a total of ${count} ${entityLabel}.` };
}

async function handleGetWalletBalance(agentId) {
  // In a real app, you'd fetch this from the Agent model
  const agent = await require('../models/Agent').findById(agentId).select('wallet_balance');
  if (!agent) {
    return { action: 'talk', message: "I couldn't find your agent profile." };
  }
  return {
    action: 'talk',
    message: `Your current wallet balance is ₹${agent.wallet_balance.toFixed(2)}.`
  };
}

async function handleGetMessageLogs(agentId, params) {
  const { status } = params;
  const logs = await MessageLog.find({ agent: agentId, status: status })
    .populate('reminder', 'customer')
    .populate({ path: 'reminder', populate: { path: 'customer', select: 'name vehicle_number' } })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return {
    action: 'show_message_logs',
    payload: { logs, status },
    message: `Here are your 5 most recent ${status.toLowerCase()} messages.`
  };
}

async function handleCreateCustomer(agentId, params) {
  const { name, mobile, vehicle_number } = params;
  if (!name || !mobile || !vehicle_number) {
    return {
      action: 'talk',
      message: "To create a customer, I need a name, mobile number, and vehicle number. Please try again in the format: create customer [Name] [+91Mobile] [VehicleNo]"
    };
  }

  const customer = await Customer.create({
    name,
    mobile,
    vehicle_number,
    created_by_agent: agentId
  });

  return {
    action: 'talk',
    message: `Successfully created customer: ${customer.name} (${customer.vehicle_number}).`
  };
}

async function handleGetInformation(agentId, params) {
  return {
    action: 'talk',
    message: params.response
  };
}

// --- 3. Intent Registry ---
// A more scalable way to define and match intents.
const intents = [
  {
    name: 'GET_EXPIRING_REMINDERS',
    keywords: ['expiring', 'expire', 'expires', 'due', 'renewal', 'reminders'],
    handler: handleGetExpiringReminders,
    // Extracts parameters like the number of days from the query
    paramExtractor: (query) => {
      let days = 7; // Default to a week
      if (query.includes('month')) days = 30;
      if (query.includes('today')) days = 0;
      if (query.includes('tomorrow')) days = 1;
      if (query.match(/(\d+)\s*days/)) {
        days = parseInt(query.match(/(\d+)\s*days/)[1], 10);
      }
      return { days };
    }
  },
  {
    name: 'NAVIGATE_TOP_UP',
    keywords: ['top up', 'recharge', 'add balance', 'add money', 'buy credit', 'go to billing'],
    handler: handleNavigate,
    getParams: () => ({ path: '/billing', message: "Let's go to the billing page to top up your wallet." })
  },
  {
    name: 'GET_TRANSACTIONS',
    keywords: ['transaction', 'transactions', 'spending', 'history', 'statement'],
    handler: handleGetTransactions
  },
  {
    name: 'CREATE_CUSTOMER',
    keywords: ['create customer', 'new user', 'register customer'], // Made more specific
    handler: handleCreateCustomer,
    paramExtractor: (query) => {
      const parts = query.replace(/create customer|new customer|add customer/i, '').trim().split(' ');
      const mobileRegex = /^\+?\d{10,13}$/;
      const mobile = parts.find(p => mobileRegex.test(p));
      const vehicle_number = parts.find(p => !mobileRegex.test(p) && p.length > 4 && p.match(/[A-Z0-9]/i));
      const name = parts.filter(p => p !== mobile && p !== vehicle_number).join(' ');
      return { name, mobile, vehicle_number };
    }
  },
  {
    name: 'GET_WALLET_BALANCE',
    keywords: ['wallet balance', 'check balance', 'my funds', 'how much money'],
    handler: handleGetWalletBalance
  },
  {
    name: 'GET_FAILED_MESSAGES',
    keywords: ['failed messages', 'undelivered', 'errors'],
    handler: handleGetMessageLogs,
    getParams: () => ({ status: 'FAILED' })
  },
  {
    name: 'GET_SENT_MESSAGES',
    keywords: ['sent messages', 'delivered', 'successful'],
    handler: handleGetMessageLogs,
    getParams: () => ({ status: 'DELIVERED' })
  },
  {
    name: 'GET_STATS',
    keywords: ['total customers', 'how many customers', 'total messages', 'how many messages sent'],
    handler: handleGetStats,
    paramExtractor: (query) => {
      if (query.includes('customer')) {
        return { entity: 'customers' };
      }
      if (query.includes('message')) {
        return { entity: 'messages' };
      }
      return {};
    }
  },
  {
    name: 'GET_CUSTOMER_DETAILS',
    keywords: ['customer details for', 'customer info for', 'find customer', 'get customer', 'show customer'],
    handler: handleGetCustomerDetails,
    paramExtractor: (query) => {
      const searchTerm = query.replace(/customer details for|customer info for|find customer|get customer|show customer/i, '').trim();
      return { searchTerm };
    }
  }
];

/**
 * A more advanced intent detection function.
 * It scores intents based on keyword matches.
 */
const fuseOptions = {
  includeScore: true,
  threshold: 0.3, // Be a bit stricter to avoid wrong matches on short queries
  minMatchCharLength: 3, // Avoid matching on very short, common words
  ignoreLocation: true, // Search for matches anywhere in the string
  keys: ['keywords']
};

const allKeywords = [
  ...intents.map(i => ({ name: i.name, keywords: i.keywords.join(' ') })),
  ...Object.entries(knowledgeBase).map(([name, value]) => ({ name, keywords: value.keywords.join(' ') }))
];

const fuse = new Fuse(allKeywords, fuseOptions);

function detectIntent(query, context) {
  // 1. Check if it's a guidance/knowledge question first
  const guidanceKeywords = ['how to', 'how do', 'what is', 'explain', 'tell me about'];
  if (guidanceKeywords.some(kw => query.startsWith(kw))) {
    const results = fuse.search(query.replace(/['"?]/g, ''));
    if (results.length > 0) {
      const bestMatch = results[0].item;
      const kbEntry = knowledgeBase[bestMatch.name];
      if (kbEntry) {
        return {
          handler: handleGetInformation,
          params: { response: kbEntry.response }
        };
      }
    }
  }

  // 2. Handle follow-up questions based on context
  if (context && context.lastIntent === 'GET_EXPIRING_REMINDERS') {
    const intent = intents.find(i => i.name === 'GET_EXPIRING_REMINDERS');
    const params = intent.paramExtractor(query);
    if (params.days !== 7 || query.includes('week') || query.match(/\d+/)) { // Check if user provided a time
      return { handler: intent.handler, params };
    }
  }

  // 3. Use Fuse.js for fuzzy matching on actionable intents and other knowledge
  const results = fuse.search(query.replace(/['"?]/g, '')); // Sanitize query and search
  if (results.length > 0) {
    const bestMatch = results[0].item;

    // Check if it's a structured intent
    const intent = intents.find(i => i.name === bestMatch.name);
    if (intent) {
      let params = {};
      if (intent.paramExtractor) params = intent.paramExtractor(query);
      else if (intent.getParams) params = intent.getParams();

      // If intent requires params but none were found, ask a follow-up question
      if (intent.name === 'GET_EXPIRING_REMINDERS' && !params.days && !query.match(/\d+/)) {
        return {
          followUp: {
            lastIntent: 'GET_EXPIRING_REMINDERS',
            params: {}
          },
          response: {
            action: 'talk',
            message: "For what time period? (e.g., 'today', 'this week', 'next 30 days')"
          }
        };
      }

      return { handler: intent.handler, params };
    }

    // Check if it's a knowledge base query
    const kbEntry = knowledgeBase[bestMatch.name];
    if (kbEntry) {
      return {
        handler: handleGetInformation,
        params: { response: kbEntry.response }
      };
    }
  }

  return null; // No intent found
}

/**
 * Main service function to process a query.
 */
async function processQuery(query, agentId, context) {
  const intentResult = detectIntent(query.toLowerCase(), context);

  if (!intentResult) {
    // Fallback response if no intent is detected
    return {
      response: {
        action: 'talk',
        message: "I'm not sure how to help with that. You can ask me things like 'show vehicles expiring this week', 'how do I add a customer?', or 'what are your features?'."
      },
      newContext: null // Clear context on failure
    };
  }

  // If the intent is a follow-up question, just return the response
  if (intentResult.followUp) {
    return {
      response: intentResult.response,
      newContext: intentResult.followUp
    };
  }

  // Otherwise, execute the handler
  if (intentResult.handler) {
    const response = await intentResult.handler(agentId, intentResult.params);
    return { response, newContext: null }; // Clear context after successful action
  }
}

module.exports = {
  processQuery
};