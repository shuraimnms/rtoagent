const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');
const { protect } = require('../middleware/auth');

// All billing routes require authentication
router.use(protect);

// Wallet balance routes
router.get('/wallet/balance', billingController.getWalletBalance);
router.post('/wallet/topup', billingController.createTopupOrder);
router.post('/wallet/topup/verify', billingController.verifyTopupPayment);

// Transaction routes
router.get('/transactions', billingController.getTransactions);

// Invoice routes
router.get('/invoices', billingController.getInvoices);
router.get('/invoices/:id', billingController.getInvoiceById);

// Analytics routes
router.get('/analytics', billingController.getBillingAnalytics);

module.exports = router;
