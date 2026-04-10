/* ═══════════════════════════════════════════════════════════════
   ARIA — Fallback Manager
   Auto-switches AI providers on failure (429/402/error)
   ═══════════════════════════════════════════════════════════════ */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class FallbackManager extends EventEmitter {
  constructor() {
    super();
    this.providers = {};
    this.fallbackOrder = ['claude', 'openai', 'openrouter', 'gemini'];
    this.activeProvider = 'openrouter'; // Default to free provider
    this.configPath = path.join(__dirname, '..', 'settings', 'config.json');
  }

  /**
   * Register all provider modules
   */
  registerProviders(providers) {
    this.providers = providers;
  }

  /**
   * Load config and initialize providers with API keys
   */
  initialize(env) {
    // Load config
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      this.activeProvider = config.activeProvider || 'openrouter';
      this.fallbackOrder = config.fallbackOrder || this.fallbackOrder;
    } catch (e) {
      console.log('[Fallback] No config found, using defaults');
    }

    // Initialize each provider with its API key
    const initResults = {};

    if (env.ANTHROPIC_API_KEY) {
      initResults.claude = this.providers.claude?.init(env.ANTHROPIC_API_KEY);
    }
    if (env.OPENAI_API_KEY) {
      initResults.openai = this.providers.openai?.init(env.OPENAI_API_KEY, 'gpt-4o-mini');
    }
    if (env.OPENROUTER_API_KEY) {
      initResults.openrouter = this.providers.openrouter?.init(env.OPENROUTER_API_KEY);
    }
    if (env.GEMINI_API_KEY) {
      initResults.gemini = this.providers.gemini?.init(env.GEMINI_API_KEY);
    }

    console.log('[Fallback] Provider init results:', initResults);

    // If active provider isn't available, switch to first available
    if (!this.isProviderAvailable(this.activeProvider)) {
      const available = this.findNextAvailable(this.activeProvider);
      if (available) {
        this.switchTo(available, 'Active provider not configured');
      }
    }

    return initResults;
  }

  /**
   * Get current active provider name
   */
  getActiveProvider() {
    return this.activeProvider;
  }

  /**
   * Get the provider module for the active provider
   */
  getActiveModule() {
    return this.providers[this.activeProvider];
  }

  /**
   * Check if a provider has a valid API key and is initialized
   */
  isProviderAvailable(name) {
    return this.providers[name]?.isAvailable() ?? false;
  }

  /**
   * Get status of all providers
   */
  getProviderStatuses() {
    const statuses = {};
    for (const name of ['claude', 'openai', 'openrouter', 'gemini']) {
      statuses[name] = {
        available: this.isProviderAvailable(name),
        active: name === this.activeProvider,
      };
    }
    return statuses;
  }

  /**
   * Find next available provider in fallback order
   */
  findNextAvailable(current) {
    const idx = this.fallbackOrder.indexOf(current);
    for (let i = 1; i <= this.fallbackOrder.length; i++) {
      const nextIdx = (idx + i) % this.fallbackOrder.length;
      const nextProvider = this.fallbackOrder[nextIdx];
      if (this.isProviderAvailable(nextProvider)) {
        return nextProvider;
      }
    }
    return null;
  }

  /**
   * Switch to a specific provider
   */
  switchTo(providerName, reason = '') {
    const old = this.activeProvider;
    this.activeProvider = providerName;

    // Update config file
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
      config.activeProvider = providerName;
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (e) {
      console.error('[Fallback] Could not update config:', e.message);
    }

    console.log(`[Fallback] Switched from ${old} to ${providerName}: ${reason}`);
    this.emit('provider-switch', {
      from: old,
      to: providerName,
      reason,
    });

    return providerName;
  }

  /**
   * Handle provider error — auto-switch if rate limit or credits issue
   */
  handleError(error) {
    const status = error.status || error.response?.status;

    if (status === 429 || status === 402 || status === 503) {
      const next = this.findNextAvailable(this.activeProvider);
      if (next) {
        const reasonMap = {
          429: 'Rate limited',
          402: 'No credits remaining',
          503: 'Provider unavailable',
        };
        return this.switchTo(next, `${reasonMap[status] || 'Error'} on ${this.activeProvider}`);
      }
    }

    return null; // No fallback available
  }
}

module.exports = new FallbackManager();
