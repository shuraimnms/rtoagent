const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Fix Mongoose deprecation warning
mongoose.set('strictQuery', false);

// Import routes
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const reminderRoutes = require('./routes/reminders');
const messageRoutes = require('./routes/messages');
const billingRoutes = require('./routes/billing');
const settingsRoutes = require('./routes/settings');
const adminRoutes = require('./routes/admin');
const importRoutes = require('./routes/import');
const webhookRoutes = require('./routes/webhook');
const notificationRoutes = require('./routes/notifications');
const rtoRoutes = require('./routes/rto');
const auditRoutes = require('./routes/audit');
const assistantRoutes = require('./routes/assistant');
const supportRoutes = require('./routes/support');

// Import services
const schedulerService = require('./services/schedulerService');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500 // Increased limit for development
});
app.use(limiter);

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/reminders', reminderRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/import', importRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/rto', rtoRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/assistant', assistantRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/webhook', webhookRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    endpoints: {
      auth: {
        register: 'POST /api/v1/auth/register',
        login: 'POST /api/v1/auth/login',
        getMe: 'GET /api/v1/auth/me'
      },
      customers: {
        create: 'POST /api/v1/customers',
        list: 'GET /api/v1/customers',
        update: 'PUT /api/v1/customers/:id',
        delete: 'DELETE /api/v1/customers/:id'
      },
      reminders: {
        create: 'POST /api/v1/reminders',
        list: 'GET /api/v1/reminders',
        testMessage: 'POST /api/v1/reminders/test-message'
      }
    }
  });
});

// Start scheduler
schedulerService.start();

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware (should be last)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log('Test the server at: http://localhost:3000/api/test');
  console.log('Health check: http://localhost:3000/health');
});

module.exports = app;