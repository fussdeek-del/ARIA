/* ═══════════════════════════════════════════════════════════════
   ARIA — Frontend Application Logic
   Real AI integration, voice recording, TTS playback,
   dynamic provider status, and full UI interactions
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSidebarCollapse();
  initRightTabs();
  initSettingsModal();
  initSettingsTabs();
  initInputBar();
  initPasswordToggles();
  initTTSSlider();
  initNewsItems();
  initChips();
  initFallbackDragDrop();
  initSaveButtons();
  initVoiceRecording();
  initWakeWord();
  loadMockData();
  loadProviderStatuses();
  listenForEvents();
  showWelcomeDemo();
});

/* ═══════════════════════════════════════════════════════════════
   VOICE RECORDING — MediaRecorder + Whisper API
   ═══════════════════════════════════════════════════════════════ */

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

function initVoiceRecording() {
  // Request mic permission early
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      // Release the stream - we'll get a fresh one when recording
      stream.getTracks().forEach(t => t.stop());
      console.log('[Voice] Microphone access granted');
    })
    .catch(err => {
      console.warn('[Voice] Microphone access denied:', err.message);
      showToast('Microphone access denied — voice features disabled', 'warning');
    });
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      }
    });

    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop all tracks
      stream.getTracks().forEach(t => t.stop());

      if (audioChunks.length === 0) return;

      // Combine chunks into a blob
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Update status
      setMicStatus('processing');

      try {
        // Send to Whisper via main process
        const result = await window.aria.transcribeAudio(Array.from(uint8Array), 'webm');

        if (result.error) {
          showToast(`Voice error: ${result.error}`, 'error');
          setMicStatus('idle');
          return;
        }

        if (result.text && result.text.trim()) {
          // Put transcription in input and send
          document.getElementById('user-input').value = result.text;
          sendMessage();
        } else {
          showToast('Could not understand audio — please try again', 'warning');
          setMicStatus('idle');
        }
      } catch (err) {
        showToast(`Transcription failed: ${err.message}`, 'error');
        setMicStatus('idle');
      }
    };

    mediaRecorder.start(250); // Collect data every 250ms
    isRecording = true;
    setMicStatus('listening');

  } catch (err) {
    console.error('[Voice] Recording error:', err);
    showToast(`Microphone error: ${err.message}`, 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
}

function setMicStatus(status) {
  const micStatus = document.getElementById('mic-status');
  const micBtn = document.getElementById('btn-mic');

  micStatus.className = `mic-status mic-status--${status}`;
  micStatus.querySelector('.mic-label').textContent = status.toUpperCase();

  if (status === 'listening') {
    micBtn.classList.add('recording');
  } else {
    micBtn.classList.remove('recording');
  }
}

/* ═══════════════════════════════════════════════════════════════
   WAKE WORD — Uses Web Speech API (free, built-in)
   ═══════════════════════════════════════════════════════════════ */

let wakeWordRecognition = null;
let wakeWordEnabled = true;

function initWakeWord() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('[WakeWord] Web Speech API not available');
    return;
  }

  wakeWordRecognition = new SpeechRecognition();
  wakeWordRecognition.continuous = true;
  wakeWordRecognition.interimResults = true;
  wakeWordRecognition.lang = 'en-US';
  wakeWordRecognition.maxAlternatives = 3;

  wakeWordRecognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.toLowerCase().trim();
      // Check all alternatives for wake phrase
      for (let j = 0; j < event.results[i].length; j++) {
        const alt = event.results[i][j].transcript.toLowerCase().trim();
        if (alt.includes('hey aria') || alt.includes('hey arya') ||
            alt.includes('hey area') || alt.includes('a aria') ||
            alt.includes('hey ari')) {
          console.log('[WakeWord] Detected! Transcript:', alt);
          // Stop wake word listening, start full recording
          stopWakeWord();
          showToast('Wake word detected — listening...', 'info');
          startRecording();

          // Auto-stop after 10 seconds of recording
          setTimeout(() => {
            if (isRecording) {
              stopRecording();
              // Restart wake word after processing
              setTimeout(() => startWakeWord(), 3000);
            }
          }, 10000);
          return;
        }
      }
    }
  };

  wakeWordRecognition.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.warn('[WakeWord] Error:', event.error);
    }
  };

  wakeWordRecognition.onend = () => {
    // Restart if still enabled
    if (wakeWordEnabled && !isRecording) {
      try {
        wakeWordRecognition.start();
      } catch (e) { /* already started */ }
    }
  };

  startWakeWord();
}

function startWakeWord() {
  if (!wakeWordRecognition || !wakeWordEnabled) return;
  try {
    wakeWordRecognition.start();
    console.log('[WakeWord] Listening for "Hey ARIA"...');
  } catch (e) { /* already started */ }
}

function stopWakeWord() {
  if (!wakeWordRecognition) return;
  try {
    wakeWordRecognition.stop();
  } catch (e) { /* already stopped */ }
}

/* ═══════════════════════════════════════════════════════════════
   TTS — Play AI responses via ElevenLabs
   ═══════════════════════════════════════════════════════════════ */

async function speakResponse(text) {
  if (!window.aria?.synthesizeSpeech) return;

  try {
    setMicStatus('speaking');
    showWaveform();

    const result = await window.aria.synthesizeSpeech(text);

    if (result.error) {
      console.warn('[TTS] Error:', result.error);
      hideWaveform();
      setMicStatus('idle');
      return;
    }

    // Decode base64 audio and play
    const audioBytes = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
    const audioBlob = new Blob([audioBytes], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    audio.onended = () => {
      hideWaveform();
      setMicStatus('idle');
      URL.revokeObjectURL(audioUrl);
      // Restart wake word after speaking
      if (wakeWordEnabled) startWakeWord();
    };

    audio.onerror = () => {
      hideWaveform();
      setMicStatus('idle');
      URL.revokeObjectURL(audioUrl);
    };

    await audio.play();
  } catch (err) {
    console.error('[TTS] Playback error:', err);
    hideWaveform();
    setMicStatus('idle');
  }
}

/* ═══════════════════════════════════════════════════════════════
   PROVIDER STATUS — Dynamic, reads from backend
   ═══════════════════════════════════════════════════════════════ */

async function loadProviderStatuses() {
  if (!window.aria?.getSystemStatus) return;

  try {
    const status = await window.aria.getSystemStatus();
    updateProviderDisplay(status);
  } catch (err) {
    console.warn('[Status] Could not load provider statuses:', err);
  }
}

function updateProviderDisplay(status) {
  if (!status) return;

  // Update top bar provider name
  const topProvider = document.getElementById('top-provider-name');
  const activeProviderMap = {
    claude: 'Claude Sonnet 4.5',
    openai: 'GPT-4o Mini',
    openrouter: 'OpenRouter (Free)',
    gemini: 'Gemini 1.5 Flash',
  };
  topProvider.textContent = activeProviderMap[status.activeProvider] || status.activeProvider;

  // Update left sidebar badge
  const badgeName = document.querySelector('.provider-badge__name');
  if (badgeName) badgeName.textContent = activeProviderMap[status.activeProvider] || status.activeProvider;

  // Update provider dot color
  const providerDot = document.querySelector('.provider-dot');
  const anyAvailable = Object.values(status.providers).some(p => p.available);
  if (providerDot) {
    providerDot.style.background = anyAvailable ? 'var(--accent)' : 'var(--error)';
    providerDot.style.boxShadow = anyAvailable ? '0 0 8px var(--accent)' : '0 0 8px var(--error)';
  }

  // Update settings modal provider cards
  updateProviderCards(status.providers);
}

async function updateProviderCards(providers) {
  // Update Radio Buttons
  const radios = document.querySelectorAll('input[name="active-provider"]');
  radios.forEach(radio => {
    const providerName = radio.value;
    if (providers[providerName] && providers[providerName].active) {
      radio.checked = true;
    }
  });

  // Pre-fill model config fields if available
  if (window.aria?.loadSettings) {
    try {
      const settings = await window.aria.loadSettings();
      if (settings && settings.providers) {
        Object.keys(settings.providers).forEach(p => {
           const modelInput = document.getElementById(`model-${p}`);
           if (modelInput && settings.providers[p].model) {
             modelInput.value = settings.providers[p].model;
           }
        });
      }
    } catch(e) { console.warn('Could not load settings for inputs', e); }
  }
}

/* ═══════════════════════════════════════════════════════════════
   EVENT LISTENERS FROM MAIN PROCESS
   ═══════════════════════════════════════════════════════════════ */

function listenForEvents() {
  if (!window.aria) return;

  // Provider switch notifications
  if (window.aria.onProviderSwitch) {
    window.aria.onProviderSwitch((data) => {
      const names = {
        claude: 'Claude', openai: 'OpenAI', openrouter: 'OpenRouter', gemini: 'Gemini'
      };
      showToast(`Switched to ${names[data.to] || data.to} — ${data.reason}`, 'warning');
      loadProviderStatuses();
    });
  }

  // Tool activity
  if (window.aria.onToolActivity) {
    window.aria.onToolActivity((data) => {
      addToolEntry(data.tool, JSON.stringify(data.params || {}).slice(0, 60), data.status);
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════ */

function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('nav-btn--active'));
      btn.classList.add('nav-btn--active');

      const panel = btn.dataset.panel;
      if (panel === 'settings') {
        openSettings();
      } else if (panel === 'memory') {
        switchRightTab('memory');
      } else if (panel === 'news') {
        switchRightTab('news');
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR COLLAPSE / EXPAND
   ═══════════════════════════════════════════════════════════════ */

function initSidebarCollapse() {
  const leftSidebar = document.getElementById('left-sidebar');
  const rightSidebar = document.getElementById('right-sidebar');
  const btnCollapseLeft = document.getElementById('btn-collapse-left');
  const btnCollapseRight = document.getElementById('btn-collapse-right');
  const btnExpandLeft = document.getElementById('btn-expand-left');
  const btnExpandRight = document.getElementById('btn-expand-right');

  btnCollapseLeft.addEventListener('click', () => {
    leftSidebar.classList.add('collapsed');
    btnExpandLeft.classList.remove('hidden');
  });
  btnExpandLeft.addEventListener('click', () => {
    leftSidebar.classList.remove('collapsed');
    btnExpandLeft.classList.add('hidden');
  });
  btnCollapseRight.addEventListener('click', () => {
    rightSidebar.classList.add('collapsed');
    btnExpandRight.classList.remove('hidden');
  });
  btnExpandRight.addEventListener('click', () => {
    rightSidebar.classList.remove('collapsed');
    btnExpandRight.classList.add('hidden');
  });
}

/* ═══════════════════════════════════════════════════════════════
   RIGHT SIDEBAR TABS
   ═══════════════════════════════════════════════════════════════ */

function initRightTabs() {
  const tabs = document.querySelectorAll('.right-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchRightTab(tab.dataset.tab));
  });
}

function switchRightTab(tabName) {
  document.querySelectorAll('.right-tab').forEach(t => t.classList.remove('right-tab--active'));
  document.querySelectorAll('.right-panel').forEach(p => p.classList.remove('right-panel--active'));

  const activeTab = document.querySelector(`.right-tab[data-tab="${tabName}"]`);
  const activePanel = document.getElementById(`tab-${tabName}`);
  if (activeTab) activeTab.classList.add('right-tab--active');
  if (activePanel) activePanel.classList.add('right-panel--active');

  const rightSidebar = document.getElementById('right-sidebar');
  const btnExpandRight = document.getElementById('btn-expand-right');
  if (rightSidebar.classList.contains('collapsed')) {
    rightSidebar.classList.remove('collapsed');
    btnExpandRight.classList.add('hidden');
  }
}

/* ═══════════════════════════════════════════════════════════════
   SETTINGS MODAL
   ═══════════════════════════════════════════════════════════════ */

function initSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const btnClose = document.getElementById('btn-close-settings');
  const backdrop = modal.querySelector('.modal__backdrop');

  btnClose.addEventListener('click', closeSettings);
  backdrop.addEventListener('click', closeSettings);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeSettings();
  });
}

function openSettings() {
  document.getElementById('settings-modal').classList.remove('hidden');
  loadProviderStatuses(); // Refresh status when opening settings
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function initSettingsTabs() {
  const tabs = document.querySelectorAll('.settings-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('settings-tab--active'));
      tab.classList.add('settings-tab--active');

      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('settings-panel--active'));
      const targetPanel = document.getElementById(`settings-${tab.dataset.settingsTab}`);
      if (targetPanel) targetPanel.classList.add('settings-panel--active');
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   SAVE BUTTONS — API Keys & Settings
   ═══════════════════════════════════════════════════════════════ */

function initSaveButtons() {
  // Save Providers & Keys
  const btnSaveProviders = document.getElementById('btn-save-providers');
  if (btnSaveProviders) {
    btnSaveProviders.addEventListener('click', async () => {
      // 1. Gather API Keys
      const keys = {
        ANTHROPIC_API_KEY: document.getElementById('key-anthropic')?.value.trim(),
        OPENAI_API_KEY: document.getElementById('key-openai')?.value.trim(),
        OPENROUTER_API_KEY: document.getElementById('key-openrouter')?.value.trim(),
        GEMINI_API_KEY: document.getElementById('key-gemini')?.value.trim(),
      };
      
      const nonEmptyKeys = {};
      Object.entries(keys).forEach(([k, v]) => {
        if (v) nonEmptyKeys[k] = v;
      });
      
      if (Object.keys(nonEmptyKeys).length > 0) {
        try {
          const result = await window.aria.saveApiKeys(nonEmptyKeys);
          if (!result.success) showToast(`Failed to save keys: ${result.error}`, 'error');
        } catch (err) {
          showToast(`Error saving keys: ${err.message}`, 'error');
        }
      }

      // 2. Gather Model IDs & Provider Switch
      const activeRadio = document.querySelector('input[name="active-provider"]:checked');
      if (activeRadio) {
        const providerId = activeRadio.value;
        const modelInput = document.getElementById(`model-${providerId}`);
        
        if (modelInput && modelInput.value.trim() && window.aria.loadSettings && window.aria.saveSettings) {
           try {
             // Save model exactly as typed for any provider
             const currentSettings = await window.aria.loadSettings();
             if (currentSettings && currentSettings.providers[providerId]) {
                currentSettings.providers[providerId].model = modelInput.value.trim();
                await window.aria.saveSettings(currentSettings);
             }
           } catch(e) { console.error('Save config error:', e); }
        }
        
        // Also fire switch provider so brain re-inits
        if (window.aria.switchProvider) {
          await window.aria.switchProvider(providerId);
        }
        
        showToast(`Saved settings for ${providerId} and set as Active Provider`, 'success');
        loadProviderStatuses();
      } else {
        showToast('Please select an active provider', 'warning');
      }
    });
  }

  // Save Voice Settings
  const btnSaveVoice = document.getElementById('btn-save-voice');
  if (btnSaveVoice) {
    btnSaveVoice.addEventListener('click', async () => {
      const keys = {
        OPENAI_API_KEY: document.getElementById('key-openai-voice')?.value.trim(),
        ELEVENLABS_API_KEY: document.getElementById('key-elevenlabs')?.value.trim(),
        ELEVENLABS_VOICE_ID: document.getElementById('key-elevenlabs-voice')?.value.trim()
      };
      const nonEmptyKeys = {};
      Object.entries(keys).forEach(([k, v]) => {
        if (v) nonEmptyKeys[k] = v;
      });
      if (Object.keys(nonEmptyKeys).length > 0) {
        await window.aria.saveApiKeys(nonEmptyKeys);
        showToast('Voice setup saved successfully!', 'success');
      } else {
        showToast('No keys changed', 'warning');
      }
    });
  }

  // Test Voice
  const btnTestVoice = document.getElementById('btn-test-voice');
  if (btnTestVoice) {
    btnTestVoice.addEventListener('click', async () => {
      showToast('Testing voice output...', 'info');
      await speakResponse('Hello! I am ARIA, your autonomous reasoning intelligence agent. My voice is working correctly.');
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   INPUT BAR — Send Messages (REAL AI)
   ═══════════════════════════════════════════════════════════════ */

function initInputBar() {
  const input = document.getElementById('user-input');
  const btnSend = document.getElementById('btn-send');
  const btnMic = document.getElementById('btn-mic');

  btnSend.addEventListener('click', () => sendMessage());

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Push-to-talk toggle
  btnMic.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    } else {
      // Stop wake word while recording
      stopWakeWord();
      startRecording();
      // Auto-stop after 15 seconds
      setTimeout(() => {
        if (isRecording) {
          stopRecording();
          setTimeout(() => startWakeWord(), 3000);
        }
      }, 15000);
    }
  });

  // Ctrl+Space shortcut
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      btnMic.click();
    }
  });
}

async function sendMessage() {
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  // Hide welcome message
  const welcome = document.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  // Add user message
  addMessage('user', text);
  showTypingIndicator();
  addToolEntry('brain.process', `query: "${text.substring(0, 50)}..."`, 'running');

  try {
    // REAL AI call
    const result = await window.aria.sendCommand(text);

    removeTypingIndicator();
    updateLastToolEntry('done');

    const responseText = result.text || 'No response from AI.';
    const provider = result.provider || 'unknown';
    const model = result.model || '';
    const tokens = result.tokens_used || 0;

    const displayProvider = {
      claude: 'Claude Sonnet 4.5',
      openai: 'GPT-4o Mini',
      openrouter: 'OpenRouter (Free)',
      gemini: 'Gemini 1.5 Flash',
    };

    addMessage('aria', responseText, {
      provider: displayProvider[provider] || provider,
      tokens,
      sources: null
    });

    // If there was a fallback
    if (result.fallback) {
      showToast(`Switched from ${result.fallbackFrom} to ${provider}`, 'warning');
    }

    // If there was a tool call
    if (result.tool_call) {
      addToolEntry(result.tool_call.tool, JSON.stringify(result.tool_call.params || {}).slice(0, 60), 'done');
    }

    // Speak the response via TTS
    speakResponse(responseText);

  } catch (err) {
    removeTypingIndicator();
    updateLastToolEntry('error');
    addMessage('aria', `Error: ${err.message}. Please check your API keys in Settings.`, {
      provider: 'Error',
      tokens: 0,
    });
    setMicStatus('idle');
  }
}

/* ═══════════════════════════════════════════════════════════════
   MESSAGE RENDERING
   ═══════════════════════════════════════════════════════════════ */

function addMessage(role, text, meta = {}) {
  const feed = document.getElementById('conversation-feed');

  const msg = document.createElement('div');
  msg.className = `message message--${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message__avatar';
  avatar.textContent = role === 'user' ? 'U' : 'A';

  const content = document.createElement('div');
  content.className = 'message__content';

  const bubble = document.createElement('div');
  bubble.className = 'message__bubble';
  bubble.textContent = text;
  content.appendChild(bubble);

  if (role === 'aria' && meta.provider) {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message__meta';
    metaDiv.innerHTML = `
      <span class="message__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        ${meta.provider}
      </span>
      <span class="message__meta-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        ${meta.tokens} tokens
      </span>
      <span class="message__meta-item">
        ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    `;
    content.appendChild(metaDiv);
  }

  if (meta.sources && meta.sources.length > 0) {
    const sourcesDiv = document.createElement('div');
    sourcesDiv.className = 'message__sources';
    meta.sources.forEach(src => {
      const chip = document.createElement('span');
      chip.className = 'source-chip';
      chip.innerHTML = `📎 ${src.name} <span style="opacity:0.6">· View Source</span>`;
      chip.title = src.url;
      sourcesDiv.appendChild(chip);
    });
    content.appendChild(sourcesDiv);
  }

  msg.appendChild(avatar);
  msg.appendChild(content);
  feed.appendChild(msg);
  feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
}

function showTypingIndicator() {
  const feed = document.getElementById('conversation-feed');
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'message__avatar';
  avatar.style.cssText = 'background: linear-gradient(135deg, var(--accent), var(--accent2)); color: var(--bg); font-weight: 700; font-size: 13px;';
  avatar.textContent = 'A';

  const dots = document.createElement('div');
  dots.className = 'typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';

  indicator.appendChild(avatar);
  indicator.appendChild(dots);
  feed.appendChild(indicator);
  feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
}

function removeTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (indicator) indicator.remove();
}

/* ═══════════════════════════════════════════════════════════════
   WAVEFORM
   ═══════════════════════════════════════════════════════════════ */

function showWaveform() {
  document.getElementById('waveform-bar').classList.remove('hidden');
}

function hideWaveform() {
  document.getElementById('waveform-bar').classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════════════
   TOOL ACTIVITY LOG
   ═══════════════════════════════════════════════════════════════ */

function addToolEntry(name, params, status) {
  const log = document.getElementById('tool-log');
  const entry = document.createElement('div');
  entry.className = `tool-entry tool-entry--${status}`;
  entry.innerHTML = `
    <div class="tool-entry__header">
      <span class="tool-entry__name">${name}</span>
      <span class="tool-entry__status">${status}</span>
    </div>
    <div class="tool-entry__params">${params}</div>
  `;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function updateLastToolEntry(status) {
  const entries = document.querySelectorAll('.tool-entry');
  const last = entries[entries.length - 1];
  if (last) {
    last.className = `tool-entry tool-entry--${status}`;
    last.querySelector('.tool-entry__status').textContent = status;
  }
}

/* ═══════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════ */

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/* ═══════════════════════════════════════════════════════════════
   PASSWORD TOGGLES & SLIDER
   ═══════════════════════════════════════════════════════════════ */

function initPasswordToggles() {
  document.querySelectorAll('.settings-toggle-vis').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
  });
}

function initTTSSlider() {
  const slider = document.getElementById('tts-speed');
  const value = document.getElementById('tts-speed-value');
  if (slider && value) {
    slider.addEventListener('input', () => {
      value.textContent = `${parseFloat(slider.value).toFixed(1)}x`;
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   NEWS & CHIPS
   ═══════════════════════════════════════════════════════════════ */

function initNewsItems() {
  document.addEventListener('click', (e) => {
    const item = e.target.closest('.news-item');
    if (item) item.classList.toggle('expanded');
  });
}

function initChips() {
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('user-input').value = chip.dataset.prompt;
      document.getElementById('user-input').focus();
    });
  });
}

/* ═══════════════════════════════════════════════════════════════
   FALLBACK DRAG & DROP
   ═══════════════════════════════════════════════════════════════ */

function initFallbackDragDrop() {
  const list = document.getElementById('fallback-order');
  if (!list) return;
  let dragItem = null;

  list.addEventListener('dragstart', (e) => {
    dragItem = e.target.closest('.fallback-item');
    if (dragItem) {
      dragItem.style.opacity = '0.5';
      e.dataTransfer.effectAllowed = 'move';
    }
  });

  list.addEventListener('dragend', () => {
    if (dragItem) {
      dragItem.style.opacity = '1';
      dragItem = null;
      list.querySelectorAll('.fallback-item').forEach((item, i) => {
        const text = item.querySelector('span:last-child');
        const name = item.dataset.provider;
        text.textContent = `${i + 1}. ${name.charAt(0).toUpperCase() + name.slice(1)}`;
      });
    }
  });

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const afterEl = getDragAfterElement(list, e.clientY);
    if (dragItem) {
      afterEl ? list.insertBefore(dragItem, afterEl) : list.appendChild(dragItem);
    }
  });
}

function getDragAfterElement(container, y) {
  const elements = [...container.querySelectorAll('.fallback-item:not([style*="opacity: 0.5"])')];
  return elements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/* ═══════════════════════════════════════════════════════════════
   MOCK DATA (for Memory & News — will be replaced later)
   ═══════════════════════════════════════════════════════════════ */

function loadMockData() {
  loadMockToolLog();
  loadMockMemory();
  loadMockNews();
}

function loadMockToolLog() {
  const entries = [
    { name: 'brain.initialize', params: 'loading providers...', status: 'done' },
    { name: 'voice.init', params: 'wake word: "hey aria"', status: 'done' },
  ];
  entries.forEach(e => addToolEntry(e.name, e.params, e.status));
}

function loadMockMemory() {
  const memories = [
    { key: 'project_folder', value: 'C:/Users/Projects/aria' },
    { key: 'preferred_browser', value: 'Chrome' },
    { key: 'code_editor', value: 'VS Code' },
  ];

  const list = document.getElementById('memory-list');
  memories.forEach(mem => {
    const entry = document.createElement('div');
    entry.className = 'memory-entry';
    entry.innerHTML = `
      <div class="memory-entry__content">
        <span class="memory-entry__key">${mem.key}</span>
        <span class="memory-entry__value">${mem.value}</span>
      </div>
      <button class="memory-entry__delete" title="Delete memory">✕</button>
    `;
    list.appendChild(entry);
  });

  list.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.memory-entry__delete');
    if (deleteBtn) {
      const entry = deleteBtn.closest('.memory-entry');
      entry.style.opacity = '0';
      entry.style.transform = 'translateX(20px)';
      setTimeout(() => entry.remove(), 200);
      showToast('Memory entry deleted', 'info');
    }
  });
}

function loadMockNews() {
  const news = [
    { headline: 'OpenAI Announces GPT-5 with Unprecedented Reasoning', source: 'TechCrunch', time: '23m ago', summary: 'OpenAI has unveiled GPT-5 with major reasoning improvements and 40% benchmark gains.' },
    { headline: 'Google DeepMind Breakthrough in Protein Design with AI', source: 'Nature', time: '1h ago', summary: 'New AI system can design novel proteins from scratch for drug discovery.' },
    { headline: 'EU Passes Comprehensive AI Safety Regulation', source: 'Reuters', time: '2h ago', summary: 'European Parliament approved sweeping AI regulations requiring transparency and oversight.' },
    { headline: 'NVIDIA Reports Record Revenue from AI Chip Demand', source: 'Bloomberg', time: '6h ago', summary: 'NVIDIA posted $35 billion quarterly revenue driven by H100 and B200 AI chips.' },
  ];

  const feed = document.getElementById('news-feed');
  news.forEach(item => {
    const el = document.createElement('div');
    el.className = 'news-item';
    el.innerHTML = `
      <div class="news-item__headline">${item.headline}</div>
      <div class="news-item__meta">
        <span class="news-item__source">${item.source}</span>
        <span class="news-item__time">${item.time}</span>
      </div>
      <div class="news-item__summary">${item.summary}</div>
    `;
    feed.appendChild(el);
  });
}

/* ═══════════════════════════════════════════════════════════════
   WELCOME DEMO
   ═══════════════════════════════════════════════════════════════ */

function showWelcomeDemo() {
  setTimeout(() => showToast('ARIA v1.0.0 — systems online', 'success'), 1500);
}
