const Customer = require('../models/Customer');
const Reminder = require('../models/Reminder');
const MessageLog = require('../models/MessageLog');
const Transaction = require('../models/Transaction');
const Agent = require('../models/Agent');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * Process a natural language query and return an appropriate response
 * @param {string} query - The user's query
 * @param {string} agentId - The agent's ID (null if unauthenticated)
 * @param {object} context - Previous context
 * @returns {object} - Response object with action, message, data, newContext
 */
async function processQuery(query, agentId, context) {
  const lowerQuery = query.toLowerCase();

  // Knowledge Base Responses
  if (lowerQuery.includes('what can you do') || lowerQuery.includes('help') || lowerQuery.includes('features')) {
    return {
      action: 'talk',
      message: "I’m your AI-powered RTO Assistant 🤖\n\nI combine automation, NLP understanding, and real-time analytics to make your daily operations seamless.\n\nHere’s what I can do:\n\n🔔 Reminder & Notification System\nAuto-schedules WhatsApp messages 30, 7, and 3 days before expiry.\nSupports custom reminder intervals (e.g., 15 days, 10 days).\nSmartly detects duplicate reminders and merges data automatically.\nTracks insurance, PUC, fitness, road tax, and more.\n\n🤖 AI & NLP Automation\nUnderstands natural language commands like “show my top expiring customers.”\nCan read voice or text inputs (if integrated).\nLearns user preferences using adaptive AI.\nSuggests optimized communication times based on response history.\n\n💬 WhatsApp & Communication\nTwo-way WhatsApp automation with delivery reports.\nAuto-sends follow-ups if customers don’t reply.\nSupports multi-template messages (insurance, PUC, service reminders).\nOption to reply or broadcast from dashboard directly.\n\n📈 Analytics & Reporting\nGenerate daily, weekly, monthly reports for messages, customers, and revenue.\nView top-performing agents or most active customers.\nVisualize stats with interactive charts 📊.\n\n👤 Customer & Vehicle Management\nAdd, edit, or delete customers easily.\nSearch customers by name, vehicle number, or phone.\nAttach multiple vehicles to one customer profile.\nView customer history, reminders, and communication logs.\n\n🔒 Security & User Access\nRole-based authentication: Admin, Agent, Staff.\nEncrypted data storage with auto-backup.\nSecure login with JWT tokens or 2FA (optional).\n\n🌐 Smart Integrations\nWhatsApp API integration (MSG91, Twilio, Gupshup, etc.)\nPayment gateways like Razorpay, Cashfree, or Paytm.\nGoogle Calendar & Excel import/export.\nAPI-ready for third-party CRMs or fleet management tools.\n\n💰 Wallet & Finance\nReal-time wallet balance tracking.\nTransaction logs and auto-top-up alerts.\nExpense tracking with downloadable reports.\n\n🧠 AI Insights & Prediction\nPredicts upcoming renewal peaks.\nDetects inactive customers and suggests follow-ups.\nAI learns your usage pattern and improves results over time.\n\n💡 Extra Tools\nOCR-based document reading (from RC/insurance photos).\nAuto-fill fields using AI data extraction.\nMulti-language chat support (English, Hindi, Telugu, etc.).\nDark mode + responsive dashboard view.",
      data: null,
      newContext: context
    };
  }

  if (lowerQuery.includes('how reminders work') || lowerQuery.includes('reminders')) {
    return {
      action: 'talk',
      message: "My smart reminder engine automatically manages expiry tracking using AI logic:\n\nWhen you add a customer or vehicle, I instantly calculate expiry schedules.\n\nI then schedule automated WhatsApp reminders on 30, 7, and 3 days before expiry.\n\nMessages are customized using customer data (name, vehicle, insurance type).\n\nFailed messages are retried automatically, and logs are available on the dashboard.\n\nYou can even pause, edit, or reschedule reminders anytime.\n\nMy AI continuously improves delivery timing based on customer responses.",
      data: null,
      newContext: context
    };
  }

  // Actionable Intents
  if (lowerQuery.includes('login') || lowerQuery.includes('sign in')) {
    if (agentId) {
      return {
        action: 'talk',
        message: "You are already logged in!",
        data: null,
        newContext: context
      };
    }
    // For login, we need to prompt for credentials, but since it's chat, perhaps navigate to login page
    return {
      action: 'navigate',
      message: "Please provide your login credentials. Redirecting to login page.",
      data: { path: '/login' },
      newContext: context
    };
  }

  if (lowerQuery.includes('show vehicles expiring') || lowerQuery.includes('expiring vehicles')) {
    if (!agentId) {
      return {
        action: 'navigate',
        message: "You need to login first to view expiring vehicles.",
        data: { path: '/login' },
        newContext: context
      };
    }
    const days = lowerQuery.includes('week') ? 7 : lowerQuery.includes('month') ? 30 : 7;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);

    const reminders = await Reminder.find({
      agent: agentId,
      expiryDate: { $lte: expiryDate },
      status: 'active'
    }).populate('customer').limit(10);

    return {
      action: 'show_expiring_reminders',
      message: `Here are vehicles expiring in the next ${days} days:`,
      data: { reminders, days },
      newContext: context
    };
  }

  if (lowerQuery.includes('check wallet') || lowerQuery.includes('wallet balance')) {
    if (!agentId) {
      return {
        action: 'navigate',
        message: "You need to login first to check wallet balance.",
        data: { path: '/login' },
        newContext: context
      };
    }
    const agent = await Agent.findById(agentId);
    return {
      action: 'talk',
      message: `Your current wallet balance is ₹${agent.walletBalance || 0}.`,
      data: null,
      newContext: context
    };
  }

  if (lowerQuery.includes('show message logs') || lowerQuery.includes('failed messages')) {
    if (!agentId) {
      return {
        action: 'navigate',
        message: "You need to login first to view message logs.",
        data: { path: '/login' },
        newContext: context
      };
    }
    const logs = await MessageLog.find({ agent: agentId }).sort({ createdAt: -1 }).limit(10);
    return {
      action: 'show_message_logs',
      message: "Here are your recent message logs:",
      data: { logs },
      newContext: context
    };
  }

  if (lowerQuery.includes('create customer') || lowerQuery.includes('add customer')) {
    if (!agentId) {
      return {
        action: 'navigate',
        message: "You need to login first to create a customer.",
        data: { path: '/login' },
        newContext: context
      };
    }
    // For simplicity, assume we need more info, but in real, parse from query or navigate
    return {
      action: 'navigate',
      message: "Redirecting to add customer page.",
      data: { path: '/customers' },
      newContext: context
    };
  }

  // Default response
  return {
    action: 'talk',
    message: "I'm sorry, I didn't understand that. Try asking 'What can you do?' or 'Show vehicles expiring this week'.",
    data: null,
    newContext: context
  };
}

module.exports = {
  processQuery
};
