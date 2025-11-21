const Notification = require('../models/Notification.model');
const NotificationQueue = require('../models/NotificationQueue.model');
const logger = require('../utils/logger');
const { emitToUser } = require('../utils/socket');

let transport = null;
function getSmtpTransport() {
  if (transport) return transport;
  try {
    const nodemailer = require('nodemailer');
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    const opts = {
      host,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: undefined
    };
    if (process.env.SMTP_USER) opts.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS };
    transport = nodemailer.createTransport(opts);
    return transport;
  } catch (e) {
    logger.debug('nodemailer not available: ' + e.message);
    return null;
  }
}

async function sendEmail(notification, toEmail) {
  const t = getSmtpTransport();
  if (!t) throw new Error('SMTP transport not configured');
  const mail = {
    from: process.env.SMTP_FROM || 'no-reply@example.com',
    to: toEmail,
    subject: notification.title,
    text: notification.body || '',
    html: notification.payload && notification.payload.html ? notification.payload.html : undefined
  };
  const res = await t.sendMail(mail);
  return res;
}

async function processQueueBatch(limit = 20) {
  const now = new Date();
  const items = await NotificationQueue.find({ status: 'pending', availableAt: { $lte: now } }).sort({ createdAt: 1 }).limit(limit).lean();
  for (const it of items) {
    try {
      // claim item
      const claimed = await NotificationQueue.findOneAndUpdate({ _id: it._id, status: 'pending' }, { status: 'processing' }, { new: true });
      if (!claimed) continue;
      const notification = await Notification.findById(claimed.notification).lean();
      if (!notification) {
        await NotificationQueue.findByIdAndUpdate(claimed._id, { status: 'failed', lastError: 'Notification missing' });
        continue;
      }

      if (claimed.channel === 'email') {
        // expect user email in notification.payload.email or notification.payload.to
        const to = (notification.payload && (notification.payload.email || notification.payload.to));
        if (!to) throw new Error('No destination email');
        await sendEmail(notification, to);
      } else if (claimed.channel === 'push') {
        // push provider not configured: log for now
        logger.info('[NOTIF] Push send stub for notification ' + notification._id);
      } else if (claimed.channel === 'inapp') {
        // nothing to send externally
      }

      // mark delivered
      await Notification.findByIdAndUpdate(notification._id, { deliveredAt: new Date() });
      await NotificationQueue.findByIdAndUpdate(claimed._id, { status: 'sent', attempts: claimed.attempts + 1 });

      // emit real-time delivered event
      try { emitToUser(notification.user, 'notification:delivered', { id: notification._id }); } catch (e) { /* noop */ }
    } catch (e) {
      logger.error('[NOTIF] Delivery error: ' + e.message);
      const attempts = (it.attempts || 0) + 1;
      const delayMs = Math.min(60 * 60 * 1000, 1000 * Math.pow(2, attempts)); // backoff up to 1h
      const nextAvailable = new Date(Date.now() + delayMs);
      const update = { status: attempts >= 5 ? 'failed' : 'pending', attempts, lastError: e.message, availableAt: nextAvailable };
      await NotificationQueue.findByIdAndUpdate(it._id, update);
    }
  }
}

module.exports = { processQueueBatch };
