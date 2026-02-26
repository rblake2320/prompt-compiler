/**
 * Resilience layer for Prompt Compiler.
 *
 * Classifies API errors, builds fallback chains from configured providers,
 * and wraps API calls with retry + automatic model fallback.
 *
 * Error flow:
 *   callRouted() fails → classify error → retry if transient → try fallback providers
 *   Each attempt emits status via onStatus callback so the UI can show progress.
 */

import { getSettings, PROVIDER_CONFIGS } from './settings.js';
import { resolveRoute, getRouterConfig } from './router.js';

// ─── Error Classification ─────────────────────────────────────────

export const ERROR_TYPES = {
  AUTH:         'auth',          // 401/403 — bad key, try different provider
  RATE_LIMIT:   'rate_limit',    // 429 — backoff then fallback
  OVERLOADED:   'overloaded',    // 529/503 — server busy, retry then fallback
  SERVER:       'server',        // 500/502 — server error, retry once
  CONTEXT_LEN:  'context_length',// 400 with context/token msg — try smaller model
  NETWORK:      'network',       // fetch failed — retry
  STREAM:       'stream',        // stream interrupted mid-response
  BAD_RESPONSE: 'bad_response',  // JSON parse failure, empty response
  UNKNOWN:      'unknown',
};

export function classifyError(error) {
  const msg = (error?.message || '').toLowerCase();
  const status = extractStatus(msg);

  if (status === 401 || status === 403 || msg.includes('invalid api key') || msg.includes('authentication'))
    return { type: ERROR_TYPES.AUTH, retryable: false, fallbackable: true, status };

  if (status === 429 || msg.includes('rate limit') || msg.includes('too many requests'))
    return { type: ERROR_TYPES.RATE_LIMIT, retryable: true, fallbackable: true, status, backoff: true };

  if (status === 529 || status === 503 || msg.includes('overloaded') || msg.includes('capacity'))
    return { type: ERROR_TYPES.OVERLOADED, retryable: true, fallbackable: true, status, backoff: true };

  if (status === 500 || status === 502)
    return { type: ERROR_TYPES.SERVER, retryable: true, fallbackable: true, status };

  if (msg.includes('context') || msg.includes('token') || msg.includes('too long') || msg.includes('maximum'))
    return { type: ERROR_TYPES.CONTEXT_LEN, retryable: false, fallbackable: true, status };

  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('timeout'))
    return { type: ERROR_TYPES.NETWORK, retryable: true, fallbackable: true, status };

  if (msg.includes('stream') || msg.includes('aborted') || error?.name === 'AbortError')
    return { type: ERROR_TYPES.STREAM, retryable: false, fallbackable: false, status };

  if (msg.includes('json parse') || msg.includes('no json') || msg.includes('empty'))
    return { type: ERROR_TYPES.BAD_RESPONSE, retryable: true, fallbackable: true, status };

  return { type: ERROR_TYPES.UNKNOWN, retryable: true, fallbackable: true, status };
}

function extractStatus(msg) {
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  return m ? parseInt(m[1]) : null;
}

// ─── Human-Readable Error Messages ───────────────────────────────

export function friendlyError(classification, provider, model) {
  const tag = `${PROVIDER_CONFIGS[provider]?.name || provider} (${model})`;
  switch (classification.type) {
    case ERROR_TYPES.AUTH:
      return `Authentication failed for ${tag}. Check your API key in Settings.`;
    case ERROR_TYPES.RATE_LIMIT:
      return `Rate limited by ${tag}. Waiting before retry…`;
    case ERROR_TYPES.OVERLOADED:
      return `${tag} is overloaded. Trying alternate model…`;
    case ERROR_TYPES.SERVER:
      return `Server error from ${tag}. Retrying…`;
    case ERROR_TYPES.CONTEXT_LEN:
      return `Input too long for ${tag}. Trying a model with a larger context window…`;
    case ERROR_TYPES.NETWORK:
      return `Network error reaching ${tag}. Check your connection.`;
    case ERROR_TYPES.BAD_RESPONSE:
      return `Invalid response from ${tag}. Retrying…`;
    default:
      return `Error from ${tag}. Trying fallback…`;
  }
}

// ─── Fallback Chain Builder ──────────────────────────────────────

/**
 * Builds an ordered list of { provider, model, apiKey } to try.
 *
 * Order:
 *   1. The routed provider/model (already tried — skip if retrying)
 *   2. Same provider, smaller model (for context_length errors)
 *   3. Default provider (if different from routed)
 *   4. All other providers that have API keys configured
 */
export function buildFallbackChain(taskType, failedProvider, failedModel, errorType) {
  const mainSettings = getSettings();
  const chain = [];
  const seen = new Set();
  const key = (p, m) => `${p}:${m}`;

  // Helper: add a candidate if not already tried
  const add = (provider, model, apiKey) => {
    const k = key(provider, model);
    if (seen.has(k)) return;
    if (!PROVIDER_CONFIGS[provider]) return;
    seen.add(k);
    chain.push({ provider, model, apiKey: apiKey || mainSettings.apiKey });
  };

  // Skip the failed combo
  seen.add(key(failedProvider, failedModel));

  // 1. Same provider, smaller models (useful for context_length errors)
  if (errorType === ERROR_TYPES.CONTEXT_LEN) {
    const config = PROVIDER_CONFIGS[failedProvider];
    if (config) {
      const modelIdx = config.models.indexOf(failedModel);
      // Try models after the current one (typically smaller/faster)
      for (let i = modelIdx + 1; i < config.models.length; i++) {
        add(failedProvider, config.models[i], mainSettings.apiKey);
      }
    }
  }

  // 2. Default provider with its default model (if different)
  if (mainSettings.provider !== failedProvider) {
    const defaultConfig = PROVIDER_CONFIGS[mainSettings.provider];
    if (defaultConfig) {
      add(mainSettings.provider, mainSettings.model || defaultConfig.defaultModel, mainSettings.apiKey);
    }
  }

  // 3. All other providers — check router config for any that have keys set
  const routes = getRouterConfig();
  for (const [providerKey, config] of Object.entries(PROVIDER_CONFIGS)) {
    if (providerKey === failedProvider) continue;
    // Check if this provider is configured for any task (indicates user has a key)
    const hasRoute = Object.values(routes).some(r => r?.provider === providerKey);
    if (hasRoute || providerKey === mainSettings.provider) {
      add(providerKey, config.defaultModel, mainSettings.apiKey);
    }
  }

  return chain;
}

// ─── Retry with Backoff ──────────────────────────────────────────

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Core resilient wrapper. Tries the primary call, classifies failures,
 * retries with backoff for transient errors, then walks the fallback chain.
 *
 * @param {Function} apiFn - async (provider, model, apiKey) => result
 * @param {string} taskType - e.g. 'decompose', 'synthesize', 'code'
 * @param {Object} opts
 *   @param {Function} opts.onStatus - (message, level) => void  ['info'|'warn'|'error'|'success']
 *   @param {AbortSignal} opts.signal - abort signal
 *   @param {number} opts.maxRetries - per-provider retry limit (default: 2)
 * @returns {Object} { result, provider, model, wasFallback }
 */
export async function resilientCall(apiFn, taskType, opts = {}) {
  const { onStatus, signal, maxRetries = 2 } = opts;
  const mainSettings = getSettings();
  const primaryRoute = resolveRoute(taskType, mainSettings);

  const status = (msg, level = 'info') => {
    if (onStatus) onStatus(msg, level);
  };

  // ── Attempt the primary route ──
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    try {
      const result = await apiFn(primaryRoute.provider, primaryRoute.model, primaryRoute.apiKey);
      if (attempt > 0) status(`Retry succeeded on attempt ${attempt + 1}`, 'success');
      return { result, provider: primaryRoute.provider, model: primaryRoute.model, wasFallback: false };
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError') throw e;

      const classification = classifyError(e);
      status(friendlyError(classification, primaryRoute.provider, primaryRoute.model), 'warn');

      // Don't retry auth errors or context length on same model
      if (!classification.retryable) break;

      // Backoff before retry
      if (attempt < maxRetries) {
        const delay = classification.backoff
          ? Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 8000)
          : 1000;
        status(`Retrying in ${(delay / 1000).toFixed(1)}s… (attempt ${attempt + 2}/${maxRetries + 1})`, 'info');
        await sleep(delay);
      }
    }
  }

  // ── Primary exhausted — try fallback chain ──
  const classification = classifyError(lastError);
  if (!classification.fallbackable) {
    throw lastError; // AbortError, etc. — no fallback possible
  }

  const chain = buildFallbackChain(taskType, primaryRoute.provider, primaryRoute.model, classification.type);

  if (chain.length === 0) {
    throw enrichError(lastError, primaryRoute.provider, primaryRoute.model, classification);
  }

  status(`Primary provider failed. Trying ${chain.length} fallback${chain.length === 1 ? '' : 's'}…`, 'warn');

  for (const fallback of chain) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const fbName = `${PROVIDER_CONFIGS[fallback.provider]?.name || fallback.provider} / ${fallback.model}`;
    status(`Trying fallback: ${fbName}…`, 'info');

    try {
      const result = await apiFn(fallback.provider, fallback.model, fallback.apiKey);
      status(`Fallback succeeded: ${fbName}`, 'success');
      return { result, provider: fallback.provider, model: fallback.model, wasFallback: true };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      const fbClass = classifyError(e);
      status(`Fallback ${fbName} failed: ${fbClass.type}`, 'warn');
      lastError = e;
    }
  }

  // All fallbacks exhausted
  throw enrichError(lastError, primaryRoute.provider, primaryRoute.model, classification, chain.length);
}

/**
 * Adds context to the error message so the user knows what was tried.
 */
function enrichError(error, provider, model, classification, fallbacksTried = 0) {
  const providerName = PROVIDER_CONFIGS[provider]?.name || provider;
  let msg = error.message;

  if (fallbacksTried > 0) {
    msg = `All providers failed (tried ${fallbacksTried + 1} total). Last error: ${msg}`;
  }

  // Add actionable advice
  switch (classification.type) {
    case ERROR_TYPES.AUTH:
      msg += '\n\nFix: Open Settings and verify your API key.';
      break;
    case ERROR_TYPES.RATE_LIMIT:
      msg += '\n\nFix: Wait a moment or configure an additional provider in Settings → Model Router.';
      break;
    case ERROR_TYPES.CONTEXT_LEN:
      msg += '\n\nFix: Shorten your input or use fewer layers.';
      break;
    case ERROR_TYPES.NETWORK:
      msg += '\n\nFix: Check your internet connection. If using a proxy, verify the server is running.';
      break;
  }

  const enriched = new Error(msg);
  enriched.originalError = error;
  enriched.classification = classification;
  enriched.provider = providerName;
  enriched.model = model;
  return enriched;
}
