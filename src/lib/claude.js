import { getSettings, PROVIDER_CONFIGS } from './settings.js';

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
  const base = provider === 'anthropic'
    ? { model, max_tokens: 8192, system, messages }
    : { model, max_tokens: 8192, messages: [{ role: 'system', content: system }, ...messages] };
  if (opts.stream) base.stream = true;
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

// Non-streaming single call (for decompose/synthesize phases)
export async function callClaude(system, userMessage) {
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = model || config.defaultModel;
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBody(system, userMessage, provider, resolvedModel);
  const data = await doFetch(url, headers, body);
  return parseResponse(data, provider);
}

// Non-streaming multi-turn (fallback)
export async function callClaudeWithHistory(system, messages) {
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = model || config.defaultModel;
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBodyWithHistory(system, messages, provider, resolvedModel);
  const data = await doFetch(url, headers, body);
  return parseResponse(data, provider);
}

/**
 * Streaming multi-turn conversation.
 * Calls onDelta(textChunk) as tokens arrive, returns full text when done.
 * Falls back to non-streaming if ReadableStream isn't available.
 *
 * @param {string} system - System prompt
 * @param {Array<{role: string, content: string}>} messages - Conversation
 * @param {(chunk: string) => void} onDelta - Called with each text chunk
 * @param {AbortSignal} [signal] - Optional abort signal
 * @returns {Promise<string>} Complete response text
 */
export async function streamClaudeWithHistory(system, messages, onDelta, signal) {
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = model || config.defaultModel;
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBodyWithHistory(system, messages, provider, resolvedModel, { stream: true });

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

  // If no streaming support, fall back
  if (!res.body) {
    const data = await res.json();
    const text = parseResponse(data, provider);
    onDelta(text);
    return text;
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
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'event: ping') continue;

        // Skip SSE event type lines
        if (trimmed.startsWith('event:')) continue;

        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();

        if (dataStr === '[DONE]') continue; // OpenAI end signal

        let parsed;
        try { parsed = JSON.parse(dataStr); } catch { continue; }

        let chunk = '';
        if (provider === 'anthropic') {
          // Anthropic SSE: content_block_delta events
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            chunk = parsed.delta.text;
          }
          // Also handle message_start, content_block_start (no text), message_stop (done)
          if (parsed.type === 'error') {
            throw new Error(parsed.error?.message || 'Stream error');
          }
        } else {
          // OpenAI-compatible (OpenAI, Groq, Gemini)
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

  return fullText;
}

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
