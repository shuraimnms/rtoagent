const SupportTicket = require('../models/SupportTicket');

/**
 * @desc    Create a new support ticket
 * @route   POST /api/v1/support/tickets
 * @access  Private (Agent)
 */
exports.createTicket = async (req, res) => {
  try {
    const { subject, category, priority, message } = req.body;

    const ticket = await SupportTicket.create({
      agent: req.agent._id,
      subject,
      category,
      priority,
      messages: [{ sender: req.agent._id, message }]
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all tickets for the logged-in agent
 * @route   GET /api/v1/support/tickets
 * @access  Private (Agent)
 */
exports.getAgentTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ agent: req.agent._id })
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get a single ticket by ID
 * @route   GET /api/v1/support/tickets/:id
 * @access  Private (Agent or Admin)
 */
exports.getTicketById = async (req, res) => {
  try {
    const query = { _id: req.params.id };
    // Agents can only see their own tickets
    if (req.agent.role !== 'super_admin') {
      query.agent = req.agent._id;
    }

    const ticket = await SupportTicket.findOne(query)
      .populate('agent', 'name email')
      .populate('messages.sender', 'name email role');

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Add a message to a ticket
 * @route   POST /api/v1/support/tickets/:id/messages
 * @access  Private (Agent or Admin)
 */
exports.addMessageToTicket = async (req, res) => {
  try {
    const { message } = req.body;
    const query = { _id: req.params.id };
    if (req.agent.role !== 'super_admin') {
      query.agent = req.agent._id;
    }

    const ticket = await SupportTicket.findOne(query);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    ticket.messages.push({ sender: req.agent._id, message });
    // If an agent replies, re-open the ticket
    if (req.agent.role !== 'super_admin' && ticket.status === 'closed') {
      ticket.status = 'open';
    }
    await ticket.save();

    await ticket.populate('messages.sender', 'name email role');

    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all tickets (for admin)
 * @route   GET /api/v1/admin/support/tickets
 * @access  Private (Admin)
 */
exports.getAllTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find()
      .populate('agent', 'name email')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: tickets });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Update ticket status or priority (for admin)
 * @route   PUT /api/v1/admin/support/tickets/:id
 * @access  Private (Admin)
 */
exports.updateTicket = async (req, res) => {
  try {
    const { status, priority } = req.body;
    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;

    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: ticket });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};