/* ═══════════════════════════════════════════════════════════════
   ARIA — Text-to-Speech (ElevenLabs)
   Converts AI text responses to spoken audio
   ═══════════════════════════════════════════════════════════════ */

const axios = require('axios');

let apiKey = null;
let voiceId = null;

function init(elevenLabsKey, elevenLabsVoiceId) {
  // Guard against empty strings
  apiKey = (elevenLabsKey && elevenLabsKey.trim()) ? elevenLabsKey.trim() : null;
  voiceId = (elevenLabsVoiceId && elevenLabsVoiceId.trim()) ? elevenLabsVoiceId.trim() : null;

  if (apiKey && voiceId) {
    console.log(`[TTS] Initialized — Voice ID: ${voiceId.substring(0, 8)}...`);
    return true;
  }

  if (apiKey && !voiceId) {
    console.log('[TTS] API key set but Voice ID missing');
  }
  if (!apiKey) {
    console.log('[TTS] No API key set');
  }
  return false;
}

/**
 * Convert text to speech using ElevenLabs API
 * @param {string} text - Text to speak
 * @param {object} options - Voice settings
 * @returns {Promise<Buffer>} MP3 audio buffer
 */
async function synthesize(text, options = {}) {
  if (!apiKey) {
    throw new Error('ElevenLabs API key not configured. Go to Settings > API Keys.');
  }
  if (!voiceId) {
    throw new Error('ElevenLabs Voice ID not set. Go to Settings > API Keys.');
  }

  // Truncate very long text to avoid timeouts
  const maxChars = 2500;
  const spokenText = text.length > maxChars ? text.substring(0, maxChars) + '...' : text;

  const {
    stability = 0.5,
    similarity_boost = 0.75,
    model_id = 'eleven_monolingual_v1',
  } = options;

  console.log(`[TTS] Synthesizing ${spokenText.length} chars with voice ${voiceId}`);

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: spokenText,
        model_id,
        voice_settings: {
          stability,
          similarity_boost,
        },
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );

    // Check if we actually got audio data
    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      // ElevenLabs returned an error as JSON, not audio
      const errorText = Buffer.from(response.data).toString('utf-8');
      let errorData;
      try { errorData = JSON.parse(errorText); } catch (e) { errorData = { detail: errorText }; }
      throw new Error(`ElevenLabs error: ${errorData.detail?.message || errorData.detail || 'Unknown error'}`);
    }

    console.log(`[TTS] Got audio: ${response.data.byteLength} bytes`);
    return Buffer.from(response.data);

  } catch (err) {
    // Extract clean error message
    if (err.response) {
      const status = err.response.status;
      let detail = '';
      try {
        const body = Buffer.from(err.response.data).toString('utf-8');
        const json = JSON.parse(body);
        detail = json.detail?.message || json.detail?.status || json.detail || '';
        if (typeof detail === 'object') detail = JSON.stringify(detail);
      } catch (e) {
        detail = `HTTP ${status}`;
      }

      if (status === 401) {
        throw new Error(`ElevenLabs: Invalid API key or subscription issue. Check your API key. (${detail})`);
      } else if (status === 422) {
        throw new Error(`ElevenLabs: Invalid voice ID "${voiceId}". Check your Voice ID in Settings.`);
      } else {
        throw new Error(`ElevenLabs error (${status}): ${detail}`);
      }
    }
    throw err;
  }
}

/**
 * Get available voices from ElevenLabs
 */
async function getVoices() {
  if (!apiKey) return [];

  try {
    const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
      timeout: 10000,
    });
    return response.data.voices || [];
  } catch (err) {
    console.error('[TTS] Failed to fetch voices:', err.message);
    return [];
  }
}

function isAvailable() {
  return !!(apiKey && voiceId);
}

function setVoice(newVoiceId) {
  voiceId = newVoiceId;
}

module.exports = { init, synthesize, getVoices, isAvailable, setVoice };
