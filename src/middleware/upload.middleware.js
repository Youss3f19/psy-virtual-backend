const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    crypto.randomBytes(16, (err, buf) => {
      if (err) return cb(err);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}_${buf.toString('hex')}${ext}`);
    });
  }
});

const allowed = new Set([
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
const fileFilter = (_req, file, cb) => allowed.has(file.mimetype) ? cb(null, true) : cb(new Error('Type de fichier non autorisé'));

exports.uploadAudio = multer({
  storage, fileFilter, limits: { fileSize: 16 * 1024 * 1024 }
}).single('audio');
