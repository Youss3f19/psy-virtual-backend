const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/, index: true },
  password: { type: String, minlength: 6, select: false },

  googleId:   { type: String, index: true, sparse: true },
  facebookId: { type: String, index: true, sparse: true },

  avatar: { type: String, default: null },
  authProvider: { type: String, enum: ['local','google','facebook'], default: 'local' },
  
  stripeSubscriptionId: { type: String, index: true, default: null },
  isPremium: { type: Boolean, default: false },
  premiumExpiresAt: { type: Date, default: null },

  isEmailVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date, default: null },

  emotionHistory: [{
    emotion: { type: String, enum: ['joie','tristesse','colere','anxiete','peur','neutre'] },
    intensity: { type: Number, min: 0, max: 1 },
    timestamp: { type: Date, default: Date.now }
  }],

  // mémoire inter‑séances
  lastSummary: String,
  lastEmotion: { type: String, enum: ['joie','tristesse','colere','anxiete','peur','neutre'] },
  lastDangerLevel: { type: Number, min: 0, max: 10 },
  activeExercises: { type: Array, default: [] }
}, {
  timestamps: true,
  toJSON: { virtuals: true, transform: (_d, r) => { delete r.password; delete r.__v; return r; } },
  toObject: { virtuals: true }
});

userSchema.index({ email: 1, authProvider: 1 });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ facebookId: 1 }, { unique: true, sparse: true });

userSchema.pre('save', async function(next){
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(config.bcryptRounds);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function(p){ return bcrypt.compare(p, this.password); };
userSchema.methods.isActivePremium = function(){ if (!this.isPremium) return false; if (!this.premiumExpiresAt) return true; return this.premiumExpiresAt > new Date(); };
userSchema.statics.findByEmail = function(email){ return this.findOne({ email: email.toLowerCase() }); };
userSchema.virtual('displayName').get(function(){ return this.name || this.email.split('@')[0]; });

module.exports = mongoose.model('User', userSchema);
