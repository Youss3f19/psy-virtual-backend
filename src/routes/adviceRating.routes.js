const express = require('express');
const AdviceRatingController = require('../controllers/adviceRating.controller');
const { protect } = require('../middleware/auth.middleware');

const router = express.Router({ mergeParams: true });

// Create or update my rating for a session
router.post('/sessions/:sessionId/rate', protect, AdviceRatingController.createRating);
// Get my rating
router.get('/sessions/:sessionId/rating', protect, AdviceRatingController.getMyRating);
// List ratings for a session (public)
router.get('/sessions/:sessionId/ratings', protect, AdviceRatingController.listRatingsForSession);
// Delete my rating
router.delete('/sessions/:sessionId/rating', protect, AdviceRatingController.deleteMyRating);

module.exports = router;
