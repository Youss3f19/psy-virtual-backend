const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const crypto = require('crypto');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5005';
const ML_REQUEST_TIMEOUT = Number(process.env.ML_REQUEST_TIMEOUT || 120000);

/**
 * Convertir MongoDB ObjectId en entier numérique stable
 */
function toNumericId(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  
  const hash = crypto.createHash('sha256').update(String(value)).digest('hex');
  return parseInt(hash.substring(0, 8), 16);
}

async function processVoice({ filePath, userId, sessionId }) {
  const form = new FormData();
  form.append('audio', fs.createReadStream(filePath));
  
  if (sessionId) {
    // Session existante : user_id = session_id
    form.append('user_id', String(sessionId));
    form.append('session_id', String(sessionId));
  } else {
    // Première session : générer user_id depuis userId MongoDB
    const userIdInt = toNumericId(userId);
    form.append('user_id', String(userIdInt));
    // Pas de session_id (Python va créer une nouvelle session)
  }

  console.log('  ENVOI VERS PYTHON:');
  console.log('  - userId (MongoDB):', userId);
  console.log('  - sessionId (Python):', sessionId || 'NOUVEAU');

  try {
    const { data } = await axios.post(
      `${ML_SERVICE_URL}/api/chat/process-voice`,
      form,
      { headers: form.getHeaders(), timeout: ML_REQUEST_TIMEOUT }
    );
    return data;
  } catch (error) {
    console.error('❌ ERREUR ML SERVICE:', error.response?.data || error.message);
    throw error;
  }
}

async function endSession({ sessionId }) {
  const { data } = await axios.post(
    `${ML_SERVICE_URL}/api/chat/end-session`,
    { session_id: sessionId },
    { timeout: ML_REQUEST_TIMEOUT }
  );
  return data;
}

module.exports = { processVoice, endSession };
