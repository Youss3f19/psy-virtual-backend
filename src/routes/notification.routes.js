const express = require('express');
const NotificationController = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

router.get('/notifications', protect, NotificationController.list);
router.post('/notifications/:id/read', protect, NotificationController.markRead);
router.post('/notifications/mark-all-read', protect, NotificationController.markAll);
router.get('/notifications/unread-count', protect, NotificationController.unreadCount);

module.exports = router;
