// src/middleware/upload.middleware.js
const multer = require('multer');
const path = require('path');

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 16);

// Extensions autorisées
const allowedExt = new Set(['.wav', '.mp3', '.ogg', '.m4a', '.webm', '.flac']);

// Mimetypes fréquents (selon OS / Postman)
const allowedMime = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/flac',
  'application/octet-stream' 
]);

const upload = multer({
  dest: path.join(process.cwd(), 'tmp'),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const ok = allowedMime.has(file.mimetype) || allowedExt.has(ext) || (file.mimetype || '').startsWith('audio/');
    if (!ok) {
      return cb(new Error('Format audio invalide (wav/mp3/ogg/m4a/webm/flac)'), false);
    }
    cb(null, true);
  },
});

module.exports = { upload };
