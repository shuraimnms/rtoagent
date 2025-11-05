const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController'); // Use consolidated controller
const { protect } = require('../middleware/auth');

// All pay routes require authentication
router.use(protect);

// Add balance to wallet
router.post('/add-balance', paymentController.addBalance);

// Get wallet balance
router.get('/balance', paymentController.getBalance);

// Get transaction history
router.get('/history', paymentController.getTransactionHistory);

// Initiate wallet top-up
router.post('/topup', paymentController.initiateTopup);

// Verify payment status
router.get('/verify-payment/:orderId', paymentController.verifyPayment);

// Manual payment status update (fallback)
router.post('/manual-update/:orderId', paymentController.manualPaymentUpdate);

module.exports = router;
