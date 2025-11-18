const mongoose = require('mongoose');

const SessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    // id session retourné par le service Python (entier)
    mlSessionId: { type: Number, index: true },
    emotion: { type: String, enum: ['tristesse', 'colere', 'peur', 'anxiete', 'neutre'] },
    confidence: { type: Number, min: 0, max: 1 },
    transcription: { type: String },
    danger: {
      score: { type: Number, min: 0, max: 10, default: 0 },
      riskLevel: { type: String, enum: ['FAIBLE', 'MODÉRÉ', 'ÉLEVÉ', 'CRITIQUE'] },
      action: { type: String },
      triggers: [{ type: String }],
    },
    therapistResponse: { type: String },
    questions: [{ type: String }],
    treatmentPlan: {
      plan_type: { type: String, enum: ['GRATUIT', 'PREMIUM'] },
      emotion: { type: String },
      danger_level: { type: Number },
      exercises: { type: Array, default: [] },
      recommendations: { type: Array, default: [] },
      follow_up: { type: Object }
    },
    // statut de session
    closedAt: { type: Date }
  },
  { timestamps: true }
);
module.exports = mongoose.model('Session', SessionSchema);

