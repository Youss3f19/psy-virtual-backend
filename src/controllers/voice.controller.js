const fs = require('fs');
const { validationResult } = require('express-validator');
const { processVoice, endSession } = require('../services/ml.service');
const Session = require('../models/Session.model');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');

function mapEmotionForHistory(mlEmotion) {
  const m = { anxiete: 'anxiété', colere: 'colère', tristesse: 'tristesse', peur: 'peur', neutre: 'neutre' };
  return m[mlEmotion] || 'neutre';
}

async function enforceDailyQuotaOrThrow(userId, isPremium) {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date();   end.setHours(23,59,59,999);

  const count = await Session.countDocuments({ user: userId, createdAt: { $gte: start, $lte: end } });
  const limit = isPremium ? 10 : 2;
  
  if (count >= limit) {
    throw ApiError.forbidden(
      `Limite journalière atteinte (${count}/${limit}). ${!isPremium ? 'Passez à Premium pour 10 sessions/jour !' : ''}`
    );
  }
  
  return { remaining: limit - count, total: limit };
}

async function processVoiceCtrl(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(ApiError.badRequest('Erreur de validation', errors.array()));
  if (!req.file) return next(ApiError.badRequest('Fichier audio requis'));

  try {
    const userId = req.user.id;
    const sessionId = req.body.session_id;

    const user = await User.findById(userId);
    const isPremium = user.isActivePremium();
    const quotaInfo = await enforceDailyQuotaOrThrow(userId, isPremium);

    const result = await processVoice({ 
      filePath: req.file.path, 
      userId, 
      sessionId,
      isPremium 
    });

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
      isPremiumSession: isPremium,
    });

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
      user_status: {
        isPremium,
        quota: quotaInfo,
      }
    }));
  } catch (err) {
    return next(err.statusCode ? err : ApiError.badGateway(err.message || 'Erreur service ML'));
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
}

async function endSessionCtrl(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return next(ApiError.badRequest('Erreur de validation', errors.array()));

  try {
    const { session_id } = req.body;
    const user = await User.findById(req.user.id);
    const isPremium = user.isActivePremium();
    
    const result = await endSession({ 
      sessionId: session_id,
      isPremium
    });

    const s = await Session.findOneAndUpdate(
      { user: req.user.id, mlSessionId: session_id },
      { 
        treatmentPlan: result.treatment_plan, 
        closedAt: new Date(),
        premiumAdvice: isPremium ? result.premium_advice : null
      },
      { new: true }
    );

    return res.json(apiResponse.success({
      session: s,
      treatment_plan: result.treatment_plan,
      premium_advice: isPremium ? result.premium_advice : null,
    }));
  } catch (err) {
    return next(err.statusCode ? err : ApiError.badGateway(err.message || 'Erreur service ML'));
  }
}

// ✅ MODIFIÉ - Historique avec limitation Free/Premium
async function listSessionsCtrl(req, res, next) {
  try {
    const user = await User.findById(req.user.id);
    const isPremium = user.isActivePremium();
    
    // Premium voit 100, Gratuit voit 10
    const limit = isPremium ? 100 : 10;
    
    const sessions = await Session.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v -mlSessionId'); // Enlever les champs inutiles
    
    const totalCount = await Session.countDocuments({ user: req.user.id });
    
    return res.json(apiResponse.success({
      sessions,
      isPremium,
      displayed: sessions.length,
      total: totalCount,
      limit,
      message: !isPremium && totalCount > 10 
        ? `Vous voyez 10 sessions sur ${totalCount}. Passez à Premium pour voir tout l'historique !` 
        : null
    }));
  } catch (err) {
    return next(ApiError.internal(err.message));
  }
}

// ✅ NOUVEAU - Récupérer une session spécifique
async function getSessionCtrl(req, res, next) {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findOne({
      _id: sessionId,
      user: req.user.id
    }).select('-__v');
    
    if (!session) {
      throw ApiError.notFound('Session non trouvée');
    }
    
    return res.json(apiResponse.success(session));
  } catch (err) {
    return next(ApiError.internal(err.message));
  }
}

// ✅ NOUVEAU - Supprimer une session
async function deleteSessionCtrl(req, res, next) {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findOneAndDelete({
      _id: sessionId,
      user: req.user.id
    });
    
    if (!session) {
      throw ApiError.notFound('Session non trouvée');
    }
    
    return res.json(apiResponse.success({
      message: 'Session supprimée avec succès',
      sessionId
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