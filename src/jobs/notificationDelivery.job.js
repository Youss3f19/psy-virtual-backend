const logger = require('../utils/logger');
const { processQueueBatch } = require('../services/notificationDelivery.service');

let intervalId = null;

function startNotificationDeliveryJob(intervalSec = 5) {
  if (intervalId) return;
  const ms = (process.env.NOTIF_WORKER_INTERVAL_SEC ? parseInt(process.env.NOTIF_WORKER_INTERVAL_SEC, 10) : intervalSec) * 1000;
  intervalId = setInterval(async () => {
    try {
      await processQueueBatch(50);
    } catch (e) {
      logger.error('notificationDelivery job error: ' + e.message);
    }
  }, ms);
  logger.info('Notification delivery job started (interval sec=' + (ms/1000) + ')');
}

module.exports = { startNotificationDeliveryJob };
