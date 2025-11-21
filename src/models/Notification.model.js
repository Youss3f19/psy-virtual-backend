const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, default: '' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  read: { type: Boolean, default: false, index: true },
  channel: { type: String, enum: ['inapp','email','push'], default: 'inapp' },
  sentAt: { type: Date, default: Date.now },
  deliveredAt: { type: Date, default: null }
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
