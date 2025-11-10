const fs = require('fs');
const { validationResult } = require('express-validator');
const { processVoice, endSession } = require('../services/ml.service');
const Session = require('../models/Session.model');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

function mapEmotionForHistory(mlEmotion) {
  const m = { 
    anxiete: 'anxiété', 
    colere: 'colère', 
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
    throw ApiError.forbidden(`Limite journalière atteinte (${limit}/jour)`);
  }
}

async function processVoiceCtrl(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(ApiError.badRequest('Erreur de validation', errors.array()));
  }
  
  if (!req.file) {
    return next(ApiError.badRequest('Fichier audio requis'));
  }

  console.log('📁 Fichier uploadé:', {
    path: req.file.path,
    size: req.file.size,
    mimetype: req.file.mimetype
  });

  try {
    const userId = req.user.id;
    
    // ✅ Récupérer le mlSessionId depuis MongoDB (pas depuis req.body)
    let mlSessionId = null;
    const existingSession = await Session.findOne({ 
      user: userId, 
      closedAt: null 
    }).sort({ createdAt: -1 });
    
    if (existingSession && existingSession.mlSessionId) {
      mlSessionId = existingSession.mlSessionId;
    }

    if (!fs.existsSync(req.file.path)) {
      return next(ApiError.badRequest('Fichier audio introuvable'));
    }

    const user = await User.findById(userId);
    const isPremium = user.isActivePremium();
    await enforceDailyQuotaOrThrow(userId, isPremium);

    // ✅ Envoyer mlSessionId (Python ID) au lieu de MongoDB ID
    const result = await processVoice({ 
      filePath: req.file.path, 
      userId, 
      sessionId: mlSessionId  // ← ID Python, pas MongoDB
    });

    // ✅ Créer ou mettre à jour la session MongoDB
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
    } else {
      session = await Session.create({
        user: userId,
        mlSessionId: result.session_id, // ← Stocker l'ID Python
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
    console.error('❌ Erreur processVoiceCtrl:', err.message);
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
    const userId = req.user.id;
    
    // ✅ Récupérer la dernière session active
    const session = await Session.findOne({ 
      user: userId, 
      closedAt: null 
    }).sort({ createdAt: -1 });

    if (!session || !session.mlSessionId) {
      return next(ApiError.notFound('Aucune session active'));
    }

    // ✅ Appeler Python avec mlSessionId (ID Python)
    const result = await endSession({ sessionId: session.mlSessionId });

    session.treatmentPlan = result.treatment_plan;
    session.closedAt = new Date();
    await session.save();

    return res.json(apiResponse.success({
      session: session,
      treatment_plan: result.treatment_plan,
    }));
  } catch (err) {
    return next(ApiError.internal(err.message || 'Erreur service ML'));
  }
}


async function listSessionsCtrl(req, res, next) {
  try {
    const sessions = await Session.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    return res.json(apiResponse.success(sessions));
  } catch (err) {
    return next(ApiError.internal(err.message));
  }
}

module.exports = { processVoiceCtrl, endSessionCtrl, listSessionsCtrl };
