/* ═══════════════════════════════════════════════════════════════
   ARIA — Google Gemini Provider
   ═══════════════════════════════════════════════════════════════ */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let client = null;
let model = null;
let currentModelName = 'gemini-1.5-flash';

function init(apiKey, modelName) {
  if (!apiKey) return false;
  try {
    client = new GoogleGenerativeAI(apiKey);
    if (modelName) currentModelName = modelName;
    model = client.getGenerativeModel({ model: currentModelName });
    return true;
  } catch (err) {
    console.error('[Gemini] Init error:', err.message);
    return false;
  }
}

async function chat(messages, systemPrompt) {
  if (!model) throw new Error('Gemini client not initialized — missing API key');

  // Gemini uses a different format — build contents array
  const history = [];
  for (const msg of messages.slice(0, -1)) {
    history.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    });
  }

  const lastMessage = messages[messages.length - 1];

  const startTime = Date.now();

  const chatSession = model.startChat({
    history,
    systemInstruction: { parts: [{ text: systemPrompt }] },
  });

  const result = await chatSession.sendMessage(lastMessage.content);
  const latency = Date.now() - startTime;
  const text = result.response.text();

  // Estimate tokens (Gemini doesn't always return usage in the same way)
  const tokensUsed = result.response.usageMetadata?.totalTokenCount ||
    Math.ceil((systemPrompt.length + messages.reduce((a, m) => a + m.content.length, 0) + text.length) / 4);

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
    provider: 'gemini',
    model: currentModelName
  };
}

function isAvailable() {
  return model !== null;
}

module.exports = { init, chat, isAvailable };
