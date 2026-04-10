/* ═══════════════════════════════════════════════════════════════
   ARIA — Voice Input (Speech-to-Text)
   Uses OpenAI Whisper API for high-quality transcription
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

let client = null;
const tempDir = path.join(__dirname, '..', 'data');

function init(openaiApiKey) {
  // Guard against empty strings
  const key = (openaiApiKey && openaiApiKey.trim()) ? openaiApiKey.trim() : null;
  if (!key) {
    console.log('[Voice] No OpenAI API key — Whisper STT disabled');
    client = null;
    return false;
  }

  try {
    client = new OpenAI({ apiKey: key });
    console.log('[Voice] Whisper STT initialized');
    return true;
  } catch (err) {
    console.error('[Voice] Init error:', err.message);
    client = null;
    return false;
  }
}

/**
 * Transcribe audio buffer using OpenAI Whisper API
 * @param {Buffer} audioBuffer - WebM/WAV audio buffer from renderer
 * @param {string} format - Audio format (webm, wav)
 * @returns {Promise<string>} Transcribed text
 */
async function transcribe(audioBuffer, format = 'webm') {
  if (!client) {
    throw new Error('Whisper STT requires an OpenAI API key. Add it in Settings > API Keys.');
  }

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Save buffer to temp file
  const tempFile = path.join(tempDir, `aria_voice_${Date.now()}.${format}`);
  fs.writeFileSync(tempFile, audioBuffer);

  try {
    console.log(`[Voice] Transcribing ${audioBuffer.length} bytes of ${format} audio...`);

    const transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1',
      language: 'en',
    });

    console.log(`[Voice] Transcription: "${transcription.text}"`);
    return transcription.text || '';
  } catch (err) {
    if (err.status === 401) {
      throw new Error('OpenAI API key is invalid. Check your key in Settings > API Keys.');
    }
    throw new Error(`Whisper transcription failed: ${err.message}`);
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
  }
}

function isAvailable() {
  return client !== null;
}

module.exports = { init, transcribe, isAvailable };
