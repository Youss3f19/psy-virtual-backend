const logger = require('../utils/logger');
const { generatePreviousWeekSummaries, computePreviousWeekRange } = require('../services/weeklySummary.service');

function msUntilNextRunAt(targetDay = 1, hour = 1, minute = 0, second = 0) {
  // targetDay: 0 Sunday .. 6 Saturday. Default 1 = Monday
  const now = new Date();
  const day = now.getDay(); // 0..6
  let daysUntil = (targetDay - day + 7) % 7;
  if (daysUntil === 0) {
    // same day: check time
    const candidate = new Date(now);
    candidate.setHours(hour, minute, second, 0);
    if (candidate <= now) daysUntil = 7; // schedule next week
  }
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(hour, minute, second, 0);
  return next.getTime() - now.getTime();
}

function startWeeklyJob() {
  // Configurable schedule via env vars
  const targetDay = Number(process.env.WEEKLY_SUMMARY_DAY ?? 1); // 0..6, default Monday
  const hour = Number(process.env.WEEKLY_SUMMARY_HOUR ?? 1);
  const minute = Number(process.env.WEEKLY_SUMMARY_MINUTE ?? 0);

  const initialDelay = msUntilNextRunAt(targetDay, hour, minute, 0);
  logger.info(`[WEEKLY JOB] Scheduling weekly summary job to start in ${Math.round(initialDelay/1000/60)} minute(s) (day=${targetDay} hour=${hour}:${minute})`);

  setTimeout(() => {
    // run once now
    runJob().catch(err => logger.error('[WEEKLY JOB] Error:', err));
    // then schedule every 7 days
    setInterval(() => runJob().catch(err => logger.error('[WEEKLY JOB] Error:', err)), 7 * 24 * 60 * 60 * 1000);
  }, initialDelay);
}

async function runJob() {
  const { weekStart, weekEnd } = computePreviousWeekRange(new Date());
  logger.info(`[WEEKLY JOB] Generating weekly summaries for ${weekStart.toISOString()} - ${weekEnd.toISOString()}`);
  const result = await generatePreviousWeekSummaries();
  logger.info(`[WEEKLY JOB] Generated ${result.length} weekly summaries`);
  return result;
}

module.exports = {
  startWeeklyJob,
  runJob
};
