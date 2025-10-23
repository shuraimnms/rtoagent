const express = require('express');
const router = express.Router();
const { handleChatbotQuery } = require('../controllers/chatbotController');
const { protect } = require('../middleware/auth');

// POST /api/v1/chatbot/query - Handle chatbot queries
router.post('/query', protect, handleChatbotQuery);

module.exports = router;
