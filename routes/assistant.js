const express = require('express');
const router = express.Router();
const { processQuery } = require('../controllers/assistantController');
const { protect } = require('../middleware/auth');

// @route   POST /api/v1/assistant/query
// @desc    Process a natural language query
router.post('/query', protect, processQuery);

module.exports = router;