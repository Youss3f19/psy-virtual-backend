const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/billing.controller');
const { createCheckoutValidator, sessionIdValidator } = require('../validators/billing.validator');
const validate = require('../middleware/validation.middleware');
const { protect } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/v1/billing/checkout
 * @desc    Créer session Checkout Stripe
 * @access  Private
 */
router.post('/checkout', protect, createCheckoutValidator, validate, BillingController.createCheckout);

/**
 * @route   GET /api/v1/billing/session/:sessionId
 * @desc    Vérifier statut session
 * @access  Private
 */
router.get('/session/:sessionId', protect, sessionIdValidator, validate, BillingController.getSessionStatus);

/**
 * @route   POST /api/v1/billing/cancel
 * @desc    Annuler abonnement
 * @access  Private
 */
router.post('/cancel', protect, BillingController.cancelSubscription);

/**
 * @route   POST /api/v1/billing/webhook
 * @desc    Webhook Stripe
 * @access  Public (mais signature vérifiée)
 */
router.post('/webhook', express.raw({ type: 'application/json' }), BillingController.handleWebhook);

module.exports = router;
