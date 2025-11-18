const { body } = require('express-validator');

const processVoiceRules = [
  body('sessionId').optional().isInt().withMessage('session_id doit être un entier'),
];

const endSessionRules = [
  body('sessionId').exists().withMessage('session_id requis').isInt(),
];

module.exports = { processVoiceRules, endSessionRules };
