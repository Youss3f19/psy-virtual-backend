const express = require('express');
const router = express.Router();
const BillingController = require('../controllers/billing.controller');
const { createCheckoutValidator, sessionIdValidator } = require('../validators/billing.validator');
const validate = require('../middleware/validation.middleware');
const { protect } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/v1/billing/checkout
 */
router.post('/checkout', protect, createCheckoutValidator, validate, BillingController.createCheckout);

/**
 * @route   GET /api/v1/billing/session/:sessionId
 */
router.get('/session/:sessionId', protect, sessionIdValidator, validate, BillingController.getSessionStatus);

/**
 * @route   POST /api/v1/billing/cancel
 */
router.post('/cancel', protect, BillingController.cancelSubscription);


module.exports = router;
