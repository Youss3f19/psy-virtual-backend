const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const { uploadAudio } = require('../middleware/upload.middleware');
const { loadSessionIfAny, enforceDailyQuota } = require('../middleware/session.middleware');
const enforcePremiumLimits = require('../middleware/premium.middleware');
const Voice = require('../controllers/voice.controller');

const router = express.Router();

// Historique et timeline 
router.get('/sessions', protect, Voice.listSessionsCtrl);
router.get('/sessions/:dbId/timeline', protect, Voice.getTimelineCtrl);
router.get('/sessions/:dbId/audio/:messageId', protect, Voice.streamAudioCtrl);

// Démarrage / flux / clôture d'une séance
router.post('/sessions/start', protect, enforceDailyQuota, Voice.startSession);
router.post('/sessions/voice', protect, uploadAudio, loadSessionIfAny, enforcePremiumLimits, Voice.processVoiceCtrl);
router.post(
  '/sessions/:mlId/complete',
  protect,
  (req, _res, next) => { req.body.session_ml_id = req.params.mlId; next(); },
  loadSessionIfAny,
  Voice.endSessionCtrl
);

// Redémarrer une nouvelle séance à partir d’une close
router.post('/sessions/restart', protect, Voice.restartFromPreviousCtrl);

module.exports = router;
  