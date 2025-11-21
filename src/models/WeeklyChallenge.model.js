const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  choices: [{ type: String }],
  // index of correct choice in choices[] (server-only, do not return to clients)
  correctIndex: { type: Number, required: true }
}, { _id: false });

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, required: true },
  answers: [{ type: Number }], // index per question
  submittedAt: { type: Date, default: Date.now }
}, { _id: false });

const weeklyChallengeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  weekStart: { type: Date, required: true, index: true },
  weekEnd: { type: Date, required: true },
  questions: { type: [questionSchema], default: [] },
  participants: { type: [participantSchema], default: [] },
  isActive: { type: Boolean, default: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

// ensure a single challenge per weekStart
weeklyChallengeSchema.index({ weekStart: 1 }, { unique: true });

/**
 * Get leaderboard sorted descending by score then by earliest submission
 */
weeklyChallengeSchema.methods.getLeaderboard = function(limit = 10) {
  const arr = (this.participants || []).slice();
  arr.sort((a,b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.submittedAt) - new Date(b.submittedAt);
  });
  return arr.slice(0, limit);
};

module.exports = mongoose.model('WeeklyChallenge', weeklyChallengeSchema);
