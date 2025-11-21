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

  // Subscription relation: moved premium flags to separate Subscription model
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null, index: true },

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

// Async helper: checks linked Subscription document if present, otherwise loads it.
userSchema.methods.isActivePremium = async function(){
  // If subscription is populated as an object
  if (this.subscription && typeof this.subscription === 'object') {
    if (this.subscription.isActive === false) return false;
    if (!this.subscription.expiresAt) return true;
    return this.subscription.expiresAt > new Date();
  }
  // Otherwise try to load Subscription model
  try {
    const Subscription = mongoose.model('Subscription');
    const sub = await Subscription.findOne({ user: this._id });
    if (!sub) return false;
    if (sub.isActive === false) return false;
    if (!sub.expiresAt) return true;
    return sub.expiresAt > new Date();
  } catch (e) {
    return false;
  }
};
userSchema.statics.findByEmail = function(email){ return this.findOne({ email: email.toLowerCase() }); };
userSchema.virtual('displayName').get(function(){ return this.name || this.email.split('@')[0]; });

// Virtual boolean for convenience when subscription is already populated
userSchema.virtual('isPremium').get(function(){
  if (this.subscription && typeof this.subscription === 'object') {
    if (this.subscription.isActive === false) return false;
    if (!this.subscription.expiresAt) return true;
    return this.subscription.expiresAt > new Date();
  }
  return false;
});
module.exports = mongoose.model('User', userSchema);
