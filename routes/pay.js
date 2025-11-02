const express = require('express');
const router = express.Router();
const payController = require('../controllers/payController');
const { protect } = require('../middleware/auth');

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

module.exports = router;
