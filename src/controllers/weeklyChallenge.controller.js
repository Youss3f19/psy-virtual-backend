const WeeklyChallenge = require('../models/WeeklyChallenge.model');
const User = require('../models/User.model');
const NotificationService = require('../services/notification.service');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

class WeeklyChallengeController {
  // POST /api/v1/challenges  (create challenge) - protected
  static async createChallenge(req, res, next) {
    try {
      const { title, description, weekStart, weekEnd, questions } = req.body;
      if (!title || !weekStart || !weekEnd || !Array.isArray(questions) || questions.length === 0) {
        throw ApiError.badRequest('title, weekStart, weekEnd et questions sont requis');
      }

      // Validate questions structure
      for (const q of questions) {
        if (!q.text || !Array.isArray(q.choices) || typeof q.correctIndex !== 'number') {
          throw ApiError.badRequest('Chaque question doit avoir text, choices[] et correctIndex');
        }
      }

      const doc = await WeeklyChallenge.create({ title, description, weekStart: new Date(weekStart), weekEnd: new Date(weekEnd), questions });

      // Notify active users about new challenge (in-app)
      try {
        const users = await User.find({ isActive: true }).select('_id name').lean();
        const notifPromises = users.map(u => NotificationService.createNotification(u._id, 'challenge_published', `Nouveau challenge: ${title}`, `Un nouveau challenge hebdomadaire est disponible: ${title}. Essayez-le maintenant!`, { challengeId: doc._id }, 'inapp', false));
        // run in background (don't await all to avoid blocking response too long)
        Promise.allSettled(notifPromises).then(() => {});
      } catch (e) {
        // ignore notification errors
      }

      return res.status(201).json(apiResponse.created(doc, 'Challenge créé'));
    } catch (err) { next(err); }
  }

  // GET /api/v1/challenges  list (active by default)
  static async listChallenges(req, res, next) {
    try {
      const q = { isActive: true };
      const items = await WeeklyChallenge.find(q).sort({ weekStart: -1 }).select('-participants.questions -participants').lean();
      // Do not return correctIndex to clients
      const safe = items.map(i => ({
        ...i,
        questions: (i.questions||[]).map(q => ({ text: q.text, choices: q.choices }))
      }));
      return res.json(apiResponse.success(safe));
    } catch (err) { next(err); }
  }

  // GET /api/v1/challenges/:id  (challenge details, without correct answers)
  static async getChallenge(req, res, next) {
    try {
      const id = req.params.id;
      const doc = await WeeklyChallenge.findById(id).lean();
      if (!doc) throw ApiError.notFound('Challenge introuvable');
      const safe = {
        ...doc,
        questions: (doc.questions||[]).map(q => ({ text: q.text, choices: q.choices }))
      };
      return res.json(apiResponse.success(safe));
    } catch (err) { next(err); }
  }

  // POST /api/v1/challenges/:id/submit  submit answers (protected)
  static async submitScore(req, res, next) {
    try {
      const userId = req.user.id;
      const id = req.params.id;
      const answers = req.body.answers; // expected array of indexes
      if (!Array.isArray(answers)) throw ApiError.badRequest('answers[] requis');

      const challenge = await WeeklyChallenge.findById(id);
      if (!challenge) throw ApiError.notFound('Challenge introuvable');
      if (!challenge.isActive) throw ApiError.forbidden('Challenge inactif');
      // previous leaderboard/rank (top 10)
      const prevLeader = challenge.getLeaderboard(10);
      const prevIndex = prevLeader.findIndex(p => String(p.user) === String(userId));

      // compute score
      const questions = challenge.questions || [];
      let score = 0;
      for (let i=0;i<questions.length;i++) {
        const correct = Number(questions[i].correctIndex);
        const a = (answers[i] !== undefined) ? Number(answers[i]) : null;
        if (a !== null && a === correct) score++;
      }

      // upsert participant entry
      const existingIndex = challenge.participants.findIndex(p => String(p.user) === String(userId));
      const participant = { user: userId, score, answers, submittedAt: new Date() };
      if (existingIndex >= 0) {
        challenge.participants[existingIndex] = participant;
      } else {
        challenge.participants.push(participant);
      }
      await challenge.save();

      // prepare leaderboard top 10 (populate users' name/avatar if needed)
      const leaderboard = challenge.getLeaderboard(10);

      // determine new rank and notify user if they entered or improved in leaderboard
      try {
        const newIndex = leaderboard.findIndex(p => String(p.user) === String(userId));
        const threshold = 10;
        const prevRank = (prevIndex >= 0) ? (prevIndex + 1) : null;
        const newRank = (newIndex >= 0) ? (newIndex + 1) : null;

        // notify when entering top threshold or improving rank
        if ((prevRank === null && newRank !== null && newRank <= threshold) || (prevRank !== null && newRank !== null && newRank < prevRank)) {
          const title = 'Bravo — classement mis à jour!';
          const body = newRank ? `Votre score ${score} vous place #${newRank} sur le leaderboard du challenge "${challenge.title}".` : `Votre score ${score} a été enregistré.`;
          await NotificationService.createNotification(userId, 'challenge_leaderboard', title, body, { challengeId: challenge._id, score, rank: newRank }, 'inapp', true);
        } else {
          // always notify of score recorded
          await NotificationService.createNotification(userId, 'challenge_submitted', 'Score enregistré', `Votre score ${score} pour le challenge "${challenge.title}" a été enregistré.`, { challengeId: challenge._id, score }, 'inapp', false);
        }
      } catch (e) {
        // ignore notification errors
      }

      return res.json(apiResponse.success({ score, leaderboard }, 'Score enregistré'));
    } catch (err) { next(err); }
  }

  // GET /api/v1/challenges/:id/leaderboard
  static async getLeaderboard(req, res, next) {
    try {
      const id = req.params.id;
      const challenge = await WeeklyChallenge.findById(id).lean();
      if (!challenge) throw ApiError.notFound('Challenge introuvable');

      const parts = (challenge.participants || []).slice();
      parts.sort((a,b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(a.submittedAt) - new Date(b.submittedAt);
      });

      // Optionally limit
      const limit = Math.min(100, Number(req.query.limit) || 50);
      const top = parts.slice(0, limit);
      return res.json(apiResponse.success({ leaderboard: top }));
    } catch (err) { next(err); }
  }

  // DELETE /api/v1/challenges/:id  (protected)
  static async deleteChallenge(req, res, next) {
    try {
      const id = req.params.id;
      const doc = await WeeklyChallenge.findByIdAndDelete(id);
      if (!doc) throw ApiError.notFound('Challenge introuvable');
      return res.json(apiResponse.success(null, 'Challenge supprimé'));
    } catch (err) { next(err); }
  }
}

module.exports = WeeklyChallengeController;
