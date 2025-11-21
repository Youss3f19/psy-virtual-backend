const AdviceRating = require('../models/AdviceRating.model');
const Session = require('../models/Session.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

class AdviceRatingController {
  // POST /api/v1/sessions/:sessionId/rate
  static async createRating(req, res, next) {
    try {
      const userId = req.user.id;
      const sessionId = req.params.sessionId;
      const { rating, comment } = req.body;

      if (!rating || typeof rating !== 'number') {
        throw ApiError.badRequest('Note (rating) numérique requise');
      }

      const session = await Session.findOne({ _id: sessionId, user: userId });
      if (!session) throw ApiError.notFound('Séance introuvable ou non autorisée');

      // Upsert: create new or update existing rating
      let doc = await AdviceRating.findOne({ user: userId, session: sessionId });
      if (doc) {
        doc.rating = rating;
        doc.comment = comment || '';
        await doc.save();
        return res.json(apiResponse.success(doc, 'Évaluation mise à jour'));
      }

      doc = await AdviceRating.create({ user: userId, session: sessionId, rating, comment: comment || '' });
      return res.status(201).json(apiResponse.created(doc, 'Évaluation enregistrée'));
    } catch (err) {
      next(err);
    }
  }

  // GET /api/v1/sessions/:sessionId/rating  => get my rating
  static async getMyRating(req, res, next) {
    try {
      const userId = req.user.id;
      const sessionId = req.params.sessionId;
      const doc = await AdviceRating.findOne({ user: userId, session: sessionId }).lean();
      if (!doc) return res.json(apiResponse.success(null, 'Pas d\'évaluation'));
      return res.json(apiResponse.success(doc));
    } catch (err) { next(err); }
  }

  // GET /api/v1/sessions/:sessionId/ratings  => list all ratings for session (paginated)
  static async listRatingsForSession(req, res, next) {
    try {
      const sessionId = req.params.sessionId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Number(req.query.limit) || 20);
      const skip = (page - 1) * limit;

      const total = await AdviceRating.countDocuments({ session: sessionId });
      const items = await AdviceRating.find({ session: sessionId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user', 'name avatar')
        .lean();

      return res.json(apiResponse.success({ items, page, limit, total }));
    } catch (err) { next(err); }
  }

  // DELETE /api/v1/sessions/:sessionId/rating  => delete my rating
  static async deleteMyRating(req, res, next) {
    try {
      const userId = req.user.id;
      const sessionId = req.params.sessionId;
      const doc = await AdviceRating.findOneAndDelete({ user: userId, session: sessionId });
      if (!doc) return res.json(apiResponse.success(null, 'Pas d\'évaluation à supprimer'));
      return res.json(apiResponse.success(null, 'Évaluation supprimée'));
    } catch (err) { next(err); }
  }
}

module.exports = AdviceRatingController;
