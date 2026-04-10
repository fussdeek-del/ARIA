/* ═══════════════════════════════════════════════════════════════
   ARIA — Router (Tool Call Dispatcher)
   Receives tool calls from brain and routes to the correct agent
   ═══════════════════════════════════════════════════════════════ */

const EventEmitter = require('events');

class Router extends EventEmitter {
  constructor() {
    super();
    this.agents = {};
  }

  /**
   * Register agent modules (will be populated in later phases)
   */
  registerAgents(agents) {
    this.agents = agents;
  }

  /**
   * Route a tool call to the appropriate agent
   */
  async route(toolCall) {
    const { tool, params, reason } = toolCall;

    this.emit('tool-start', { tool, params, reason });
    console.log(`[Router] Executing tool: ${tool}`, params);

    try {
      let result;

      // Route based on tool name
      switch (tool) {
        // Browser tools
        case 'open_browser':
        case 'click_element':
        case 'type_in_browser':
        case 'read_page_content':
        case 'scroll_page':
        case 'new_tab':
          result = await this.callAgent('browser', tool, params);
          break;

        // OS tools
        case 'open_app':
        case 'focus_window':
        case 'type_in_window':
        case 'take_screenshot':
        case 'mouse_click':
          result = await this.callAgent('os', tool, params);
          break;

        // File tools
        case 'read_file':
        case 'write_file':
        case 'append_file':
        case 'delete_file':
        case 'list_directory':
        case 'search_files':
          result = await this.callAgent('files', tool, params);
          break;

        // Messaging tools
        case 'send_whatsapp':
        case 'send_email':
        case 'send_telegram':
        case 'read_whatsapp':
        case 'read_email':
          result = await this.callAgent('messaging', tool, params);
          break;

        // CLI tools
        case 'run_command':
        case 'run_claude_code':
        case 'run_codex':
        case 'run_python':
          result = await this.callAgent('cli', tool, params);
          break;

        // Memory tools
        case 'save_memory':
        case 'search_memory':
        case 'delete_memory':
          result = await this.callAgent('memory', tool, params);
          break;

        // News/Web tools
        case 'fetch_news':
        case 'search_web':
        case 'fetch_url':
          result = await this.callAgent('rag', tool, params);
          break;

        // Analysis tools
        case 'analyze_directory':
        case 'system_info':
          result = await this.callAgent('analyzer', tool, params);
          break;

        default:
          result = { error: `Unknown tool: ${tool}` };
      }

      this.emit('tool-done', { tool, params, result });
      return result;

    } catch (err) {
      const error = { error: err.message };
      this.emit('tool-error', { tool, params, error: err.message });
      return error;
    }
  }

  async callAgent(agentName, tool, params) {
    if (!this.agents[agentName]) {
      return {
        error: `Agent "${agentName}" is not yet implemented. This feature will be available in a future update.`,
        tool,
        status: 'not_implemented'
      };
    }
    return await this.agents[agentName].execute(tool, params);
  }
}

module.exports = new Router();
