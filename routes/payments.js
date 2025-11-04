const express = require('express');
const {
  handleCashfreeWebhook,
  verifyPayment,
  createPaymentOrder
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public webhook (called by Cashfree)
router.post('/webhook', handleCashfreeWebhook);

// Protected routes
router.use(protect);
router.post('/verify', verifyPayment);
router.post('/create-order', createPaymentOrder);

module.exports = router;
