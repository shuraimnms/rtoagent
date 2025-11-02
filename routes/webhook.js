const express = require('express');
const { handleWebhook, handleCashfreeWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.post('/msg91', handleWebhook);
router.post('/cashfree', express.raw({ type: 'application/json' }), handleCashfreeWebhook);

module.exports = router;
