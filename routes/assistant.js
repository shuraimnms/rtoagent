const express = require('express');
const router = express.Router();
const { processQuery } = require('../controllers/assistantController');
const { protect } = require('../middleware/auth');

// @route   POST /api/v1/assistant/query
router.post('/query', processQuery);

module.exports = router;