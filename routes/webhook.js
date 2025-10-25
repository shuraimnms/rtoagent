const express = require('express');
const { handleWebhook, handleJojoUpiWebhook, handleRazorpayWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.post('/msg91', handleWebhook);
router.post('/jojoupi', handleJojoUpiWebhook);
router.post('/razorpay', handleRazorpayWebhook);

module.exports = router;
