const express = require('express');
const router = express.Router();
const payController = require('../controllers/payController');
const webhookController = require('../controllers/webhookController');
const { protect } = require('../middleware/auth');

// ✅ Webhook route must be before protect middleware
router.post('/webhook', express.json(), webhookController.handleCashfreeWebhook);

// All pay routes require authentication
router.use(protect);

// Add balance to wallet
router.post('/add-balance', payController.addBalance);

// Get wallet balance
router.get('/balance', payController.getBalance);

// Get transaction history
router.get('/history', payController.getTransactionHistory);

// Initiate wallet top-up
router.post('/topup', payController.initiateTopup);

// Verify payment status
router.get('/verify-payment/:orderId', payController.verifyPayment);

// Manual payment status update (fallback)
router.post('/manual-update/:orderId', payController.manualPaymentUpdate);

module.exports = router;