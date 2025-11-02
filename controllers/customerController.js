const Customer = require('../models/Customer');
const Reminder = require('../models/Reminder');

exports.createCustomer = async (req, res) => {
  try {
    const customer = await Customer.create({
      ...req.body,
      created_by_agent: req.agent._id
    });

    res.status(201).json({
      success: true,
      data: { customer }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const customers = await Customer.find({ 
      created_by_agent: req.agent._id 
    })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 });

    const total = await Customer.countDocuments({ 
      created_by_agent: req.agent._id 
    });

    res.json({
      success: true,
      data: { customers },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, created_by_agent: req.agent._id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: { customer }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findOneAndDelete({
      _id: req.params.id,
      created_by_agent: req.agent._id
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    await Reminder.deleteMany({ customer: req.params.id });

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};