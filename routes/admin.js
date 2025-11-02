const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController'); // Keep this for other admin routes
const { protect, authorize } = require('../middleware/auth');

// ✅ All admin routes require admin or super_admin role
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

// -------------------- Admin Dashboard -------------------- //
router.get('/dashboard', adminController.getDashboardStats);

// -------------------- Global Settings -------------------- //
router.get('/settings', adminController.getGlobalSettings);
router.put('/settings', adminController.updateGlobalSettings);

// -------------------- Agent Management -------------------- //
router.route('/agents')
  .get(adminController.getAllAgents)
  .post(adminController.createAgent);

router.route('/agents/:id')
  .get(adminController.getAgentDetails)
  .put(adminController.updateAgent)
  .delete(adminController.deleteAgent);

// Agent Wallet Management
router.put('/agents/:id/wallet', adminController.updateAgentWallet);

// -------------------- Customer Management -------------------- //
router.get('/customers', adminController.getAllCustomers);
router.put('/customers/:id', adminController.updateCustomer);
router.delete('/customers/:id', adminController.deleteCustomer);

// -------------------- Other Data Views -------------------- //
router.get('/reminders', adminController.getAllReminders);
router.get('/messages', adminController.getAllMessages);
router.get('/transactions', adminController.getAllTransactions);
router.get('/messages/export', adminController.exportMessages);

// -------------------- Reset Functionality -------------------- //
router.post('/reset/wallet-usage', adminController.resetWalletUsage);
router.post('/reset/total-revenue', adminController.resetTotalRevenue);

// -------------------- Analytics -------------------- //
router.get('/analytics/wallet-usage', adminController.getWalletUsageAnalytics);
router.get('/analytics/revenue', adminController.getRevenueAnalytics);

// -------------------- Export Endpoints -------------------- //
router.get('/export/wallet-usage', adminController.exportWalletUsage);
router.get('/export/revenue', adminController.exportRevenue);

// -------------------- MSG91 Verification -------------------- //
router.get('/settings/verify-msg91', adminController.verifyMSG91Config);

// -------------------- Cashfree Verification -------------------- //
router.get('/settings/verify-cashfree', adminController.verifyCashfreeConfig);

// -------------------- Agent Role Lookup -------------------- //
router.get('/agent-role/:email', adminController.getAgentRoleByEmail);

module.exports = router;
