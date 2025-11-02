const SupportTicket = require('../models/SupportTicket');
const Agent = require('../models/Agent');

// Mock AI functions (replace with actual AI API calls)
const mockAISummary = async (text) => {
  return `Summary: ${text.substring(0, 100)}...`;
};

const mockAITranslation = async (text, targetLang = 'en') => {
  // Mock translation - in real implementation, use Google Translate API or similar
  return {
    originalLanguage: 'hi', // Mock detection
    translatedText: text, // Mock translation
    targetLanguage: targetLang
  };
};

const mockAISentiment = async (text) => {
  // Mock sentiment analysis
  return {
    score: 0.2,
    label: 'neutral',
    confidence: 0.8
  };
};

const mockAITagging = async (text) => {
  // Mock auto-tagging
  const tags = [];
  if (text.toLowerCase().includes('payment')) tags.push({ tag: 'Payment Issue', confidence: 0.9 });
  if (text.toLowerCase().includes('whatsapp')) tags.push({ tag: 'WhatsApp Error', confidence: 0.85 });
  return tags;
};

// @desc    Create a new support ticket
// @route   POST /api/v1/support/tickets
// @access  Private (Agents only)
exports.createTicket = async (req, res) => {
  try {
    const { subject, description, priority = 'Medium' } = req.body;
    const agentId = req.agent._id; // Use req.agent._id for agents

    // Process AI features
    const [aiSummary, aiTranslation, aiSentiment, aiTags] = await Promise.all([
      mockAISummary(description),
      mockAITranslation(description),
      mockAISentiment(description),
      mockAITagging(description)
    ]);

    // Determine category based on subject
    const categoryMap = {
      'Payment': 'Billing',
      'WhatsApp Issue': 'Technical',
      'API Error': 'Technical',
      'Renewal': 'Billing',
      'Others': 'General'
    };

    const category = categoryMap[subject] || 'General';

    // Generate ticket number
    const count = await SupportTicket.countDocuments();
    const ticketNumber = `TICK-${String(count + 1).padStart(6, '0')}`;

    // Handle file attachments
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: `/uploads/support/${file.filename}`
        });
      });
    }

    const ticket = await SupportTicket.create({
      ticketNumber,
      subject,
      description,
      priority,
      category,
      createdBy: agentId,
      attachments,
      aiSummary: {
        summary: aiSummary,
        generatedAt: new Date()
      },
      aiTranslation: {
        ...aiTranslation,
        translatedAt: new Date()
      },
      aiSentiment: {
        ...aiSentiment,
        analyzedAt: new Date()
      },
      aiTags
    });

    await ticket.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket'
    });
  }
};

// @desc    Get agent's tickets
// @route   GET /api/v1/support/tickets
// @access  Private (Agents only)
exports.getAgentTickets = async (req, res) => {
  try {
    const agentId = req.agent._id; // Use req.agent._id for agents
    const { status, priority, search, page = 1, limit = 10 } = req.query;

    const query = { createdBy: agentId };
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const tickets = await SupportTicket.find(query)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await SupportTicket.countDocuments(query);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get agent tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets',
      data: [] // Ensure data is always an array
    });
  }
};

// @desc    Get single ticket with messages
// @route   GET /api/v1/support/tickets/:id
// @access  Private
exports.getTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('messages.sender', 'name email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user has permission to view this ticket
    const agentId = req.agent ? req.agent._id : req.user._id;
    const isCreator = ticket.createdBy._id.toString() === agentId.toString();
    const isAssignedAdmin = req.agent && (req.agent.role === 'admin' || req.agent.role === 'super_admin');
    const isAssignedToTicket = ticket.assignedTo && ticket.assignedTo._id.toString() === agentId.toString();

    if (!isCreator && !isAssignedAdmin && !isAssignedToTicket) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this ticket'
      });
    }

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket'
    });
  }
};

// @desc    Add message to ticket
// @route   POST /api/v1/support/tickets/:id/messages
// @access  Private
exports.addMessage = async (req, res) => {
  try {
    const { message } = req.body;
    const ticketId = req.params.id;
    const agentId = req.agent._id;
    const agentRole = req.agent.role === 'admin' || req.agent.role === 'super_admin' ? 'admin' : 'agent';

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check permissions
    const isCreator = ticket.createdBy.toString() === agentId.toString();
    const isAdmin = agentRole === 'admin';
    const isAssigned = ticket.assignedTo && ticket.assignedTo.toString() === agentId.toString();

    if (!isCreator && !isAdmin && !isAssigned) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reply to this ticket'
      });
    }

    // Handle file attachments
    const attachments = [];
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        attachments.push({
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: `/uploads/support/${file.filename}`
        });
      });
    }

    const newMessage = {
      sender: agentId,
      senderRole: agentRole,
      message,
      attachments,
      timestamp: new Date()
    };

    ticket.messages.push(newMessage);

    // Update ticket status if admin is responding
    if (agentRole === 'admin' && ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }

    // Calculate response times
    ticket.calculateResponseTimes();

    await ticket.save();
    await ticket.populate('messages.sender', 'name email');

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message'
    });
  }
};

// @desc    Rate ticket resolution
// @route   POST /api/v1/support/tickets/:id/rate
// @access  Private (Agents only)
exports.rateTicket = async (req, res) => {
  try {
    const { stars, feedback } = req.body;
    const ticketId = req.params.id;
    const agentId = req.agent._id;

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Only ticket creator can rate
    if (ticket.createdBy.toString() !== agentId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to rate this ticket'
      });
    }

    // Only resolved tickets can be rated
    if (ticket.status !== 'Resolved' && ticket.status !== 'Closed') {
      return res.status(400).json({
        success: false,
        message: 'Can only rate resolved tickets'
      });
    }

    ticket.rating = {
      stars: parseInt(stars),
      feedback,
      ratedAt: new Date(),
      ratedBy: agentId
    };

    await ticket.save();

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Rate ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate ticket'
    });
  }
};

// Admin-only functions

// @desc    Get all tickets (Admin)
// @route   GET /api/v1/support/admin/tickets
// @access  Private (Admins only)
exports.getAllTickets = async (req, res) => {
  try {
    const {
      status,
      priority,
      assignedTo,
      subject,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (subject) query.subject = subject;

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const tickets = await SupportTicket.find(query)
      .populate('createdBy', 'name email company_name')
      .populate('assignedTo', 'name email')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await SupportTicket.countDocuments(query);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get all tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets'
    });
  }
};

// @desc    Assign ticket to admin
// @route   PUT /api/v1/support/admin/tickets/:id/assign
// @access  Private (Admins only)
exports.assignTicket = async (req, res) => {
  try {
    const { assignedTo } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    ticket.assignedTo = assignedTo;
    if (assignedTo && ticket.status === 'Open') {
      ticket.status = 'In Progress';
    }

    await ticket.save();
    await ticket.populate('assignedTo', 'name email');

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Assign ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign ticket'
    });
  }
};

// @desc    Update ticket status
// @route   PUT /api/v1/support/admin/tickets/:id/status
// @access  Private (Admins only)
exports.updateTicketStatus = async (req, res) => {
  try {
    const { status, resolutionNote } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    ticket.status = status;

    if (status === 'Resolved') {
      ticket.resolvedAt = new Date();
      ticket.calculateResponseTimes();
    } else if (status === 'Closed') {
      ticket.closedAt = new Date();
    }

    await ticket.save();

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
};

// @desc    Update ticket details
// @route   PUT /api/v1/support/tickets/:id
// @access  Private
exports.updateTicket = async (req, res) => {
  try {
    const { subject, description, priority } = req.body;
    const ticketId = req.params.id;
    const agentId = req.agent._id;
    const agentRole = req.agent.role === 'admin' || req.agent.role === 'super_admin' ? 'admin' : 'agent';

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check permissions - only creator or admin can update
    const isCreator = ticket.createdBy.toString() === agentId.toString();
    const isAdmin = agentRole === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this ticket'
      });
    }

    // Update fields
    if (subject) ticket.subject = subject;
    if (description) ticket.description = description;
    if (priority) ticket.priority = priority;

    await ticket.save();
    await ticket.populate('createdBy', 'name email company_name');
    await ticket.populate('assignedTo', 'name email');

    res.json({
      success: true,
      data: ticket
    });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket'
    });
  }
};

// @desc    Delete ticket
// @route   DELETE /api/v1/support/tickets/:id
// @access  Private
exports.deleteTicket = async (req, res) => {
  try {
    const ticketId = req.params.id;
    const agentId = req.agent._id;
    const agentRole = req.agent.role === 'admin' || req.agent.role === 'super_admin' ? 'admin' : 'agent';

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check permissions - only creator or admin can delete
    const isCreator = ticket.createdBy.toString() === agentId.toString();
    const isAdmin = agentRole === 'admin';

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this ticket'
      });
    }

    await SupportTicket.findByIdAndDelete(ticketId);

    res.json({
      success: true,
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ticket'
    });
  }
};

// @desc    Delete all tickets
// @route   DELETE /api/v1/support/admin/tickets/delete-all
// @access  Private (Admins only)
exports.deleteAllTickets = async (req, res) => {
  try {
    const result = await SupportTicket.deleteMany({});
    res.json({
      success: true,
      message: `${result.deletedCount} tickets deleted successfully`
    });
  } catch (error) {
    console.error('Delete all tickets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all tickets'
    });
  }
};

// @desc    Get support analytics
// @route   GET /api/v1/support/admin/analytics
// @access  Private (Admins only)
exports.getAnalytics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Basic stats
    const totalTickets = await SupportTicket.countDocuments();
    const openTickets = await SupportTicket.countDocuments({ status: 'Open' });
    const resolvedTickets = await SupportTicket.countDocuments({ status: 'Resolved' });
    const avgResolutionTime = await SupportTicket.aggregate([
      { $match: { resolvedAt: { $exists: true } } },
      { $group: { _id: null, avgTime: { $avg: '$resolutionTime' } } }
    ]);

    // Tickets by subject
    const ticketsBySubject = await SupportTicket.aggregate([
      { $group: { _id: '$subject', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Recent activity (last 30 days)
    const recentTickets = await SupportTicket.find({
      createdAt: { $gte: thirtyDaysAgo }
    }).countDocuments();

    // Agent satisfaction (average rating)
    const avgRating = await SupportTicket.aggregate([
      { $match: { 'rating.stars': { $exists: true } } },
      { $group: { _id: null, avgRating: { $avg: '$rating.stars' } } }
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalTickets,
          openTickets,
          resolvedTickets,
          avgResolutionTime: avgResolutionTime[0]?.avgTime || 0,
          avgRating: avgRating[0]?.avgRating || 0
        },
        ticketsBySubject,
        recentActivity: {
          last30Days: recentTickets
        }
      }
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
};
