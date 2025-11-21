const logger = require('../utils/logger');
const User = require('../models/User.model');
const NotificationService = require('../services/notification.service');

// Notify users who haven't logged in for INACTIVITY_DAYS
const INACTIVITY_DAYS = Number(process.env.INACTIVITY_DAYS || 7);

async function runInactivityJob() {
  const cutoff = new Date(Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000);
  logger.info(`[INACTIVITY JOB] Looking for users with lastLogin before ${cutoff.toISOString()}`);
  const users = await User.find({ $or: [{ lastLogin: { $lte: cutoff } }, { lastLogin: null }] }).select('_id email name lastLogin').lean();
  logger.info(`[INACTIVITY JOB] Found ${users.length} inactive users`);
  let sent = 0;
  for (const u of users) {
    try {
      const title = "On s'ennuie de vous — revenez essayer une nouvelle séance";
      const body = `Bonjour ${u.name || ''}, nous avons remarqué que vous n'avez pas utilisé l'application depuis un moment. Revenez pour continuer votre progrès.`;
      await NotificationService.createNotification(u._id, 'inactivity', title, body, {}, 'inapp', true);
      sent++;
    } catch (e) {
      logger.error('[INACTIVITY JOB] Error notifying user ' + u._id + ' : ' + e.message);
    }
  }
  logger.info(`[INACTIVITY JOB] Sent ${sent} inactivity notifications`);
  return sent;
}

function startInactivityJob() {
  // run daily
  const msPerDay = 24*60*60*1000;
  setTimeout(() => {
    runInactivityJob().catch(e=>logger.error(e));
    setInterval(() => runInactivityJob().catch(e=>logger.error(e)), msPerDay);
  }, 5000);
}

module.exports = { runInactivityJob, startInactivityJob };
