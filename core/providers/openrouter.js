/* ═══════════════════════════════════════════════════════════════
   ARIA — OpenRouter Provider (FREE + PAID MODELS)
   Supports both free (:free suffix) and paid models.
   User configures mode and model ID in Settings.
   ═══════════════════════════════════════════════════════════════ */

const axios = require('axios');

let apiKey = null;
let currentModel = 'deepseek/deepseek-r1:free';
let isFreeMode = true;

// Known free models on OpenRouter (updated April 2026)
const FREE_MODELS = [
  { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)' },
  { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek Chat V3 (Free)' },
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)' },
  { id: 'google/gemma-3-27b-it:free', name: 'Google Gemma 3 27B (Free)' },
  { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick (Free)' },
  { id: 'meta-llama/llama-4-scout:free', name: 'Llama 4 Scout (Free)' },
  { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B (Free)' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 (Free)' },
  { id: 'microsoft/phi-4-reasoning:free', name: 'Microsoft Phi-4 Reasoning (Free)' },
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free', name: 'Nemotron 70B (Free)' },
];

function init(key, model) {
  const k = (key && key.trim()) ? key.trim() : null;
  if (!k) {
    apiKey = null;
    return false;
  }
  apiKey = k;
  if (model) currentModel = model;
  console.log(`[OpenRouter] Initialized — model: ${currentModel}`);
  return true;
}

function isFreeModel(model) {
  return model && model.endsWith(':free');
}

function getFreeModels() {
  return FREE_MODELS;
}

async function chat(messages, systemPrompt) {
  if (!apiKey) throw new Error('OpenRouter API key not set. Add it in Settings > API Keys.');

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const startTime = Date.now();

  console.log(`[OpenRouter] Calling model: ${currentModel}`);

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: currentModel,
        messages: formattedMessages,
        max_tokens: 2048,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://aria-desktop.local',
          'X-Title': 'ARIA Desktop Agent',
        },
        timeout: 60000,
      }
    );

    const latency = Date.now() - startTime;
    const data = response.data;

    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const text = data.choices?.[0]?.message?.content || '';
    const tokensUsed = data.usage?.total_tokens || 0;

    let toolCall = null;
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith('{') && trimmed.includes('"tool"')) {
        toolCall = JSON.parse(trimmed);
      }
    } catch (e) { /* not a tool call */ }

    return {
      text: toolCall ? '' : text,
      tool_call: toolCall,
      tokens_used: tokensUsed,
      latency,
      provider: 'openrouter',
      model: currentModel
    };
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      const errBody = err.response.data;
      let msg = `OpenRouter ${status}`;
      if (errBody?.error?.message) msg = errBody.error.message;
      else if (typeof errBody === 'string') msg = errBody;

      if (status === 404) {
        msg = `Model "${currentModel}" not found on OpenRouter. Check the model ID in Settings > Providers.`;
      }

      const error = new Error(msg);
      error.status = status;
      throw error;
    }
    throw err;
  }
}

function isAvailable() {
  return apiKey !== null;
}

function setModel(model) {
  currentModel = model;
  console.log(`[OpenRouter] Model changed to: ${model}`);
}

function getModel() {
  return currentModel;
}

module.exports = { init, chat, isAvailable, isFreeModel, getFreeModels, setModel, getModel };
