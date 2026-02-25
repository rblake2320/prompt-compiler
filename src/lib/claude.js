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

function buildBodyWithHistory(system, messages, provider, model) {
  if (provider === 'anthropic') {
    return { model, max_tokens: 8192, system, messages };
  }
  return {
    model,
    max_tokens: 8192,
    messages: [{ role: 'system', content: system }, ...messages],
  };
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

export async function callClaude(system, userMessage) {
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = model || config.defaultModel;
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBody(system, userMessage, provider, resolvedModel);
  const data = await doFetch(url, headers, body);
  return parseResponse(data, provider);
}

/**
 * Multi-turn conversation support.
 * @param {string} system - The system prompt (compiled prompt)
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @returns {Promise<string>} Assistant response text
 */
export async function callClaudeWithHistory(system, messages) {
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = model || config.defaultModel;
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBodyWithHistory(system, messages, provider, resolvedModel);
  const data = await doFetch(url, headers, body);
  return parseResponse(data, provider);
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
