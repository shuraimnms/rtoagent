const express = require('express');
const { handleWebhook, handleCashfreeWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.post('/msg91', handleWebhook);
router.post('/cashfree', handleCashfreeWebhook);

module.exports = router;
