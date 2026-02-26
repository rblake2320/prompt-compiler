/**
 * Claude / Multi-Provider API Client — v2 with context management + model routing.
 */

import { getSettings, PROVIDER_CONFIGS } from './settings.js';
import { routeToolCall } from './tools.js';
import { manageContext } from './contextManager.js';
import { getModelForTask, getApiKeyForProvider, detectTaskType } from './modelRouter.js';

// ─── Request Configuration ────────────────────────────────────────

function getRequestConfig(provider, apiKey, config) {
  const headers = { 'Content-Type': 'application/json' };
  let url;
  if (apiKey) {
    if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
    } else {
      url = config.baseUrl + '/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  } else {
    if (provider === 'anthropic') {
      url = config.proxyPath + '/v1/messages';
      headers['anthropic-version'] = '2023-06-01';
    } else {
      url = config.proxyPath + '/v1/chat/completions';
    }
  }
  return { url, headers };
}

/**
 * Resolve provider, model, apiKey, and config for a given task type.
 * Falls back to global settings if no router config exists.
 */
function resolveModelConfig(taskType) {
  if (taskType) {
    const route = getModelForTask(taskType);
    const provider = route.provider || 'anthropic';
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
    const model = route.model || config.defaultModel;
    const apiKey = getApiKeyForProvider(provider);
    return { provider, model, apiKey, config };
  }
  // Fallback to global settings
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  return { provider, model: model || config.defaultModel, apiKey, config };
}

// ─── Body Builders ────────────────────────────────────────────────

function buildBody(system, userMessage, provider, model) {
  if (provider === 'anthropic') {
    return { model, max_tokens: 4000, system, messages: [{ role: 'user', content: userMessage }] };
  }
  return {
    model,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMessage },
    ],
  };
}

function buildBodyWithHistory(system, messages, provider, model, opts = {}) {
  const maxTokens = opts.maxTokens || 8192;
  const base = provider === 'anthropic'
    ? { model, max_tokens: maxTokens, system, messages }
    : { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] };
  if (opts.stream) base.stream = true;
  if (opts.tools && opts.tools.length > 0 && provider === 'anthropic') {
    base.tools = opts.tools;
  }
  return base;
}

function parseResponse(data, provider) {
  if (provider === 'anthropic') {
    return (data.content || []).map((b) => b.text || '').join('');
  }
  return data.choices?.[0]?.message?.content || '';
}

async function doFetch(url, headers, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'API error');
  return data;
}

// ─── Smart max_tokens ─────────────────────────────────────────────

/**
 * Determine appropriate max_tokens based on task type and context.
 */
function getSmartMaxTokens(taskType, messageLength) {
  const defaults = {
    compile: 4000,
    code: 16384,       // Code gen needs room
    chat: 2048,        // Quick responses
    review: 4096,      // Analysis
    summarize: 2048,   // Compression
  };
  return defaults[taskType] || 8192;
}

// ─── Non-streaming single call ────────────────────────────────────

/**
 * Single-turn call with optional task-based routing.
 */
export async function callClaude(system, userMessage, taskType) {
  const { provider, model, apiKey, config } = resolveModelConfig(taskType || 'compile');
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBody(system, userMessage, provider, model);
  const data = await doFetch(url, headers, body);
  return parseResponse(data, provider);
}

// ─── Non-streaming multi-turn ─────────────────────────────────────

export async function callClaudeWithHistory(system, messages, taskType) {
  const { provider, model, apiKey, config } = resolveModelConfig(taskType);
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBodyWithHistory(system, messages, provider, model);
  const data = await doFetch(url, headers, body);
  return parseResponse(data, provider);
}

// ─── Streaming multi-turn with context management ─────────────────

/**
 * Streaming multi-turn conversation with automatic context compression.
 * 
 * @param {string} system - System prompt
 * @param {Array} messages - Full conversation history (will be auto-compressed)
 * @param {Function} onDelta - Called with each text chunk
 * @param {AbortSignal} signal
 * @param {object} opts - { taskType, maxContextTokens }
 * @returns {{ fullText: string, contextStats: object }}
 */
export async function streamClaudeWithHistory(system, messages, onDelta, signal, opts = {}) {
  const taskType = opts.taskType || detectTaskType(messages[messages.length - 1]?.content || '');
  const { provider, model, apiKey, config } = resolveModelConfig(taskType);
  const { url, headers } = getRequestConfig(provider, apiKey, config);

  // Apply context management — compress if needed
  const { messages: managedMessages, stats } = manageContext(system, messages, {
    maxContextTokens: opts.maxContextTokens || 150000,
    keepRecentFull: 3,
    deduplicateHtml: true,
  });

  const maxTokens = getSmartMaxTokens(taskType, managedMessages.length);
  const body = buildBodyWithHistory(system, managedMessages, provider, model, { 
    stream: true, 
    maxTokens 
  });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }

  if (!res.body) {
    const data = await res.json();
    const text = parseResponse(data, provider);
    onDelta(text);
    return { fullText: text, contextStats: stats };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'event: ping') continue;
        if (trimmed.startsWith('event:')) continue;
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(dataStr); } catch { continue; }

        let chunk = '';
        if (provider === 'anthropic') {
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            chunk = parsed.delta.text;
          }
          if (parsed.type === 'error') {
            throw new Error(parsed.error?.message || 'Stream error');
          }
        } else {
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            chunk = delta.content;
          }
        }

        if (chunk) {
          fullText += chunk;
          onDelta(chunk);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { fullText, contextStats: stats };
}

// ─── Agentic tool-use conversation ────────────────────────────────

/**
 * Agentic tool-use conversation with context management.
 * Non-streaming. Runs a loop: send → check for tool_use → execute → send result → repeat.
 */
export async function agenticToolCall(
  system,
  messages,
  tools,
  toolContext = {},
  opts = {}
) {
  const taskType = opts.taskType || 'code';
  const { provider, model, apiKey, config } = resolveModelConfig(taskType);
  const { url, headers } = getRequestConfig(provider, apiKey, config);

  // Apply context management
  const { messages: managedMessages, stats } = manageContext(system, messages, {
    maxContextTokens: opts.maxContextTokens || 150000,
    keepRecentFull: 3,
  });

  const maxTurns = opts.maxTurns || 5;
  const maxTokens = getSmartMaxTokens(taskType, managedMessages.length);
  const allToolResults = [];
  let conversationMessages = [...managedMessages];
  let finalText = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const body = buildBodyWithHistory(
      system,
      conversationMessages,
      provider,
      model,
      { tools, maxTokens }
    );

    const data = await doFetch(url, headers, body);

    const textBlocks = [];
    const toolUseBlocks = [];

    for (const block of data.content || []) {
      if (block.type === 'text') {
        textBlocks.push(block.text);
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push(block);
      }
    }

    const responseText = textBlocks.join('');
    if (responseText) {
      finalText += responseText;
      if (opts.onText) opts.onText(responseText);
    }

    if (toolUseBlocks.length === 0 || data.stop_reason !== 'tool_use') {
      break;
    }

    conversationMessages.push({ role: 'assistant', content: data.content });

    const toolResultContent = [];
    for (const toolUse of toolUseBlocks) {
      if (opts.onToolUse) {
        opts.onToolUse(toolUse.name, toolUse.input);
      }

      const { result, sideEffects } = await routeToolCall(
        toolUse.name,
        toolUse.input,
        toolContext
      );

      allToolResults.push({
        tool: toolUse.name,
        input: toolUse.input,
        result,
        sideEffects,
      });

      toolResultContent.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    conversationMessages.push({ role: 'user', content: toolResultContent });
  }

  return { text: finalText, toolResults: allToolResults, contextStats: stats };
}

// ─── Utilities ────────────────────────────────────────────────────

export function robustJsonParse(raw) {
  let s = raw.trim().replace(/```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try { return JSON.parse(s); } catch (_) {}
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last <= first) throw new Error('No JSON object found');
  let sub = s.slice(first, last + 1);
  try { return JSON.parse(sub); } catch (_) {}
  sub = sub.replace(/"(?:[^"\\]|\\.)*"/g, (m) =>
    m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  );
  try { return JSON.parse(sub); } catch (e) {
    throw new Error('JSON parse failed: ' + e.message);
  }
}
