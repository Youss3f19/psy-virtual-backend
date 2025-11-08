const fs = require('fs');
const { validationResult } = require('express-validator');
const { processVoice, endSession } = require('../services/ml.service');
const Session = require('../models/Session.model');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

// map ML -> user.emotionHistory enum (accents)
function mapEmotionForHistory(mlEmotion) {
  const m = { anxiete: 'anxiété', colere: 'colère', tristesse: 'tristesse', peur: 'peur', neutre: 'neutre' };
  return m[mlEmotion] || 'neutre';
}

async function enforceDailyQuotaOrThrow(userId, isPremium) {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date();   end.setHours(23,59,59,999);

  const count = await Session.countDocuments({ user: userId, createdAt: { $gte: start, $lte: end } });
  const limit = isPremium ? 10 : 2;
  if (count >= limit) throw ApiError.forbidden(`Limite journalière atteinte (${limit}/jour)`);
}

async function processVoiceCtrl(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(ApiError.badRequest('Erreur de validation', errors.array()));
  if (!req.file) return next(ApiError.badRequest('Fichier audio requis'));

  try {
    const userId = req.user.id;
    const sessionId = req.body.session_id;

    // quota
    const user = await User.findById(userId);
    const isPremium = user.isActivePremium();
    await enforceDailyQuotaOrThrow(userId, isPremium);

    // call ML
    const result = await processVoice({ filePath: req.file.path, userId, sessionId });

    // persist session (ou upsert si session existante)
    const s = await Session.create({
      user: userId,
      mlSessionId: result.session_id,
      emotion: result.emotion,
      confidence: result.confidence,
      transcription: result.transcription,
      danger: {
        score: result.danger_analysis?.danger_score,
        riskLevel: result.danger_analysis?.risk_level,
        action: result.danger_analysis?.action,
        triggers: result.danger_analysis?.triggers || [],
      },
      therapistResponse: result.therapist_response,
      questions: result.questions || [],
    });

    // push dans user.emotionHistory (optionnel)
    await User.findByIdAndUpdate(userId, {
      $push: {
        emotionHistory: {
          emotion: mapEmotionForHistory(result.emotion),
          intensity: Math.max(0, Math.min(1, Number(result.confidence || 0))),
          timestamp: new Date(),
        },
      },
    });

    return res.json(apiResponse.success({
      ...result,
      session_db_id: s._id,
    }));
  } catch (err) {
    return next(ApiError.badGateway(err.message || 'Erreur service ML'));
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
}

async function endSessionCtrl(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(ApiError.badRequest('Erreur de validation', errors.array()));

  try {
    const { session_id } = req.body;
    const result = await endSession({ sessionId: session_id });

    // mettre à jour la session Mongo
    const s = await Session.findOneAndUpdate(
      { user: req.user.id, mlSessionId: session_id },
      { treatmentPlan: result.treatment_plan, closedAt: new Date() },
      { new: true }
    );

    return res.json(apiResponse.success({
      session: s,
      treatment_plan: result.treatment_plan,
    }));
  } catch (err) {
    return next(ApiError.badGateway(err.message || 'Erreur service ML'));
  }
}

async function listSessionsCtrl(req, res, next) {
  try {
    const sessions = await Session.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100);
    return res.json(apiResponse.success(sessions));
  } catch (err) {
    return next(ApiError.internal(err.message));
  }
}

module.exports = { processVoiceCtrl, endSessionCtrl, listSessionsCtrl };
