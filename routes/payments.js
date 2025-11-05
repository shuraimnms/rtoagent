const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController'); // Use consolidated controller
const { protect } = require('../middleware/auth');

// Public webhook (called by Cashfree)
router.post('/webhook', paymentController.handleCashfreeWebhook);

// Protected routes
router.use(protect);
// The /verify route here is redundant with /api/v1/pay/verify-payment/:orderId
// and create-order functionality is covered by /api/v1/pay/topup
// Keeping only webhook here for clarity, other routes are handled by /api/v1/pay
// If there's a specific reason for a separate /payments/verify or /payments/create-order,
// it should be explicitly defined and differentiated from the /pay routes.
// For now, assuming /pay routes are primary.
// router.post('/verify', paymentController.verifyPayment); // Redundant with /api/v1/pay/verify-payment/:orderId
// router.post('/create-order', paymentController.createPaymentOrder); // Redundant with /api/v1/pay/topup

module.exports = router;
