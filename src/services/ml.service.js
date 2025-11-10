const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5005';
const ML_REQUEST_TIMEOUT = Number(process.env.ML_REQUEST_TIMEOUT || 120000);

async function processVoice({ filePath, userId, sessionId }) {
  const form = new FormData();
  form.append('audio', fs.createReadStream(filePath));
  if (sessionId) form.append('user_id', String(sessionId));

  const { data } = await axios.post(
    `${ML_SERVICE_URL}/api/chat/process-voice`,
    form,
    { headers: form.getHeaders(), timeout: ML_REQUEST_TIMEOUT }
  );
  return data;
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
