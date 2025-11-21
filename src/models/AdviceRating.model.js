const mongoose = require('mongoose');

const adviceRatingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, trim: true, default: '' },
}, {
  timestamps: true
});

// Prevent one user from rating the same session multiple times
adviceRatingSchema.index({ user: 1, session: 1 }, { unique: true });

module.exports = mongoose.model('AdviceRating', adviceRatingSchema);
