const fs = require('fs');
const { validationResult } = require('express-validator');
const { processVoice, endSession } = require('../services/ml.service');
const Session = require('../models/Session.model');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

function mapEmotionForHistory(mlEmotion) {
  const m = { 
    anxiete: 'anxiete', 
    colere: 'colere', 
    tristesse: 'tristesse', 
    peur: 'peur', 
    neutre: 'neutre' 
  };
  return m[mlEmotion] || 'neutre';
}

async function enforceDailyQuotaOrThrow(userId, isPremium) {
  const start = new Date(); 
  start.setHours(0, 0, 0, 0);
  const end = new Date();   
  end.setHours(23, 59, 59, 999);

  const count = await Session.countDocuments({ 
    user: userId, 
    createdAt: { $gte: start, $lte: end } 
  });
  
  const limit = isPremium ? 10 : 2;
  
  if (count >= limit) {
    throw ApiError.forbidden(
      `Limite journaliere atteinte (${count}/${limit}). ${!isPremium ? 'Passez a Premium pour 10 sessions/jour !' : ''}`
    );
  }
  
  return { remaining: limit - count, total: limit };
}

async function processVoiceCtrl(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(ApiError.badRequest('Erreur de validation', errors.array()));
  }
  
  if (!req.file) {
    return next(ApiError.badRequest('Fichier audio requis'));
  }

  try {
    const userId = req.user.id;
    
    // Session deja validee par le middleware si fournie
    const existingSession = req.validatedSession;
    const mlSessionId = existingSession ? existingSession.mlSessionId : null;
    
    if (mlSessionId) {
      console.log('Continuation session:', mlSessionId, 'pour user:', userId);
    } else {
      console.log('Nouvelle session pour user:', userId);
    }

    if (!fs.existsSync(req.file.path)) {
      return next(ApiError.badRequest('Fichier audio introuvable'));
    }

    const user = await User.findById(userId);
    const isPremium = user.isActivePremium();
    await enforceDailyQuotaOrThrow(userId, isPremium);

    const result = await processVoice({ 
      filePath: req.file.path, 
      userId,
      sessionId: mlSessionId
    });

    let session;
    
    if (existingSession) {
      session = existingSession;
      session.emotion = result.emotion;
      session.confidence = result.confidence;
      session.transcription = result.transcription;
      session.danger = {
        score: result.danger_analysis?.danger_score,
        riskLevel: result.danger_analysis?.risk_level,
        action: result.danger_analysis?.action,
        triggers: result.danger_analysis?.triggers || [],
      };
      session.therapistResponse = result.therapist_response;
      session.questions = result.questions || [];
      await session.save();
      console.log('Session mise a jour:', session.mlSessionId);
    } else {
      session = await Session.create({
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
      console.log('Nouvelle session creee:', session.mlSessionId);
    }

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
      session_db_id: session._id,
      session_ml_id: result.session_id
    }));
  } catch (err) {
    console.error('Erreur processVoiceCtrl:', err.message);
    return next(ApiError.internal(err.message || 'Erreur service ML'));
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }
  }
}

async function endSessionCtrl(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(ApiError.badRequest('Erreur de validation', errors.array()));
  }

  try {
    // Session deja validee par le middleware
    const session = req.validatedSession;
    
    if (!session) {
      return next(ApiError.badRequest('session_id requis'));
    }

    const user = await User.findById(req.user.id);
    const isPremium = user.isActivePremium();
    
    const result = await endSession({ 
      sessionId: session.mlSessionId,
      isPremium
    });

    session.treatmentPlan = result.treatment_plan;
    session.closedAt = new Date();
    session.premiumAdvice = isPremium ? result.premium_advice : null;
    await session.save();

    return res.json(apiResponse.success({
      session: session,
      treatment_plan: result.treatment_plan,
      premium_advice: isPremium ? result.premium_advice : null,
    }));
  } catch (err) {
    return next(ApiError.internal(err.message || 'Erreur service ML'));
  }
}

async function listSessionsCtrl(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    const isPremium = user.isActivePremium();
    
    const limit = isPremium ? 100 : 10;
    
    const sessions = await Session.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v');
    
    const totalCount = await Session.countDocuments({ user: req.user.id });
    
    return res.json(apiResponse.success({
      sessions,
      isPremium,
      displayed: sessions.length,
      total: totalCount,
      limit,
      message: !isPremium && totalCount > 10 
        ? `Vous voyez 10 sessions sur ${totalCount}. Passez a Premium pour voir tout l'historique !` 
        : null
    }));
  } catch (err) {
    return next(ApiError.internal(err.message));
  }
}

async function getSessionCtrl(req, res, next) {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    
    const sessionIdInt = parseInt(sessionId);
    if (isNaN(sessionIdInt)) {
      return next(ApiError.badRequest('sessionId doit etre un entier'));
    }
    
    const session = await Session.findOne({
      user: userId,
      mlSessionId: sessionIdInt
    }).select('-__v');
    
    if (!session) {
      return next(ApiError.notFound('Session introuvable ou non autorisee'));
    }
    
    return res.json(apiResponse.success(session));
  } catch (err) {
    return next(ApiError.internal(err.message));
  }
}

async function deleteSessionCtrl(req, res, next) {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    
    const sessionIdInt = parseInt(sessionId);
    if (isNaN(sessionIdInt)) {
      return next(ApiError.badRequest('sessionId doit etre un entier'));
    }
    
    const session = await Session.findOne({
      user: userId,
      mlSessionId: sessionIdInt
    });
    
    if (!session) {
      return next(ApiError.notFound('Session introuvable ou non autorisee'));
    }
    
    await Session.deleteOne({ _id: session._id });
    
    return res.json(apiResponse.success({ 
      message: 'Session supprimee avec succes',
      sessionId: sessionIdInt
    }));
  } catch (err) {
    return next(ApiError.internal(err.message));
  }
}

module.exports = { 
  processVoiceCtrl, 
  endSessionCtrl, 
  listSessionsCtrl,
  getSessionCtrl,
  deleteSessionCtrl
};
