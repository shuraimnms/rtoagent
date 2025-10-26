const express = require('express');
const { handleWebhook, handleJojoUpiWebhook } = require('../controllers/webhookController');

const router = express.Router();

router.post('/msg91', handleWebhook);
router.post('/jojoupi', handleJojoUpiWebhook);

module.exports = router;
