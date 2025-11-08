const { body } = require('express-validator');

const processVoiceRules = [
  body('session_id').optional().isInt().withMessage('session_id doit être un entier'),
];

const endSessionRules = [
  body('session_id').exists().withMessage('session_id requis').isInt(),
];

module.exports = { processVoiceRules, endSessionRules };
