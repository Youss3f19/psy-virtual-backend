const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  tier: { type: String, enum: ['free','basic','pro','premium'], default: 'premium' },
  isActive: { type: Boolean, default: true },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  autoRenew: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
  timestamps: true
});

subscriptionSchema.methods.isActiveNow = function() {
  if (!this.isActive) return false;
  if (!this.expiresAt) return true;
  return this.expiresAt > new Date();
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
