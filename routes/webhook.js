const express = require('express');
const { handleWebhook, handleJojoUpiWebhook, handleCashfreeWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.post('/msg91', handleWebhook);
router.post('/jojoupi', handleJojoUpiWebhook);
router.post('/cashfree', handleCashfreeWebhook);

module.exports = router;
