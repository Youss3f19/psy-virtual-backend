const Notification = require('../models/Notification.model');
const NotificationQueue = require('../models/NotificationQueue.model');
const logger = require('../utils/logger');
const { emitToUser } = require('../utils/socket');

async function createNotification(userId, type, title, body = '', payload = {}, channel = 'inapp', sendNow = false) {
  const n = await Notification.create({ user: userId, type, title, body, payload, channel, sentAt: new Date() });
  logger.info(`[NOTIF] Created ${type} for user ${userId}`);

  // Emit real-time in-app notification if socket connected
  try {
    emitToUser(userId, 'notification:created', { id: n._id, type, title, body, payload, channel });
  } catch (e) {
    logger.debug('[NOTIF] emitToUser error: ' + e.message);
  }

  // Enqueue for delivery if not purely in-app or if immediate delivery requested
  try {
    if (channel !== 'inapp' || sendNow) {
      await NotificationQueue.create({ notification: n._id, channel, availableAt: new Date() });
    } else if (sendNow && channel === 'inapp') {
      n.deliveredAt = new Date();
      await n.save();
    }
  } catch (e) {
    logger.error('[NOTIF] Queue enqueue error: ' + e.message);
  }

  return n;
}

async function listNotificationsForUser(userId, { page = 1, limit = 50 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const items = await Notification.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  const total = await Notification.countDocuments({ user: userId });
  return { items, page, limit, total };
}

async function markAsRead(notificationId, userId) {
  const n = await Notification.findOneAndUpdate({ _id: notificationId, user: userId }, { read: true }, { new: true });
  return n;
}

async function markAllRead(userId) {
  const res = await Notification.updateMany({ user: userId, read: false }, { read: true });
  return res;
}

async function countUnread(userId) {
  return Notification.countDocuments({ user: userId, read: false });
}

module.exports = {
  createNotification,
  listNotificationsForUser,
  markAsRead,
  markAllRead
  , countUnread
};

