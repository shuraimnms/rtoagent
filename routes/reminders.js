const express = require('express');
const {
  createReminder,
  getReminders,
  getReminder,
  updateReminder,
  deleteReminder,
  sendTestMessage,
  bulkCreateReminders,
  getDashboardStats,
  sendReminderNow,
  getExpiringSoon,
  getReminderMessages,
  cancelReminder,
  rescheduleReminder
} = require('../controllers/reminderController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .post(createReminder)
  .get(getReminders);

router.route('/bulk')
  .post(bulkCreateReminders);

router.route('/test-message')
  .post(sendTestMessage);

router.route('/stats/dashboard')
  .get(getDashboardStats);

router.route('/expiring-soon')
  .get(getExpiringSoon);

router.route('/:id')
  .get(getReminder)
  .put(updateReminder)
  .delete(deleteReminder);

router.route('/:id/send-now')
  .post(sendReminderNow);

router.route('/:id/messages')
  .get(getReminderMessages);

router.route('/:id/cancel')
  .post(cancelReminder);

router.route('/:id/reschedule')
  .post(rescheduleReminder);

module.exports = router;