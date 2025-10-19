const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

// Agent routes
router.get('/', protect, notificationController.getNotifications);
router.put('/:notificationId/read', protect, notificationController.markAsRead);
router.put('/mark-all-read', protect, notificationController.markAllAsRead);

// Admin routes
router.post('/send', protect, authorize('super_admin'), notificationController.sendNotification);
router.get('/admin/stats', protect, authorize('super_admin'), notificationController.getNotificationStats);
router.delete('/:notificationId', protect, authorize('super_admin'), notificationController.deleteNotification);

module.exports = router;
