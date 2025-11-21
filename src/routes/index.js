const express = require('express');
const authRoutes = require('./auth.routes');
const voiceRoutes = require('./voice.routes');
const billingRoutes = require('./billing.routes');
const adviceRatingRoutes = require('./adviceRating.routes');
const adminRoutes = require('./admin.routes');
const weeklyChallengeRoutes = require('./weeklyChallenge.routes');
const notificationRoutes = require('./notification.routes');

const router = express.Router();

/**
 * @desc    Health check
 * @route   GET /api/v1/health
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API opérationnelle',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// Routes d'authentification
router.use('/auth', authRoutes);
router.use('/chat', voiceRoutes); 
router.use('/billing', billingRoutes);
// Ratings (sessions/:id/rate etc.)
router.use('/', adviceRatingRoutes);
// Admin
router.use('/', adminRoutes);
// Weekly challenges
router.use('/', weeklyChallengeRoutes);
// Notifications
router.use('/', notificationRoutes);

module.exports = router;
