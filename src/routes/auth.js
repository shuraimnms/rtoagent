const express = require('express');
const { body } = require('express-validator');
const { Agent } = require('../models/associations');
const { signToken } = require('../utils/jwt');
const { protect } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/error');

const router = express.Router();

// Register agent (superadmin only)
router.post('/register', 
  protect,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('mobile').isMobilePhone().withMessage('Valid mobile number is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['superadmin', 'agent', 'support']).withMessage('Invalid role')
  ],
  asyncHandler(async (req, res, next) => {
    // Check if agent is superadmin
    if (req.agent.role !== 'superadmin') {
      return next(new AppError('Only superadmin can register new agents', 403));
    }

    const { name, email, mobile, password, role } = req.body;

    // Check if agent already exists
    const existingAgent = await Agent.findOne({
      where: { $or: [{ email }, { mobile }] }
    });

    if (existingAgent) {
      return next(new AppError('Agent with this email or mobile already exists', 400));
    }

    // Create new agent
    const newAgent = await Agent.create({
      name,
      email,
      mobile,
      password,
      role
    });

    // Remove password from output
    const agentResponse = {
      id: newAgent.id,
      name: newAgent.name,
      email: newAgent.email,
      mobile: newAgent.mobile,
      role: newAgent.role,
      wallet_balance: newAgent.wallet_balance,
      created_at: newAgent.created_at
    };

    res.status(201).json({
      status: 'success',
      message: 'Agent registered successfully',
      data: { agent: agentResponse }
    });
  })
);

// Login
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  asyncHandler(async (req, res, next) => {
    try {
      const { email, password } = req.body;
      console.log('Auth login attempt for email:', email);

      // Check if agent exists and password is correct
      const agent = await Agent.findOne({ where: { email } });
      console.log('Agent lookup result:', !!agent);

      if (!agent) {
        console.log('Auth failed: agent not found for', email);
        return next(new AppError('Incorrect email or password', 401));
      }

      const passwordMatches = await agent.correctPassword(password, agent.password);
      console.log('Password match:', passwordMatches);

      if (!passwordMatches) {
        console.log('Auth failed: incorrect password for', email);
        return next(new AppError('Incorrect email or password', 401));
      }

      if (!agent.is_active) {
        console.log('Auth failed: account deactivated for', email);
        return next(new AppError('Your account has been deactivated', 401));
      }

      // Generate token
      const token = signToken(agent.id, agent.role);

      // Remove password from output
      const agentResponse = {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        mobile: agent.mobile,
        role: agent.role,
        wallet_balance: agent.wallet_balance,
        created_at: agent.created_at
      };

      console.log('Auth success for', email);

      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: {
          agent: agentResponse,
          token
        }
      });
    } catch (err) {
      console.error('Auth login error:', err);
      return next(err);
    }
  })
);

// Get current agent
router.get('/me',
  protect,
  asyncHandler(async (req, res) => {
    res.status(200).json({
      status: 'success',
      data: {
        agent: req.agent
      }
    });
  })
);

// Update password
router.patch('/update-password',
  protect,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
  ],
  asyncHandler(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    // Get agent with password
    const agent = await Agent.findByPk(req.agent.id);

    // Check if current password is correct
    if (!(await agent.correctPassword(currentPassword, agent.password))) {
      return next(new AppError('Your current password is incorrect', 401));
    }

    // Update password
    agent.password = newPassword;
    await agent.save();

    // Generate new token
    const token = signToken(agent.id, agent.role);

    res.status(200).json({
      status: 'success',
      message: 'Password updated successfully',
      data: { token }
    });
  })
);

// Logout (client-side token removal)
router.post('/logout',
  protect,
  asyncHandler(async (req, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Logged out successfully'
    });
  })
);

module.exports = router;