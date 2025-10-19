const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/adminAuth');
const {
  getAuditLogs,
  getFraudAlerts,
  resolveFraudAlert,
  getAuditStats
} = require('../controllers/auditController');

// All routes require admin authentication
router.use(adminAuth);

// Audit logs
router.get('/logs', getAuditLogs);

// Fraud alerts
router.get('/alerts', getFraudAlerts);
router.put('/alerts/:alertId/resolve', resolveFraudAlert);

// Audit statistics
router.get('/stats', getAuditStats);

module.exports = router;
