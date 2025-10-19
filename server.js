const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { testConnection } = require('./src/config/database');
const { redisClient } = require('./src/config/redis');

// Import all routes
const authRoutes = require('./src/routes/auth');
const agentRoutes = require('./src/routes/agents');
const customerRoutes = require('./src/routes/customers');
const reminderRoutes = require('./src/routes/reminders');
const messageRoutes = require('./src/routes/messages');
const billingRoutes = require('./src/routes/billing');
const webhookRoutes = require('./src/routes/webhooks');
const settingsRoutes = require('./src/routes/settings');
const notificationRoutes = require('./routes/notifications');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/reminders', reminderRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/notifications', notificationRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// Use centralized global error handler (returns JSON consistently)
const { globalErrorHandler } = require('./src/middleware/error');
app.use(globalErrorHandler);

// Start server
const startServer = async () => {
  try {
    // Test database connection
    await testConnection();
    
    // Sync database (remove force: true in production)
    const { sequelize } = require('./src/config/database');
    await sequelize.sync({ force: false });
    console.log('✅ Database synced');

    // Connect to Redis
    await redisClient.connect();
    
    // Start workers
    require('./src/workers/messageWorker');
    require('./src/workers/schedulerWorker');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/v1/settings/app-info`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await redisClient.quit();
  process.exit(0);
});

startServer();