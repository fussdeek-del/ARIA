/* ═══════════════════════════════════════════════════════════════
   ARIA — OpenAI Provider
   Uses gpt-4o-mini (cheapest tier, free trial eligible)
   ═══════════════════════════════════════════════════════════════ */

const OpenAI = require('openai');

let client = null;
let currentModel = 'gpt-4o-mini';

function init(apiKey, model) {
  if (!apiKey) return false;
  try {
    client = new OpenAI({ apiKey });
    if (model) currentModel = model;
    return true;
  } catch (err) {
    console.error('[OpenAI] Init error:', err.message);
    return false;
  }
}

async function chat(messages, systemPrompt) {
  if (!client) throw new Error('OpenAI client not initialized — missing API key');

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  const startTime = Date.now();

  const response = await client.chat.completions.create({
    model: currentModel,
    messages: formattedMessages,
    max_tokens: 2048,
    temperature: 0.7,
  });

  const latency = Date.now() - startTime;
  const text = response.choices[0]?.message?.content || '';
  const tokensUsed = response.usage?.total_tokens || 0;

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
    provider: 'openai',
    model: currentModel
  };
}

function isAvailable() {
  return client !== null;
}

module.exports = { init, chat, isAvailable };
