const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

// All payment routes require authentication
router.use(protect);

// Create payment link
router.post('/create-link', paymentController.createPaymentLink);

// Verify payment
router.post('/verify', paymentController.verifyPayment);

// Get payment history
router.get('/history', paymentController.getPaymentHistory);

module.exports = router;