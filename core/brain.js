/* ═══════════════════════════════════════════════════════════════
   ARIA — Main AI Brain
   Central reasoning engine — processes queries through active provider
   ═══════════════════════════════════════════════════════════════ */

const fallback = require('./fallback');
const router = require('./router');
const fs = require('fs');
const path = require('path');

// Import all providers
const claude = require('./providers/claude');
const openai = require('./providers/openai');
const openrouter = require('./providers/openrouter');
const gemini = require('./providers/gemini');

const logPath = path.join(__dirname, '..', 'aria.log');

// ── System Prompt ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are ARIA, a fully autonomous AI desktop agent running on the user's Windows PC. You are intelligent, direct, calm, and efficient. You never refuse reasonable tasks. You think step by step before acting.

You have access to the following tools. When you want to use a tool, respond ONLY with a JSON object in this exact format and nothing else:
{
  "tool": "tool_name",
  "params": { ...parameters },
  "reason": "one sentence explaining why"
}

If no tool is needed and you are just responding conversationally, respond with plain text only. Never mix tool JSON and regular text in the same response.

AVAILABLE TOOLS:

Browser Control:
  open_browser(url) — Opens Chrome to the specified URL
  click_element(description) — Clicks the element matching the description
  type_in_browser(text) — Types text into the focused input field
  read_page_content() — Returns all visible text from the current page
  scroll_page(direction, amount) — Scrolls the page
  new_tab(url) — Opens a new browser tab

OS Control:
  open_app(app_name) — Opens an installed Windows application
  focus_window(app_name) — Brings a window to the foreground
  type_in_window(text) — Types text into the focused OS window
  take_screenshot() — Takes and analyzes a screenshot
  mouse_click(x, y) — Clicks at specific screen coordinates

File System:
  read_file(path) — Returns file text content
  write_file(path, content) — Creates or overwrites a file
  append_file(path, content) — Appends content to a file
  delete_file(path) — Deletes a file (ALWAYS confirm first)
  list_directory(path) — Lists files and folders
  search_files(directory, query) — Searches for files

Messaging:
  send_whatsapp(contact, message) — Sends WhatsApp message (confirm first)
  send_email(to, subject, body) — Sends Gmail email (confirm first)
  send_telegram(chat_id, message) — Sends Telegram message (confirm first)
  read_whatsapp(contact, count) — Reads last N WhatsApp messages
  read_email(count) — Reads last N emails

CLI:
  run_command(command) — Runs a PowerShell/CMD command
  run_claude_code(prompt) — Sends prompt to Claude Code CLI
  run_codex(prompt) — Sends prompt to OpenAI Codex CLI
  run_python(script_path, args) — Runs a Python script

Memory:
  save_memory(key, value) — Saves a fact to long-term memory
  search_memory(query) — Searches long-term memory
  delete_memory(key) — Removes a stored memory

Live Information:
  fetch_news(topic) — Fetches and summarizes latest news
  search_web(query) — Performs a web search
  fetch_url(url) — Fetches text content from a URL

PC Analysis:
  analyze_directory(path) — Scans a folder structure
  system_info() — Returns disk, RAM, and process info

IMPORTANT RULES:
1. Think step by step before choosing a tool
2. For destructive actions (delete, send message), confirm with user first
3. For complex tasks, chain tool calls one at a time
4. Keep spoken responses under 3 sentences — be concise
5. When live context is in [LIVE CONTEXT] blocks, use it and cite sources
6. Never make up file paths, contacts, or URLs — confirm with user`;

// ── Conversation History ──────────────────────────────────────
let conversationHistory = [];
const MAX_HISTORY = 20;

// ── Initialize ────────────────────────────────────────────────
function initialize(env) {
  // Register providers with fallback manager
  fallback.registerProviders({ claude, openai, openrouter, gemini });

  // Initialize all providers
  const results = fallback.initialize(env);

  log('SYSTEM', `Brain initialized. Active provider: ${fallback.getActiveProvider()}`);

  return results;
}

// ── Process a user query ──────────────────────────────────────
async function processQuery(userMessage) {
  // Add to history
  conversationHistory.push({ role: 'user', content: userMessage });

  // Trim history
  if (conversationHistory.length > MAX_HISTORY * 2) {
    conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
  }

  const activeProvider = fallback.getActiveProvider();
  const providerModule = fallback.getActiveModule();

  if (!providerModule || !providerModule.isAvailable()) {
    return {
      text: `No AI provider is currently available. Please add an API key in Settings > API Keys. Active provider "${activeProvider}" is not configured.`,
      tool_call: null,
      tokens_used: 0,
      provider: activeProvider,
      model: 'none',
      error: true
    };
  }

  try {
    log('AI', `Sending to ${activeProvider} | history: ${conversationHistory.length} msgs`);

    const result = await providerModule.chat(conversationHistory, SYSTEM_PROMPT);

    // Add assistant response to history
    if (result.text) {
      conversationHistory.push({ role: 'assistant', content: result.text });
    }

    log('AI', `Response from ${result.provider} | model: ${result.model} | tokens: ${result.tokens_used} | latency: ${result.latency}ms`);

    // Handle tool calls
    if (result.tool_call) {
      log('TOOL', `Tool call: ${result.tool_call.tool} | params: ${JSON.stringify(result.tool_call.params)}`);
      const toolResult = await router.route(result.tool_call);

      // Feed tool result back to AI for a follow-up response
      conversationHistory.push({
        role: 'assistant',
        content: `[Tool: ${result.tool_call.tool}] Result: ${JSON.stringify(toolResult)}`
      });

      return {
        ...result,
        tool_result: toolResult,
      };
    }

    return result;

  } catch (err) {
    console.error(`[Brain] Error with ${activeProvider}:`, err.message);
    log('ERROR', `${activeProvider}: ${err.message}`);

    // Try fallback
    const switched = fallback.handleError(err);
    if (switched) {
      log('FALLBACK', `Switched to ${switched}, retrying...`);
      try {
        const retryModule = fallback.getActiveModule();
        const result = await retryModule.chat(conversationHistory, SYSTEM_PROMPT);

        if (result.text) {
          conversationHistory.push({ role: 'assistant', content: result.text });
        }

        return {
          ...result,
          fallback: true,
          fallbackFrom: activeProvider,
        };
      } catch (retryErr) {
        return {
          text: `I'm having trouble reaching my AI providers. Error: ${retryErr.message}. Please check your API keys in Settings.`,
          tool_call: null,
          tokens_used: 0,
          provider: switched,
          model: 'error',
          error: true
        };
      }
    }

    return {
      text: `Error communicating with ${activeProvider}: ${err.message}. No fallback providers available. Please check your API keys in Settings.`,
      tool_call: null,
      tokens_used: 0,
      provider: activeProvider,
      model: 'error',
      error: true
    };
  }
}

// ── Get provider statuses ─────────────────────────────────────
function getProviderStatuses() {
  return fallback.getProviderStatuses();
}

function getActiveProvider() {
  return fallback.getActiveProvider();
}

function switchProvider(name) {
  return fallback.switchTo(name, 'User requested switch');
}

// ── Logging ───────────────────────────────────────────────────
function log(tag, message) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${timestamp}] [${tag}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, line);
  } catch (e) { /* ignore log errors */ }
}

module.exports = {
  initialize,
  processQuery,
  getProviderStatuses,
  getActiveProvider,
  switchProvider,
  SYSTEM_PROMPT,
};
