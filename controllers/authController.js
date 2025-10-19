const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent');

const signToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, mobile, password, company_name, role } = req.body;

    const existingAgent = await Agent.findOne({ email });
    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Agent already exists with this email'
      });
    }

    const agent = await Agent.create({
      name,
      email,
      mobile,
      password,
      company_name,
      role: role || 'agent_admin'
    });

    const token = signToken(agent._id);

    res.status(201).json({
      success: true,
      token,
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          email: agent.email,
          role: agent.role,
          wallet_balance: agent.wallet_balance
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const agent = await Agent.findOne({ email }).select('+password');
    
    if (!agent || !(await agent.correctPassword(password, agent.password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = signToken(agent._id);

    res.json({
      success: true,
      token,
      data: {
        agent: {
          id: agent._id,
          name: agent.name,
          email: agent.email,
          role: agent.role,
          wallet_balance: agent.wallet_balance
        }
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    // Fetch the agent with settings
    const agent = await Agent.findById(req.agent._id).select('-password');

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    res.json({
      success: true,
      data: {
        agent
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
