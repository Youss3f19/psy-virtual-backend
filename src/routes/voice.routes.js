const router = require('express').Router();
const { upload } = require('../middleware/upload.middleware');
const { 
  processVoiceCtrl, 
  endSessionCtrl, 
  listSessionsCtrl,
  getSessionCtrl,      
  deleteSessionCtrl    
} = require('../controllers/voice.controller');
const { processVoiceRules, endSessionRules } = require('../validators/voice.validator');
const { protect } = require('../middleware/auth.middleware');

router.post('/voice', protect, upload.single('audio'), processVoiceRules, processVoiceCtrl);
router.post('/voice/end-session', protect, endSessionRules, endSessionCtrl);

// Routes d'historique
router.get('/voice/sessions', protect, listSessionsCtrl);           
router.get('/voice/sessions/:sessionId', protect, getSessionCtrl);  
router.delete('/voice/sessions/:sessionId', protect, deleteSessionCtrl);

module.exports = router;
