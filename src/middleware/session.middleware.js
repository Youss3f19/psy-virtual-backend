// src/middleware/session.middleware.js
const Session = require('../models/Session.model');
const ApiError = require('../utils/apiError');

exports.loadSessionIfAny = async (req, _res, next) => {
  const mlId = req.body.session_ml_id || req.query.session_ml_id || req.params.mlId;
  if (!mlId) return next();
  const s = await Session.findOne({ user: req.user.id, mlSessionId: Number(mlId) });
  if (!s) return next(ApiError.notFound('Session introuvable'));
  req.validatedSession = s;
  next();
};

exports.enforceDailyQuota = async (req, _res, next) => {
  const user = req.user;
  if (user && await user.isActivePremium()) return next();
  const y = new Date().toISOString().slice(0,10);
  const count = await Session.countDocuments({ user: user.id, status: 'completed', sessionDate: y });
  if (count >= 1) return next(ApiError.forbidden('Limite: 1 séance gratuite par jour'));
  next();
};
