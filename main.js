const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Import core modules
const brain = require('./core/brain');
const voice = require('./core/voice');
const tts = require('./core/tts');
const fallback = require('./core/fallback');
const router = require('./core/router');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    frame: true,
    transparent: false,
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── Initialize all core systems ───────────────────────────────
let eventsRegistered = false;

function initializeCore() {
  const env = process.env;

  // Initialize AI brain and providers
  brain.initialize(env);

  // Initialize voice (Whisper STT) — requires OpenAI key
  voice.init(env.OPENAI_API_KEY);

  // Initialize TTS (ElevenLabs)
  tts.init(env.ELEVENLABS_API_KEY, env.ELEVENLABS_VOICE_ID);

  // Register event listeners only once
  if (!eventsRegistered) {
    eventsRegistered = true;

    fallback.on('provider-switch', (data) => {
      if (mainWindow) mainWindow.webContents.send('provider-switch', data);
    });

    router.on('tool-start', (data) => {
      if (mainWindow) mainWindow.webContents.send('tool-activity', { ...data, status: 'running' });
    });
    router.on('tool-done', (data) => {
      if (mainWindow) mainWindow.webContents.send('tool-activity', { ...data, status: 'done' });
    });
    router.on('tool-error', (data) => {
      if (mainWindow) mainWindow.webContents.send('tool-activity', { ...data, status: 'error' });
    });
  }

  console.log('[ARIA] Core systems initialized');
  console.log('[ARIA] Active provider:', brain.getActiveProvider());
  console.log('[ARIA] Voice STT available:', voice.isAvailable());
  console.log('[ARIA] TTS available:', tts.isAvailable());
}

// ── App Lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  initializeCore();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ═══════════════════════════════════════════════════════════════
// IPC HANDLERS
// ═══════════════════════════════════════════════════════════════

// ── Send text command to AI brain ─────────────────────────────
ipcMain.handle('send-command', async (event, text) => {
  try {
    const result = await brain.processQuery(text);
    return result;
  } catch (err) {
    console.error('[IPC] send-command error:', err);
    return {
      text: `Error: ${err.message}`,
      provider: brain.getActiveProvider(),
      tokens_used: 0,
      error: true
    };
  }
});

// ── Transcribe audio (Whisper STT) ────────────────────────────
ipcMain.handle('transcribe-audio', async (event, audioData, format) => {
  try {
    if (!voice.isAvailable()) {
      return { error: 'Whisper STT requires an OpenAI API key. Add one in Settings > API Keys.' };
    }
    const buffer = Buffer.from(audioData);
    const text = await voice.transcribe(buffer, format || 'webm');
    return { text };
  } catch (err) {
    console.error('[IPC] transcribe-audio error:', err);
    return { error: err.message };
  }
});

// ── Text-to-Speech (ElevenLabs) ───────────────────────────────
ipcMain.handle('synthesize-speech', async (event, text) => {
  try {
    if (!tts.isAvailable()) {
      return { error: 'ElevenLabs TTS requires an API key and Voice ID. Add them in Settings > API Keys.' };
    }
    const audioBuffer = await tts.synthesize(text);
    // Convert to base64 for sending to renderer
    return { audio: audioBuffer.toString('base64'), format: 'mp3' };
  } catch (err) {
    console.error('[IPC] synthesize-speech error:', err);
    return { error: err.message };
  }
});

// ── Get provider statuses ─────────────────────────────────────
ipcMain.handle('get-provider-statuses', async () => {
  return brain.getProviderStatuses();
});

// ── Get active provider info ──────────────────────────────────
ipcMain.handle('get-active-provider', async () => {
  return brain.getActiveProvider();
});

// ── Switch provider ───────────────────────────────────────────
ipcMain.handle('switch-provider', async (event, providerName) => {
  return brain.switchProvider(providerName);
});

// ── Get module availability status ────────────────────────────
ipcMain.handle('get-system-status', async () => {
  return {
    voice: voice.isAvailable(),
    tts: tts.isAvailable(),
    providers: brain.getProviderStatuses(),
    activeProvider: brain.getActiveProvider(),
  };
});

// ── Get TTS voices ────────────────────────────────────────────
ipcMain.handle('get-tts-voices', async () => {
  try {
    return await tts.getVoices();
  } catch (err) {
    return [];
  }
});

// ── Save settings ─────────────────────────────────────────────
ipcMain.handle('save-settings', async (event, settings) => {
  const configPath = path.join(__dirname, 'settings', 'config.json');
  try {
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── Load settings ─────────────────────────────────────────────
ipcMain.handle('load-settings', async () => {
  const configPath = path.join(__dirname, 'settings', 'config.json');
  try {
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
});

// ── Save API keys to .env ─────────────────────────────────────
ipcMain.handle('save-api-keys', async (event, keys) => {
  const envPath = path.join(__dirname, '.env');
  try {
    let envContent = '';
    try { envContent = fs.readFileSync(envPath, 'utf-8'); } catch (e) { /* no existing file */ }

    // Parse existing .env
    const envMap = {};
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)/);
      if (match) envMap[match[1].trim()] = match[2].trim();
    });

    // Merge new keys
    Object.assign(envMap, keys);

    // Write back
    const newContent = Object.entries(envMap)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n';
    fs.writeFileSync(envPath, newContent);

    // Reload into process.env
    Object.entries(keys).forEach(([k, v]) => {
      if (v) process.env[k] = v;
    });

    // Re-initialize core with new keys
    initializeCore();

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ── OpenRouter Model Management ───────────────────────────────
const openrouter = require('./core/providers/openrouter');

ipcMain.handle('get-openrouter-free-models', async () => {
  return openrouter.getFreeModels();
});

ipcMain.handle('set-openrouter-model', async (event, modelId) => {
  openrouter.setModel(modelId);
  // Save to config
  const configPath = path.join(__dirname, 'settings', 'config.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config.providers.openrouter.model = modelId;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) { console.error('[Config] Save error:', e.message); }
  return { success: true, model: modelId };
});

ipcMain.handle('get-openrouter-model', async () => {
  return openrouter.getModel();
});
