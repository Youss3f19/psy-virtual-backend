const router = require('express').Router();
const { upload } = require('../middleware/upload.middleware');
const { protect } = require('../middleware/auth.middleware');
const { validateSessionOwnership } = require('../middleware/session.middleware');
const { 
  processVoiceCtrl, 
  endSessionCtrl, 
  listSessionsCtrl,
  getSessionCtrl,      
  deleteSessionCtrl    
} = require('../controllers/voice.controller');
const { processVoiceRules, endSessionRules } = require('../validators/voice.validator');

// Route principale envoyer un message vocal
router.post(
  '/voice', 
  protect, 
  upload.single('audio'), 
  validateSessionOwnership,
  processVoiceRules, 
  processVoiceCtrl
);

// Terminer une session et générer le plan de traitement
router.post(
  '/voice/end-session', 
  protect, 
  validateSessionOwnership,  
  endSessionRules, 
  endSessionCtrl
);

//  Lister toutes les sessions de l'utilisateur
router.get('/voice/sessions', protect, listSessionsCtrl);

// Obtenir une session spécifique (avec validation de propriété)
router.get('/voice/sessions/:sessionId', protect, getSessionCtrl);

// Supprimer une session (avec validation de propriété)
router.delete('/voice/sessions/:sessionId', protect, deleteSessionCtrl);

module.exports = router;
