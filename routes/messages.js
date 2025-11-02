const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getMessageLogs,
  getMessageStats,
  retryFailedMessages
} = require('../controllers/messageController');

// All message routes require authentication
router.use(protect);

// GET /api/v1/messages - Get message logs
router.get('/', getMessageLogs);

// GET /api/v1/messages/stats - Get message statistics
router.get('/stats', getMessageStats);

// POST /api/v1/messages/retry-failed - Retry failed messages
router.post('/retry-failed', retryFailedMessages);

// GET /api/v1/messages/templates - Get message templates (from MSG91)
router.get('/templates', async (req, res) => {
  try {
    const msg91Service = require('../services/msg91Service');
    const templateResult = await msg91Service.getTemplates();

    res.json({
      success: true,
      data: templateResult
    });
  } catch (error) {
    console.error('Error fetching MSG91 templates:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching templates',
      error: error.message
    });
  }
});

module.exports = router;
