import { getSettings, PROVIDER_CONFIGS } from './settings.js';
import { routeToolCall } from './tools.js';
import { resolveRoute } from './router.js';
import { applySlidingWindow, getSmartMaxTokens, calculateBudget } from './context.js';
import { resilientCall, classifyError, friendlyError, buildFallbackChain, ERROR_TYPES } from './resilience.js';

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

function buildBody(system, userMessage, provider, model, maxTokens = 4000) {
  if (provider === 'anthropic') {
    return { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMessage }] };
  }
  return { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage }] };
}

function buildBodyWithHistory(system, messages, provider, model, opts = {}) {
  const maxTokens = opts.maxTokens || 8192;
  const base = provider === 'anthropic'
    ? { model, max_tokens: maxTokens, system, messages }
    : { model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] };
  if (opts.stream) base.stream = true;
  if (opts.tools && opts.tools.length > 0 && provider === 'anthropic') base.tools = opts.tools;
  return base;
}

function parseResponse(data, provider) {
  if (provider === 'anthropic') return (data.content || []).map((b) => b.text || '').join('');
  return data.choices?.[0]?.message?.content || '';
}

async function doFetch(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'API error');
  return data;
}

export async function callRouted(system, userMessage, taskType = 'decompose', opts = {}) {
  // Inner function parameterized for resilience wrapper
  const makeCall = async (provider, model, apiKey) => {
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
    const maxTokens = getSmartMaxTokens(taskType, model);
    const { url, headers } = getRequestConfig(provider, apiKey, config);
    const body = buildBody(system, userMessage, provider, model, maxTokens);
    const data = await doFetch(url, headers, body);
    return parseResponse(data, provider);
  };

  if (opts.onBudget) {
    const mainSettings = getSettings();
    const route = resolveRoute(taskType, mainSettings);
    const budget = calculateBudget(system, [{ role: 'user', content: userMessage }], route.model, getSmartMaxTokens(taskType, route.model));
    opts.onBudget(budget);
  }

  const { result, provider, model, wasFallback } = await resilientCall(makeCall, taskType, {
    onStatus: opts.onStatus,
    signal: opts.signal,
    maxRetries: opts.maxRetries ?? 2,
  });

  if (wasFallback && opts.onFallback) {
    opts.onFallback(provider, model);
  }

  return result;
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

export async function callClaudeWithHistory(system, messages) {
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = model || config.defaultModel;
  const { url, headers } = getRequestConfig(provider, apiKey, config);
  const body = buildBodyWithHistory(system, messages, provider, resolvedModel);
  const data = await doFetch(url, headers, body);
  return parseResponse(data, provider);
}

export async function streamClaudeWithHistory(system, messages, onDelta, signal, opts = {}) {
  const mainSettings = getSettings();
  const taskType = opts.taskType || 'followup';

  const { messages: windowedMessages, wasTruncated } = applySlidingWindow(messages, {
    keepRecent: opts.keepRecent || 4, maxTokens: opts.contextBudget || 80000,
  });
  if (wasTruncated && opts.onTruncated) opts.onTruncated();

  // Inner stream function parameterized for fallback
  const doStream = async (provider, model, apiKey) => {
    const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
    const maxTokens = opts.maxTokens || getSmartMaxTokens(taskType, model);
    const { url, headers } = getRequestConfig(provider, apiKey, config);

    if (opts.onBudget) {
      const budget = calculateBudget(system, windowedMessages, model, maxTokens);
      opts.onBudget(budget);
    }

    const body = buildBodyWithHistory(system, windowedMessages, provider, model, { stream: true, maxTokens });
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
    }
    if (!res.body) {
      const data = await res.json();
      const text = parseResponse(data, provider);
      onDelta(text);
      return { fullText: text, provider, model };
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
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) chunk = parsed.delta.text;
            if (parsed.type === 'error') throw new Error(parsed.error?.message || 'Stream error');
          } else {
            const delta = parsed.choices?.[0]?.delta;
            if (delta?.content) chunk = delta.content;
          }
          if (chunk) { fullText += chunk; onDelta(chunk); }
        }
      }
    } finally { reader.releaseLock(); }
    return { fullText, provider, model };
  };

  // Try primary, then fallback chain
  try {
    const route = resolveRoute(taskType, mainSettings);
    const primaryResult = await doStream(route.provider, route.model, route.apiKey || mainSettings.apiKey);
    const contextStats = opts._contextStats || null;
    return { fullText: primaryResult.fullText, contextStats, provider: primaryResult.provider, model: primaryResult.model, wasFallback: false };
  } catch (primaryError) {
    if (primaryError.name === 'AbortError') throw primaryError;

    const classification = classifyError(primaryError);
    if (!classification.fallbackable) throw primaryError;

    // Attempt fallback
    const route = resolveRoute(taskType, mainSettings);
    if (opts.onStatus) opts.onStatus(friendlyError(classification, route.provider, route.model), 'warn');

    const chain = buildFallbackChain(taskType, route.provider, route.model, classification.type);

    for (const fallback of chain) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const fbName = `${PROVIDER_CONFIGS[fallback.provider]?.name || fallback.provider} / ${fallback.model}`;
      if (opts.onStatus) opts.onStatus(`Trying fallback: ${fbName}…`, 'info');

      try {
        const fbResult = await doStream(fallback.provider, fallback.model, fallback.apiKey);
        if (opts.onStatus) opts.onStatus(`Fallback succeeded: ${fbName}`, 'success');
        if (opts.onFallback) opts.onFallback(fallback.provider, fallback.model);
        return { fullText: fbResult.fullText, contextStats: null, provider: fbResult.provider, model: fbResult.model, wasFallback: true };
      } catch (fbError) {
        if (fbError.name === 'AbortError') throw fbError;
        if (opts.onStatus) opts.onStatus(`Fallback ${fbName} failed`, 'warn');
      }
    }

    // All fallbacks exhausted
    throw primaryError;
  }
}

export async function agenticToolCall(system, messages, tools, toolContext = {}, opts = {}) {
  const mainSettings = getSettings();
  const taskType = opts.taskType || 'generate';
  const route = resolveRoute(taskType, mainSettings);
  const config = PROVIDER_CONFIGS[route.provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = route.model || mainSettings.model || config.defaultModel;
  const maxTokens = opts.maxTokens || getSmartMaxTokens(taskType, resolvedModel);
  const { url, headers } = getRequestConfig(route.provider, route.apiKey || mainSettings.apiKey, config);
  const maxTurns = opts.maxTurns || 5;
  const allToolResults = [];

  const { messages: windowedMessages } = applySlidingWindow(messages, { keepRecent: 6, maxTokens: 80000 });
  let conversationMessages = [...windowedMessages];
  let finalText = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const body = buildBodyWithHistory(system, conversationMessages, route.provider, resolvedModel, { tools, maxTokens });
    const data = await doFetch(url, headers, body);
    const textBlocks = [];
    const toolUseBlocks = [];
    for (const block of data.content || []) {
      if (block.type === 'text') textBlocks.push(block.text);
      else if (block.type === 'tool_use') toolUseBlocks.push(block);
    }
    const responseText = textBlocks.join('');
    if (responseText) { finalText += responseText; if (opts.onText) opts.onText(responseText); }
    if (toolUseBlocks.length === 0 || data.stop_reason !== 'tool_use') break;
    conversationMessages.push({ role: 'assistant', content: data.content });
    const toolResultContent = [];
    for (const toolUse of toolUseBlocks) {
      if (opts.onToolUse) opts.onToolUse(toolUse.name, toolUse.input);
      const { result, sideEffects } = await routeToolCall(toolUse.name, toolUse.input, toolContext);
      allToolResults.push({ tool: toolUse.name, input: toolUse.input, result, sideEffects });
      toolResultContent.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result });
    }
    conversationMessages.push({ role: 'user', content: toolResultContent });
  }
  return { text: finalText, toolResults: allToolResults };
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
  try { return JSON.parse(sub); } catch (e) { throw new Error('JSON parse failed: ' + e.message); }
}
