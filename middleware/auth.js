const jwt = require('jsonwebtoken');
const Agent = require('../models/Agent');

exports.protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Please login to access this resource'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const agent = await Agent.findById(decoded.id);

    if (!agent) {
      return res.status(401).json({
        success: false,
        message: 'Agent not found'
      });
    }

    req.agent = agent;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.agent.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.agent.role} is not authorized to access this resource`
      });
    }
    next();
  };
};