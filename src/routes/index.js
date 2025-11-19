const express = require('express');
const authRoutes = require('./auth.routes');
const voiceRoutes = require('./voice.routes');
const billingRoutes = require('./billing.routes');

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
router.use('/voice', voiceRoutes); 
router.use('/billing', billingRoutes);

module.exports = router;
