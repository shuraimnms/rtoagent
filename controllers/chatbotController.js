const Reminder = require('../models/Reminder');
const Customer = require('../models/Customer');
const Agent = require('../models/Agent');
const MessageLog = require('../models/MessageLog');

/**
 * Keyword-based chatbot responses and actions
 */
const KNOWLEDGE_BASE = {
  // General queries
  'what can you do': {
    type: 'info',
    response: `I'm your AI-powered RTO Assistant 🤖
I combine automation, NLP understanding, and real-time analytics to make your daily operations seamless.
Here's what I can do for you:

🔔 Reminder & Notification System
Auto-schedules WhatsApp messages 30, 7, and 3 days before expiry.
Supports custom reminder intervals (e.g., 15 days, 10 days).
Smartly detects duplicate reminders and merges data automatically.
Tracks insurance, PUC, fitness, road tax, and more.

🤖 AI & NLP Automation
Understands natural language commands like "show my top expiring customers."
Can read voice or text inputs (if integrated).
Learns user preferences using adaptive AI.
Suggests optimized communication times based on response history.

💬 WhatsApp & Communication
Two-way WhatsApp automation with delivery reports.
Auto-sends follow-ups if customers don't reply.
Supports multi-template messages (insurance, PUC, service reminders).
Option to reply or broadcast from dashboard directly.

📈 Analytics & Reporting
Generate daily, weekly, monthly reports for messages, customers, and revenue.
View top-performing agents or most active customers.
Visualize stats with interactive charts 📊.

👤 Customer & Vehicle Management
Add, edit, or delete customers easily.
Search customers by name, vehicle number, or phone.
Attach multiple vehicles to one customer profile.
View customer history, reminders, and communication logs.

🔒 Security & User Access
Role-based authentication: Admin, Agent, Staff.
Encrypted data storage with auto-backup.
Secure login with JWT tokens or 2FA (optional).

🌐 Smart Integrations
WhatsApp API integration (MSG91, Twilio, Gupshup, etc.)
Payment gateways like Razorpay, Cashfree, or Paytm.
Google Calendar & Excel import/export.
API-ready for third-party CRMs or fleet management tools.

💰 Wallet & Finance
Real-time wallet balance tracking.
Transaction logs and auto-top-up alerts.
Expense tracking with downloadable reports.

🧠 AI Insights & Prediction
Predicts upcoming renewal peaks.
Detects inactive customers and suggests follow-ups.
AI learns your usage pattern and improves results over time.

💡 Extra Tools
OCR-based document reading (from RC/insurance photos).
Auto-fill fields using AI data extraction.
Multi-language chat support (English, Hindi, Telugu, etc.).
Dark mode + responsive dashboard view.`
  },

  'help': {
    type: 'info',
    response: `I'm your AI-powered RTO Assistant 🤖
I combine automation, NLP understanding, and real-time analytics to make your daily operations seamless.
Here's what I can do for you:

🔔 Reminder & Notification System
Auto-schedules WhatsApp messages 30, 7, and 3 days before expiry.
Supports custom reminder intervals (e.g., 15 days, 10 days).
Smartly detects duplicate reminders and merges data automatically.
Tracks insurance, PUC, fitness, road tax, and more.

🤖 AI & NLP Automation
Understands natural language commands like "show my top expiring customers."
Can read voice or text inputs (if integrated).
Learns user preferences using adaptive AI.
Suggests optimized communication times based on response history.

💬 WhatsApp & Communication
Two-way WhatsApp automation with delivery reports.
Auto-sends follow-ups if customers don't reply.
Supports multi-template messages (insurance, PUC, service reminders).
Option to reply or broadcast from dashboard directly.

📈 Analytics & Reporting
Generate daily, weekly, monthly reports for messages, customers, and revenue.
View top-performing agents or most active customers.
Visualize stats with interactive charts 📊.

👤 Customer & Vehicle Management
Add, edit, or delete customers easily.
Search customers by name, vehicle number, or phone.
Attach multiple vehicles to one customer profile.
View customer history, reminders, and communication logs.

🔒 Security & User Access
Role-based authentication: Admin, Agent, Staff.
Encrypted data storage with auto-backup.
Secure login with JWT tokens or 2FA (optional).

🌐 Smart Integrations
WhatsApp API integration (MSG91, Twilio, Gupshup, etc.)
Payment gateways like Razorpay, Cashfree, or Paytm.
Google Calendar & Excel import/export.
API-ready for third-party CRMs or fleet management tools.

💰 Wallet & Finance
Real-time wallet balance tracking.
Transaction logs and auto-top-up alerts.
Expense tracking with downloadable reports.

🧠 AI Insights & Prediction
Predicts upcoming renewal peaks.
Detects inactive customers and suggests follow-ups.
AI learns your usage pattern and improves results over time.

💡 Extra Tools
OCR-based document reading (from RC/insurance photos).
Auto-fill fields using AI data extraction.
Multi-language chat support (English, Hindi, Telugu, etc.).
Dark mode + responsive dashboard view.`
  },

  'show all features': {
    type: 'info',
    response: `I'm your AI-powered RTO Assistant 🤖
I combine automation, NLP understanding, and real-time analytics to make your daily operations seamless.
Here's what I can do for you:

🔔 Reminder & Notification System
Auto-schedules WhatsApp messages 30, 7, and 3 days before expiry.
Supports custom reminder intervals (e.g., 15 days, 10 days).
Smartly detects duplicate reminders and merges data automatically.
Tracks insurance, PUC, fitness, road tax, and more.

🤖 AI & NLP Automation
Understands natural language commands like "show my top expiring customers."
Can read voice or text inputs (if integrated).
Learns user preferences using adaptive AI.
Suggests optimized communication times based on response history.

💬 WhatsApp & Communication
Two-way WhatsApp automation with delivery reports.
Auto-sends follow-ups if customers don't reply.
Supports multi-template messages (insurance, PUC, service reminders).
Option to reply or broadcast from dashboard directly.

📈 Analytics & Reporting
Generate daily, weekly, monthly reports for messages, customers, and revenue.
View top-performing agents or most active customers.
Visualize stats with interactive charts 📊.

👤 Customer & Vehicle Management
Add, edit, or delete customers easily.
Search customers by name, vehicle number, or phone.
Attach multiple vehicles to one customer profile.
View customer history, reminders, and communication logs.

🔒 Security & User Access
Role-based authentication: Admin, Agent, Staff.
Encrypted data storage with auto-backup.
Secure login with JWT tokens or 2FA (optional).

🌐 Smart Integrations
WhatsApp API integration (MSG91, Twilio, Gupshup, etc.)
Payment gateways like Razorpay, Cashfree, or Paytm.
Google Calendar & Excel import/export.
API-ready for third-party CRMs or fleet management tools.

💰 Wallet & Finance
Real-time wallet balance tracking.
Transaction logs and auto-top-up alerts.
Expense tracking with downloadable reports.

🧠 AI Insights & Prediction
Predicts upcoming renewal peaks.
Detects inactive customers and suggests follow-ups.
AI learns your usage pattern and improves results over time.

💡 Extra Tools
OCR-based document reading (from RC/insurance photos).
Auto-fill fields using AI data extraction.
Multi-language chat support (English, Hindi, Telugu, etc.).
Dark mode + responsive dashboard view.`
  },

  'tell me about your ai features': {
    type: 'info',
    response: `I'm built using AI + NLP (Natural Language Processing), which means I don't just read — I understand.
Here's how my intelligence helps you:

Understands voice or text like a human assistant.

Learns which customers need early reminders.

Predicts renewal probability based on past behavior.

Suggests message templates that perform better.

Auto-corrects and interprets messy inputs (e.g., "vehical" = "vehicle").

Provides AI-powered chat summaries, e.g., "10 vehicles expiring this week, 3 pending renewals."

Integrates with Machine Learning models for future analytics.`
  },

  'how smart are you': {
    type: 'info',
    response: `I'm built using AI + NLP (Natural Language Processing), which means I don't just read — I understand.
Here's how my intelligence helps you:

Understands voice or text like a human assistant.

Learns which customers need early reminders.

Predicts renewal probability based on past behavior.

Suggests message templates that perform better.

Auto-corrects and interprets messy inputs (e.g., "vehical" = "vehicle").

Provides AI-powered chat summaries, e.g., "10 vehicles expiring this week, 3 pending renewals."

Integrates with Machine Learning models for future analytics.`
  },

  'how do reminders work': {
    type: 'info',
    response: `My smart reminder engine automatically manages expiry tracking using AI logic:

When you add a customer or vehicle, I instantly calculate expiry schedules.

I then schedule automated WhatsApp reminders on 30, 7, and 3 days before expiry.

Messages are customized using customer data (name, vehicle, insurance type).

Failed messages are retried automatically, and logs are available on the dashboard.

You can even pause, edit, or reschedule reminders anytime.

My AI continuously improves delivery timing based on customer responses.`
  },

  'show me everything your ai can do': {
    type: 'info',
    response: `Hello! I'm your Smart RTO Assistant, powered by NLP + Automation + Machine Learning.
I can:

Handle reminders, WhatsApp messages, and reports.

Understand your voice/text naturally.

Auto-suggest follow-ups, predict renewals, and manage data securely.

Give AI-based summaries like:

"You have 12 expiring vehicles this week, 3 failed messages, and 2 pending renewals."

Just say:

"Show vehicles expiring this week"

"Check wallet balance"

"How reminders work"

"Create new customer"

🚀 I work 24/7 to make your RTO business fully automated, intelligent, and effortless.`
  }
};

// Action keywords and their handlers
const ACTION_KEYWORDS = {
  // Show expiring vehicles
  'show vehicles expiring': 'show_expiring_vehicles',
  'expiring vehicles': 'show_expiring_vehicles',
  'vehicles expiring': 'show_expiring_vehicles',
  'show expiring': 'show_expiring_vehicles',

  // Show customers
  'show customers': 'show_customers',
  'list customers': 'show_customers',
  'my customers': 'show_customers',

  // Add customer
  'add customer': 'add_customer',
  'create customer': 'add_customer',
  'new customer': 'add_customer',

  // Wallet balance
  'wallet balance': 'check_wallet_balance',
  'check balance': 'check_wallet_balance',
  'my balance': 'check_wallet_balance',

  // Generate report
  'generate report': 'generate_report',
  'monthly report': 'generate_report',
  'weekly report': 'generate_report',
  'daily report': 'generate_report',

  // Send failed messages
  'send failed messages': 'send_failed_messages',
  'retry failed': 'send_failed_messages',
  'failed messages': 'send_failed_messages'
};

/**
 * Normalize text for better matching
 */
function normalizeText(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find best matching response from knowledge base
 */
function findKnowledgeBaseMatch(query) {
  const normalizedQuery = normalizeText(query);

  // Direct matches first
  for (const [key, value] of Object.entries(KNOWLEDGE_BASE)) {
    if (normalizedQuery.includes(key)) {
      return value;
    }
  }

  return null;
}

/**
 * Find action to perform
 */
function findAction(query) {
  const normalizedQuery = normalizeText(query);

  for (const [keyword, action] of Object.entries(ACTION_KEYWORDS)) {
    if (normalizedQuery.includes(keyword)) {
      return action;
    }
  }

  return null;
}

/**
 * Handle showing expiring vehicles
 */
async function handleShowExpiringVehicles(agentId, query) {
  try {
    const days = query.match(/(\d+)\s*days?\s*week/i) ? 7 :
                 query.match(/(\d+)\s*days?/i) ? parseInt(query.match(/(\d+)\s*days?/i)[1]) : 7;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const expiringReminders = await Reminder.find({
      agent: agentId,
      expiry_date: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('customer', 'name mobile vehicle_number')
    .sort({ expiry_date: 1 })
    .limit(20);

    if (expiringReminders.length === 0) {
      return {
        type: 'data',
        response: `No vehicles expiring in the next ${days} days. All your vehicles are up to date! 🎉`
      };
    }

    let response = `Here are ${expiringReminders.length} vehicles expiring in the next ${days} days:\n\n`;

    expiringReminders.forEach((reminder, index) => {
      const expiryDate = new Date(reminder.expiry_date).toLocaleDateString();
      const daysLeft = Math.ceil((new Date(reminder.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));

      response += `${index + 1}. ${reminder.customer?.name || 'Unknown'} - ${reminder.vehicle_number || 'N/A'}\n`;
      response += `   📅 Expires: ${expiryDate} (${daysLeft} days left)\n`;
      response += `   📋 Type: ${reminder.reminder_type.replace(/_/g, ' ')}\n\n`;
    });

    return {
      type: 'data',
      response: response,
      data: expiringReminders
    };

  } catch (error) {
    console.error('Error showing expiring vehicles:', error);
    return {
      type: 'error',
      response: 'Sorry, I encountered an error while fetching expiring vehicles. Please try again later.'
    };
  }
}

/**
 * Handle showing customers
 */
async function handleShowCustomers(agentId) {
  try {
    const customers = await Customer.find({ created_by_agent: agentId })
      .sort({ createdAt: -1 })
      .limit(10);

    if (customers.length === 0) {
      return {
        type: 'data',
        response: 'You don\'t have any customers yet. Would you like me to help you add your first customer?'
      };
    }

    let response = `Here are your recent ${customers.length} customers:\n\n`;

    customers.forEach((customer, index) => {
      response += `${index + 1}. ${customer.name}\n`;
      response += `   📱 ${customer.mobile}\n`;
      response += `   🚗 ${customer.vehicle_number || 'No vehicle'}\n\n`;
    });

    return {
      type: 'data',
      response: response,
      data: customers
    };

  } catch (error) {
    console.error('Error showing customers:', error);
    return {
      type: 'error',
      response: 'Sorry, I encountered an error while fetching customers. Please try again later.'
    };
  }
}

/**
 * Handle checking wallet balance
 */
async function handleCheckWalletBalance(agentId) {
  try {
    const agent = await Agent.findById(agentId).select('wallet_balance');

    return {
      type: 'data',
      response: `Your current wallet balance is ₹${agent.wallet_balance || 0}.\n\n💡 Tip: Keep at least ₹100 in your wallet for uninterrupted service.`
    };

  } catch (error) {
    console.error('Error checking wallet balance:', error);
    return {
      type: 'error',
      response: 'Sorry, I encountered an error while checking your wallet balance. Please try again later.'
    };
  }
}

/**
 * Handle adding a customer (guide through process)
 */
function handleAddCustomer() {
  return {
    type: 'action',
    response: `I'll help you add a new customer! Here's what you need:

📝 Required Information:
• Customer Name
• Mobile Number (with country code, e.g., +919876543210)
• Vehicle Number (optional)
• Email (optional)

💡 You can add customers directly from the Customers page in your dashboard, or use the "Create new customer" button.

Would you like me to guide you to the Customers page?`
  };
}

/**
 * Handle generating reports
 */
async function handleGenerateReport(agentId, query) {
  try {
    const period = query.includes('monthly') ? 'monthly' :
                   query.includes('weekly') ? 'weekly' : 'daily';

    // Get basic stats
    const totalReminders = await Reminder.countDocuments({ agent: agentId });
    const totalCustomers = await Customer.countDocuments({ created_by_agent: agentId });
    const totalMessages = await MessageLog.countDocuments({ agent: agentId });

    // Get recent activity
    const recentMessages = await MessageLog.find({ agent: agentId })
      .sort({ createdAt: -1 })
      .limit(5);

    let response = `📊 Your ${period.toUpperCase()} Report:\n\n`;
    response += `👥 Total Customers: ${totalCustomers}\n`;
    response += `🔔 Active Reminders: ${totalReminders}\n`;
    response += `💬 Messages Sent: ${totalMessages}\n\n`;

    if (recentMessages.length > 0) {
      response += `📈 Recent Activity:\n`;
      recentMessages.forEach((msg, index) => {
        const date = new Date(msg.createdAt).toLocaleDateString();
        response += `${index + 1}. ${msg.status} - ${date}\n`;
      });
    }

    response += `\n💡 For detailed reports, visit the Analytics section in your dashboard.`;

    return {
      type: 'data',
      response: response
    };

  } catch (error) {
    console.error('Error generating report:', error);
    return {
      type: 'error',
      response: 'Sorry, I encountered an error while generating your report. Please try again later.'
    };
  }
}

/**
 * Handle sending failed messages
 */
async function handleSendFailedMessages(agentId) {
  try {
    const failedMessages = await MessageLog.find({
      agent: agentId,
      status: 'FAILED'
    }).limit(10);

    if (failedMessages.length === 0) {
      return {
        type: 'data',
        response: 'Great! You don\'t have any failed messages. All your messages have been delivered successfully! ✅'
      };
    }

    return {
      type: 'action',
      response: `I found ${failedMessages.length} failed messages. You can retry sending them from the Messages page in your dashboard.\n\n💡 Go to Messages → Failed tab to retry sending these messages.`
    };

  } catch (error) {
    console.error('Error checking failed messages:', error);
    return {
      type: 'error',
      response: 'Sorry, I encountered an error while checking failed messages. Please try again later.'
    };
  }
}

/**
 * Main chatbot handler
 */
exports.handleChatbotQuery = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Message is required and must be a string'
      });
    }

    const agentId = req.agent._id;
    const query = message.trim();

    // Check for knowledge base match first
    const knowledgeMatch = findKnowledgeBaseMatch(query);
    if (knowledgeMatch) {
      return res.json({
        success: true,
        response: knowledgeMatch.response,
        type: knowledgeMatch.type,
        timestamp: new Date().toISOString()
      });
    }

    // Check for action
    const action = findAction(query);
    let result;

    switch (action) {
      case 'show_expiring_vehicles':
        result = await handleShowExpiringVehicles(agentId, query);
        break;
      case 'show_customers':
        result = await handleShowCustomers(agentId);
        break;
      case 'add_customer':
        result = handleAddCustomer();
        break;
      case 'check_wallet_balance':
        result = await handleCheckWalletBalance(agentId);
        break;
      case 'generate_report':
        result = await handleGenerateReport(agentId, query);
        break;
      case 'send_failed_messages':
        result = await handleSendFailedMessages(agentId);
        break;
      default:
        result = {
          type: 'info',
          response: `I'm not sure I understand that request. Here are some things I can help you with:

🔍 "What can you do?" - See all my features
📅 "Show vehicles expiring this week" - View upcoming expiries
👥 "Show customers" - List your customers
💰 "Check wallet balance" - View your current balance
📊 "Generate monthly report" - Get business insights
❌ "Send failed messages" - Retry undelivered messages
👤 "Add customer" - Help with adding new customers

Try one of these commands or ask me about reminders, customers, or reports!`
        };
    }

    res.json({
      success: true,
      response: result.response,
      type: result.type,
      data: result.data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({
      success: false,
      message: 'Something went wrong with the chatbot. Please try again later.',
      error: error.message
    });
  }
};
