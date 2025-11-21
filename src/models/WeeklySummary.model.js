const mongoose = require('mongoose');

const weeklySummarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  weekStart: { type: Date, required: true, index: true },
  weekEnd: { type: Date, required: true },
  sessionsCount: { type: Number, default: 0 },
  averageRating: { type: Number, default: null },
  ratingsCount: { type: Number, default: 0 },
  predominantEmotion: { type: String, default: null },
  totalDurationSec: { type: Number, default: 0 },
  // Brief human readable summary
  summaryText: { type: String, default: '' },
  // Detailed per-session mini-summary to show on UI if needed
  sessionsSummary: [{
    sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
    sessionDate: Date,
    emotion: String,
    durationSec: Number,
    rating: Number
  }],
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

weeklySummarySchema.index({ user: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeeklySummary', weeklySummarySchema);
