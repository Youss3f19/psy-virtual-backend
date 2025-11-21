const mongoose = require('mongoose');

const notificationQueueSchema = new mongoose.Schema({
  notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true, index: true },
  channel: { type: String, enum: ['inapp','email','push'], required: true },
  status: { type: String, enum: ['pending','processing','sent','failed'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  availableAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('NotificationQueue', notificationQueueSchema);
