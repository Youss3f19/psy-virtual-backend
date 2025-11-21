const express = require('express');
const WeeklyChallengeController = require('../controllers/weeklyChallenge.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router();

// Public list and get
router.get('/challenges', WeeklyChallengeController.listChallenges);
router.get('/challenges/:id', WeeklyChallengeController.getChallenge);
router.get('/challenges/:id/leaderboard', WeeklyChallengeController.getLeaderboard);

// Protected submit
router.post('/challenges/:id/submit', protect, WeeklyChallengeController.submitScore);

// Admin-ish endpoints (protected) to create or delete
router.post('/challenges', protect, WeeklyChallengeController.createChallenge);
router.delete('/challenges/:id', protect, WeeklyChallengeController.deleteChallenge);

module.exports = router;
