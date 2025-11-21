// src/controllers/voice.controller.js
const fs = require('fs');
const path = require('path');
const Session = require('../models/Session.model');
const User = require('../models/User.model');
const ApiError = require('../utils/apiError');
const apiResponse = require('../utils/apiResponse');
const { processVoice, endSession } = require('../services/ml.service');

const today = () => new Date().toISOString().slice(0,10);
const mapEmotion = e => ({ anxiete:'anxiete', colere:'colere', tristesse:'tristesse', peur:'peur', neutre:'neutre' }[e] || 'neutre');

/**
 * Démarrer une séance (status=planned)
 * POST /api/v1/sessions/start
 */
exports.startSession = async (req, res, next) => {
  try {
    const s = await Session.create({
      user: req.user.id,
      status: 'planned',
      sessionDate: today()
    });
    return res.json(apiResponse.success({ session_db_id: s._id, status: s.status }));
  } catch (e) { return next(ApiError.internal(e.message)); }
};

/**
 * Ajouter un vocal (un tour) dans une séance en cours
 * POST /api/v1/sessions/voice  (multipart: audio)
 * Champs optionnels: session_ml_id (si continuation ML)
 */
exports.processVoiceCtrl = async (req, res, next) => {
  try {
    if (!req.file) return next(ApiError.badRequest('Fichier audio requis'));
    let session = req.validatedSession || null;

    // Appel vers le service Python (transcription, émotion, questions)
    const result = await processVoice({
      filePath: req.file.path,
      userId: req.user.id,
      sessionId: session?.mlSessionId || null
    });

    // Déplacer l’audio dans un dossier par séance ML
    const dir = path.join(process.cwd(), 'uploads', String(result.session_id || session?.mlSessionId || 'local'));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const destPath = path.join(dir, path.basename(req.file.path));
    fs.renameSync(req.file.path, destPath);

    // Créer ou mettre à jour la séance
    if (!session) {
      session = await Session.create({
        user: req.user.id,
        mlSessionId: result.session_id,
        status: 'in-progress',
        sessionDate: today(),
        emotion: result.emotion,
        confidence: result.confidence,
        languageCode: result.language || result.languageCode,
        // timeline: message user (audio)
        messages: [{
          role: 'user',
          type: 'audio',
          label: 'user_input',
          filePath: destPath,
          durationSec: result.duration_sec,
          stt: { text: result.transcription, segments: result.segments || [], languageCode: result.language || 'fr' },
          emotionAtTurn: result.emotion
        }],
        danger: {
          score: result.danger_analysis?.danger_score,
          riskLevel: result.danger_analysis?.risk_level,
          action: result.danger_analysis?.action,
          triggers: result.danger_analysis?.triggers || []
        }
      });
    } else {
      if (session.status === 'completed') return next(ApiError.forbidden('Séance terminée: lecture seule'));
      session.status = 'in-progress';
      session.emotion = result.emotion;
      session.confidence = result.confidence;
      session.languageCode = result.language || result.languageCode || session.languageCode;
      session.messages.push({
        role: 'user',
        type: 'audio',
        label: 'user_input',
        filePath: destPath,
        durationSec: result.duration_sec,
        stt: { text: result.transcription, segments: result.segments || [], languageCode: result.language || 'fr' },
        emotionAtTurn: result.emotion
      });
      session.danger = {
        score: result.danger_analysis?.danger_score,
        riskLevel: result.danger_analysis?.risk_level,
        action: result.danger_analysis?.action,
        triggers: result.danger_analysis?.triggers || []
      };
      await session.save();
    }

    // Ajouter la réponse du psy + questions dans un seul message assistant
    if (result.therapist_response || (Array.isArray(result.questions) && result.questions.length)) {
      let combinedText = '';
      if (result.therapist_response) combinedText += String(result.therapist_response);
      if (Array.isArray(result.questions) && result.questions.length) {
        combinedText += (combinedText ? '\n\n' : '') + 'Questions:' + '\n' + result.questions.map((q, i) => `${i+1}. ${q}`).join('\n');
      }

      session.messages.push({
        role: 'assistant',
        type: 'text',
        label: 'assistant_response',
        stt: { text: combinedText },
        emotionAtTurn: result.emotion
      });
    }

    await session.save();

    // Historique émotionnel utilisateur
    await User.findByIdAndUpdate(req.user.id, {
      $push: { emotionHistory: { emotion: mapEmotion(result.emotion), intensity: Math.max(0, Math.min(1, Number(result.confidence || 0))), timestamp: new Date() } },
      $set:  { lastEmotion: mapEmotion(result.emotion) }
    });

    return res.json(apiResponse.success({
      session_db_id: session._id,
      session_ml_id: result.session_id || session.mlSessionId,
      status: session.status,
      emotion: result.emotion,
      confidence: result.confidence,
      danger: result.danger_analysis,
      next_questions: result.questions || [],
      assistant_reply: result.therapist_response || null
    }));
  } catch (e) {
    return next(ApiError.internal(e.message || 'Erreur service ML'));
  } finally {
    if (req.file && fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
  }
};

/**
 * Clôturer une séance: calculer diagnostic + plan de traitement
 * POST /api/v1/sessions/:mlId/complete
 */
exports.endSessionCtrl = async (req, res, next) => {
  try {
    const session = req.validatedSession;
    if (!session) return next(ApiError.badRequest('session_ml_id requis'));

    const user = await User.findById(req.user.id).populate('subscription');
    const isPremium = await user.isActivePremium();

    const result = await endSession({ sessionId: session.mlSessionId, isPremium });

    session.treatmentPlan = result.treatment_plan;
    session.closedAt = new Date();
    session.status = 'completed';
    session.diagnosis = result?.session_summary?.diagnosis || session.diagnosis || null;
    await session.save();

    // mémoire trans-séance minimale
    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        lastSummary: session.diagnosis || '',
        lastDangerLevel: session.danger?.score || 0,
        activeExercises: (result.treatment_plan?.exercises || [])
      }
    });

    return res.json(apiResponse.success({
      session_id: session._id,
      status: session.status,
      diagnosis: session.diagnosis,
      treatment_plan: result.treatment_plan
    }));
  } catch (e) { return next(ApiError.internal(e.message || 'Erreur service ML')); }
};

/**
 * Historique des séances de l'utilisateur (liste)
 * GET /api/v1/sessions
 */
exports.listSessionsCtrl = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('subscription');
    const isPremium = await user.isActivePremium();
    const limit = isPremium ? 100 : 10;

    const sessions = await Session.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-__v');

    const total = await Session.countDocuments({ user: req.user.id });

    return res.json(apiResponse.success({
      sessions, isPremium, displayed: sessions.length, total, limit,
      message: (!isPremium && total > limit) ? `Vous voyez ${limit} séances sur ${total}. Passez en Premium pour tout l’historique.` : null
    }));
  } catch (e) { return next(ApiError.internal(e.message)); }
};

/**
 * Timeline complète d'une séance
 * GET /api/v1/sessions/:dbId/timeline
 */
exports.getTimelineCtrl = async (req, res, next) => {
  try {
    const s = await Session.findOne({ _id: req.params.dbId, user: req.user.id })
      .select('-__v')
      .lean();
    if (!s) return next(ApiError.notFound('Session introuvable'));

    // messages[] est déjà horodaté via subdocs timestamps
    return res.json(apiResponse.success({
      session: {
        id: s._id,
        status: s.status,
        createdAt: s.createdAt,
        closedAt: s.closedAt,
        emotion: s.emotion,
        danger: s.danger,
        messages: s.messages,
        diagnosis: s.diagnosis || null,
        treatmentPlan: s.treatmentPlan || null
      }
    }));
  } catch (e) { return next(ApiError.internal(e.message)); }
};

/**
 * Streaming audio d’un message (HTTP Range)
 * GET /api/v1/sessions/:dbId/audio/:messageId
 */
exports.streamAudioCtrl = async (req, res, next) => {
  try {
    const s = await Session.findOne({ _id: req.params.dbId, user: req.user.id });
    if (!s) return next(ApiError.notFound('Session introuvable'));
    const m = s.messages.id(req.params.messageId);
    if (!m || !m.filePath) return next(ApiError.notFound('Message audio introuvable'));

    const file = m.filePath;
    const stat = fs.statSync(file);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      // Réponse partielle 206 pour permettre le seek
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunk = (end - start) + 1;
      const stream = fs.createReadStream(file, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunk,
        'Content-Type': 'audio/wav'
      });
      stream.pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'audio/wav' });
      fs.createReadStream(file).pipe(res);
    }
  } catch (e) { return next(ApiError.internal(e.message)); }
};

/**
 * Redémarrer une nouvelle séance à partir d'une close
 * POST /api/v1/sessions/restart  body: { previous_session_db_id }
 */
exports.restartFromPreviousCtrl = async (req, res, next) => {
  try {
    const prev = await Session.findOne({ _id: req.body.previous_session_db_id, user: req.user.id })
      .select('treatmentPlan emotion danger diagnosis');
    if (!prev) return next(ApiError.notFound('Séance précédente introuvable'));

    const s = await Session.create({
      user: req.user.id,
      status: 'planned',
      sessionDate: today()
    });

    await User.findByIdAndUpdate(req.user.id, {
      $set: {
        lastSummary: prev.diagnosis || (prev.treatmentPlan ? prev.treatmentPlan.plan_type : ''),
        lastEmotion: prev.emotion || null,
        lastDangerLevel: prev.danger?.score || 0,
        activeExercises: prev.treatmentPlan?.exercises || []
      }
    });

    return res.json(apiResponse.success({ session_db_id: s._id, status: s.status }));
  } catch (e) { return next(ApiError.internal(e.message)); }
};
