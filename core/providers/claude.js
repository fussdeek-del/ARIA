/* ═══════════════════════════════════════════════════════════════
   ARIA — Claude Provider (Anthropic)
   ═══════════════════════════════════════════════════════════════ */

const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function init(apiKey) {
  if (!apiKey) return false;
  try {
    client = new Anthropic({ apiKey });
    return true;
  } catch (err) {
    console.error('[Claude] Init error:', err.message);
    return false;
  }
}

async function chat(messages, systemPrompt) {
  if (!client) throw new Error('Claude client not initialized — missing API key');

  const formattedMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content
  }));

  const startTime = Date.now();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: formattedMessages,
  });

  const latency = Date.now() - startTime;
  const text = response.content[0]?.text || '';
  const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

  // Try to parse tool call from response
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
    provider: 'claude',
    model: 'claude-sonnet-4-5'
  };
}

function isAvailable() {
  return client !== null;
}

module.exports = { init, chat, isAvailable };
