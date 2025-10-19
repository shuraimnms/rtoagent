const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

// All settings routes require authentication
router.use(protect);

// Settings routes
router.get('/', settingsController.getSettings);
router.put('/', settingsController.updateSettings);
router.put('/password', settingsController.updatePassword);

module.exports = router;
