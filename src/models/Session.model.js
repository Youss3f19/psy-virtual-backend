const mongoose = require('mongoose');

// pour ameliorer le ui ux flutter 
// const TranscriptSegmentSchema = new mongoose.Schema({
//   start: Number, end: Number, text: String
// }, { _id: false });

const MessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user','assistant'], required: true },
  type: { type: String, enum: ['audio','text'], default: 'audio' },
  label: { type: String, enum: ['assistant_response','assistant_question','user_input','system'], default: 'user_input' },
  filePath: String,
  durationSec: Number,
  stt: {
    text: String,
    // segments: [TranscriptSegmentSchema],
    languageCode: String
  },
  emotionAtTurn: { type: String, enum: ['tristesse','colere','peur','anxiete','neutre'] }
}, { timestamps: true, _id: true });

const SessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
  mlSessionId: { type: Number, index: true },

  status: { type: String, enum: ['planned','in-progress','completed','cancelled'], default: 'planned', index: true },
  sessionDate: { type: String, index: true }, 

  // Résumé de séance (aggrégé)
  emotion: { type: String, enum: ['tristesse','colere','peur','anxiete','neutre'] },
  confidence: { type: Number, min: 0, max: 1 },
  languageCode: String,

  // Timeline complète
  messages: [MessageSchema],

  // Risque/urgence
  danger: {
    score: { type: Number, min: 0, max: 10, default: 0 },
    riskLevel: { type: String, enum: ['FAIBLE','MODÉRÉ','ÉLEVÉ','CRITIQUE'] },
    action: String,
    triggers: [{ type: String }]
  },

  // Sortie finale de séance uniquement
  diagnosis: String, // résumé clinique final (facultatif)
  treatmentPlan: {
    plan_type: { type: String, enum: ['GRATUIT','PREMIUM'] },
    emotion: String,
    danger_level: Number,
    exercises: { type: Array, default: [] },
    recommendations: { type: Array, default: [] },
    follow_up: { type: Object }
  },

  closedAt: Date
}, { timestamps: true });

SessionSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('Session', SessionSchema);
