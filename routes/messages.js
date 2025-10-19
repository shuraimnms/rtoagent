const express = require('express');
const {
  getMessageLogs,
  getMessageLog,
  retryMessage,
  getMessageAnalytics,
  deleteMessageLog,
  exportMessageLogs
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getMessageLogs);

router.route('/stats/analytics')
  .get(getMessageAnalytics);

router.route('/export/csv')
  .get(exportMessageLogs);

router.route('/:id')
  .get(getMessageLog)
  .delete(deleteMessageLog);

router.route('/:id/retry')
  .post(retryMessage);

module.exports = router;