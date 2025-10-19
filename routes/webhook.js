const express = require('express');
const { handleWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.post('/msg91', handleWebhook);

module.exports = router;