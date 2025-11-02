const express = require('express');
const { handleWebhook, handleCashfreeWebhook } = require('../controllers/webhookController');

const router = express.Router();

// ✅ MSG91 Webhook
router.post('/msg91', handleWebhook);

// ✅ Cashfree Webhook (must use raw body for signature verification)
router.post('/cashfree', express.raw({ type: 'application/json' }), handleCashfreeWebhook);

module.exports = router;
