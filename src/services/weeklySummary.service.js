const Session = require('../models/Session.model');
const AdviceRating = require('../models/AdviceRating.model');
const WeeklySummary = require('../models/WeeklySummary.model');
const User = require('../models/User.model');

/**
 * Compute week range (previous week) given a reference date.
 * weekStart = Monday 00:00:00 of previous week
 * weekEnd = Sunday 23:59:59.999 of previous week
 */
function computePreviousWeekRange(ref = new Date()) {
  const d = new Date(ref);
  // set to start of day
  d.setHours(0,0,0,0);
  // day: 0 (Sun) .. 6 (Sat)
  const day = d.getDay();
  // compute how many days to go back to previous Monday
  const daysToLastMonday = ((day + 6) % 7) + 7; // ensures previous week's Monday
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - daysToLastMonday);
  weekStart.setHours(0,0,0,0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23,59,59,999);

  return { weekStart, weekEnd };
}

async function computeSummaryForUser(userId, weekStart, weekEnd) {
  // Pull sessions for user in range
  const sessions = await Session.find({ user: userId, createdAt: { $gte: weekStart, $lte: weekEnd } }).lean();
  const sessionsCount = sessions.length;

  // total duration (if messages have durationSec in audio messages)
  let totalDurationSec = 0;
  const emotionCounts = {};
  for (const s of sessions) {
    if (Array.isArray(s.messages)) {
      for (const m of s.messages) {
        if (m.role === 'user' && m.durationSec) totalDurationSec += Number(m.durationSec) || 0;
        if (m.emotionAtTurn) {
          const e = String(m.emotionAtTurn || '').toLowerCase();
          emotionCounts[e] = (emotionCounts[e] || 0) + 1;
        }
      }
    }
  }

  // Predominant emotion
  let predominantEmotion = null;
  let maxCount = 0;
  for (const [k, v] of Object.entries(emotionCounts)) {
    if (v > maxCount) { maxCount = v; predominantEmotion = k; }
  }

  // Ratings
  const ratings = await AdviceRating.find({ session: { $in: sessions.map(s => s._id) } }).lean();
  const ratingsCount = ratings.length;
  const averageRating = ratingsCount ? (ratings.reduce((a,b) => a + (b.rating||0), 0) / ratingsCount) : null;

  // Build textual summary (simple)
  const summaryText = `Cette semaine: ${sessionsCount} séance(s). Durée totale: ${Math.round(totalDurationSec)}s. Moyenne note: ${averageRating ? averageRating.toFixed(2) : 'N/A'}. Émotion prédominante: ${predominantEmotion || 'N/A'}.`;

  // Sessions summary: minimal details to show on UI
  const sessionsSummary = [];
  // Create a map of ratings by session id for quick lookup
  const ratingBySession = {};
  for (const r of ratings) {
    if (r.session) ratingBySession[String(r.session)] = r.rating || null;
  }
  for (const s of sessions) {
    let dur = 0;
    let sessEmotion = null;
    if (Array.isArray(s.messages)) {
      for (const m of s.messages) {
        if (m.role === 'user' && m.durationSec) dur += Number(m.durationSec) || 0;
        if (!sessEmotion && m.emotionAtTurn) sessEmotion = m.emotionAtTurn;
      }
    }
    sessionsSummary.push({
      sessionId: s._id,
      sessionDate: s.createdAt || s.sessionDate || null,
      emotion: sessEmotion,
      durationSec: dur,
      rating: ratingBySession[String(s._id)] || null
    });
  }

  const doc = {
    user: userId,
    weekStart,
    weekEnd,
    sessionsCount,
    averageRating: averageRating ? Number(averageRating.toFixed(2)) : null,
    ratingsCount,
    predominantEmotion,
    totalDurationSec,
    summaryText,
    sessionsSummary,
    metadata: { generatedAt: new Date() }
  };

  // Upsert into WeeklySummary
  await WeeklySummary.findOneAndUpdate({ user: userId, weekStart }, doc, { upsert: true, new: true });

  // Notify user that their weekly summary is ready
  try {
    const NotificationService = require('./notification.service');
    await NotificationService.createNotification(userId, 'weekly_summary_ready', 'Votre résumé hebdomadaire est prêt', summaryText, { weekStart, weekEnd }, 'inapp', true);
  } catch (e) {
    // ignore notification errors
  }

  return doc;
}

/**
 * Generate summaries for all users who had sessions in the week
 */
async function generateWeeklySummariesForRange(weekStart, weekEnd) {
  // find users who had sessions in week
  const users = await Session.distinct('user', { createdAt: { $gte: weekStart, $lte: weekEnd } });
  const results = [];
  for (const u of users) {
    try {
      const r = await computeSummaryForUser(u, weekStart, weekEnd);
      results.push(r);
    } catch (e) {
      // continue
    }
  }
  return results;
}

async function generatePreviousWeekSummaries() {
  const { weekStart, weekEnd } = computePreviousWeekRange(new Date());
  return generateWeeklySummariesForRange(weekStart, weekEnd);
}

module.exports = {
  computePreviousWeekRange,
  computeSummaryForUser,
  generateWeeklySummariesForRange,
  generatePreviousWeekSummaries
};
