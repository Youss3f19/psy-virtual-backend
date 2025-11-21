const NotificationService = require('../services/notification.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');

class NotificationController {
  static async list(req, res, next) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Math.min(100, Number(req.query.limit) || 50);
      const data = await NotificationService.listNotificationsForUser(req.user.id, { page, limit });
      return res.json(ApiResponse.success(data));
    } catch (err) { next(err); }
  }

  static async markRead(req, res, next) {
    try {
      const id = req.params.id;
      const n = await NotificationService.markAsRead(id, req.user.id);
      if (!n) throw ApiError.notFound('Notification introuvable');
      return res.json(ApiResponse.success(n));
    } catch (err) { next(err); }
  }

  static async markAll(req, res, next) {
    try {
      const r = await NotificationService.markAllRead(req.user.id);
      return res.json(ApiResponse.success(r));
    } catch (err) { next(err); }
  }

  static async unreadCount(req, res, next) {
    try {
      const count = await NotificationService.countUnread(req.user.id);
      return res.json(ApiResponse.success({ unread: count }));
    } catch (err) { next(err); }
  }
}

module.exports = NotificationController;
