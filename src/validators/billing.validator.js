// src/validators/billing.validator.js
const { body, param } = require('express-validator');

const createCheckoutValidator = [
  body('plan')
    .trim()
    .notEmpty()
    .withMessage('Le plan est requis')
    .isIn(['monthly', 'quarterly', 'yearly'])
    .withMessage('Plan invalide. Choix: monthly, quarterly, yearly'),
];

const sessionIdValidator = [
  param('sessionId')
    .trim()
    .notEmpty()
    .withMessage('sessionId requis')
    .matches(/^cs_/)
    .withMessage('sessionId invalide'),
];

module.exports = {
  createCheckoutValidator,
  sessionIdValidator,
};
