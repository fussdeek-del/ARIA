const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aria', {
  // ── AI Brain ────────────────────────────────────────────────
  sendCommand: (text) => ipcRenderer.invoke('send-command', text),

  // ── Voice (Whisper STT) ─────────────────────────────────────
  transcribeAudio: (audioData, format) => ipcRenderer.invoke('transcribe-audio', audioData, format),

  // ── TTS (ElevenLabs) ────────────────────────────────────────
  synthesizeSpeech: (text) => ipcRenderer.invoke('synthesize-speech', text),

  // ── Provider Management ─────────────────────────────────────
  getProviderStatuses: () => ipcRenderer.invoke('get-provider-statuses'),
  getActiveProvider: () => ipcRenderer.invoke('get-active-provider'),
  switchProvider: (name) => ipcRenderer.invoke('switch-provider', name),
  getSystemStatus: () => ipcRenderer.invoke('get-system-status'),
  getTTSVoices: () => ipcRenderer.invoke('get-tts-voices'),

  // ── OpenRouter Model Management ─────────────────────────────
  getOpenRouterFreeModels: () => ipcRenderer.invoke('get-openrouter-free-models'),
  setOpenRouterModel: (modelId) => ipcRenderer.invoke('set-openrouter-model', modelId),
  getOpenRouterModel: () => ipcRenderer.invoke('get-openrouter-model'),

  // ── Settings ────────────────────────────────────────────────
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),

  // ── Event Listeners ─────────────────────────────────────────
  onResponse: (callback) => ipcRenderer.on('ai-response', (_, data) => callback(data)),
  onToolActivity: (callback) => ipcRenderer.on('tool-activity', (_, data) => callback(data)),
  onProviderSwitch: (callback) => ipcRenderer.on('provider-switch', (_, data) => callback(data)),
  onNewsUpdate: (callback) => ipcRenderer.on('news-update', (_, data) => callback(data)),
});
