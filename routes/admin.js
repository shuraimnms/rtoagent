const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController'); // Keep this for other admin routes
const { protect, authorize } = require('../middleware/auth');

// All admin routes require admin or super_admin role
router.use(protect);
router.use((req, res, next) => {
  if (req.agent.role !== 'admin' && req.agent.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: `Role ${req.agent.role} is not authorized to access this resource`
    });
  }
  next();
});

// Dashboard stats (deprecated - keeping for backward compatibility)
router.get('/dashboard', adminController.getDashboardStats);

// Global settings
router.get('/settings', adminController.getGlobalSettings);
router.put('/settings', adminController.updateGlobalSettings);

// Agent management
router.route('/agents')
  .get(adminController.getAllAgents)
  .post(adminController.createAgent);

router.route('/agents/:id')
  .get(adminController.getAgentDetails)
  .put(adminController.updateAgent)
  .delete(adminController.deleteAgent);

// Agent wallet management
router.put('/agents/:id/wallet', adminController.updateAgentWallet);

// Global data views
router.get('/customers', adminController.getAllCustomers);
router.put('/customers/:id', adminController.updateCustomer);
router.delete('/customers/:id', adminController.deleteCustomer);
router.get('/reminders', adminController.getAllReminders);
router.get('/messages', adminController.getAllMessages);
router.get('/transactions', adminController.getAllTransactions);
router.get('/messages/export', adminController.exportMessages);



// Reset functionality
router.post('/reset/wallet-usage', adminController.resetWalletUsage);
router.post('/reset/total-revenue', adminController.resetTotalRevenue);

// Analytics endpoints
router.get('/analytics/wallet-usage', adminController.getWalletUsageAnalytics);
router.get('/analytics/revenue', adminController.getRevenueAnalytics);

// Export endpoints
router.get('/export/wallet-usage', adminController.exportWalletUsage);
router.get('/export/revenue', adminController.exportRevenue);

// MSG91 verification
router.get('/settings/verify-msg91', adminController.verifyMSG91Config);

module.exports = router;
