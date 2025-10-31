const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  senderRole: {
    type: String,
    enum: ['agent', 'admin'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isVoiceMessage: {
    type: Boolean,
    default: false
  },
  voiceTranscription: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  subject: {
    type: String,
    required: true,
    enum: ['Payment', 'WhatsApp Issue', 'API Error', 'Renewal', 'Others']
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
    default: 'Open'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  category: {
    type: String,
    enum: ['Technical', 'Billing', 'Feature Request', 'General'],
    default: 'General'
  },
  // Agent who created the ticket
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent',
    required: true
  },
  // Admin assigned to handle the ticket
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agent'
  },
  // Conversation messages
  messages: [messageSchema],

  // Attachments for the initial ticket
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // AI-powered features
  aiSummary: {
    summary: String,
    generatedAt: Date
  },
  aiTranslation: {
    originalLanguage: String,
    translatedText: String,
    targetLanguage: {
      type: String,
      default: 'en'
    },
    translatedAt: Date
  },
  aiSentiment: {
    score: Number, // -1 to 1
    label: {
      type: String,
      enum: ['negative', 'neutral', 'positive']
    },
    confidence: Number,
    analyzedAt: Date
  },
  aiTags: [{
    tag: String,
    confidence: Number
  }],
  aiDuplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupportTicket'
  },

  // Rating and feedback
  rating: {
    stars: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    ratedAt: Date,
    ratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent'
    }
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  resolvedAt: Date,
  closedAt: Date,

  // Escalation tracking
  escalated: {
    type: Boolean,
    default: false
  },
  escalatedAt: Date,
  escalationReason: String,

  // Response time tracking
  firstResponseTime: Number, // in minutes
  resolutionTime: Number, // in minutes
  totalResponseTime: Number // in minutes
}, {
  timestamps: true
});

// Indexes for performance
supportTicketSchema.index({ createdBy: 1, createdAt: -1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });
supportTicketSchema.index({ status: 1, priority: -1, createdAt: -1 });
supportTicketSchema.index({ subject: 1 });
supportTicketSchema.index({ ticketNumber: 1 });

// Ticket number is generated in the controller to avoid pre-save issues

// Virtual for ticket age
supportTicketSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)); // days
});

// Method to calculate response times
supportTicketSchema.methods.calculateResponseTimes = function() {
  if (this.messages.length > 1) {
    const firstAdminResponse = this.messages.find(msg => msg.senderRole === 'admin');
    if (firstAdminResponse) {
      this.firstResponseTime = Math.floor((firstAdminResponse.timestamp - this.createdAt) / (1000 * 60));
    }
  }

  if (this.resolvedAt) {
    this.resolutionTime = Math.floor((this.resolvedAt - this.createdAt) / (1000 * 60));
  }

  // Calculate total response time (sum of admin response times)
  let totalResponseTime = 0;
  let lastAdminMessage = null;

  this.messages.forEach(message => {
    if (message.senderRole === 'admin') {
      if (lastAdminMessage) {
        totalResponseTime += (message.timestamp - lastAdminMessage.timestamp) / (1000 * 60);
      }
      lastAdminMessage = message.timestamp;
    }
  });

  this.totalResponseTime = Math.floor(totalResponseTime);
};

// Fix: Check if model already exists before creating
module.exports = mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);
