import { getSettings, PROVIDER_CONFIGS } from './settings.js';
import { routeToolCall } from './tools.js';
import { resolveRoute } from './router.js';
import { applySlidingWindow, getSmartMaxTokens, calculateBudget } from './context.js';

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
  const mainSettings = getSettings();
  const route = resolveRoute(taskType, mainSettings);
  const config = PROVIDER_CONFIGS[route.provider] || PROVIDER_CONFIGS.anthropic;
  const maxTokens = getSmartMaxTokens(taskType, route.model);
  const { url, headers } = getRequestConfig(route.provider, route.apiKey, config);
  const body = buildBody(system, userMessage, route.provider, route.model, maxTokens);
  if (opts.onBudget) {
    const budget = calculateBudget(system, [{ role: 'user', content: userMessage }], route.model, maxTokens);
    opts.onBudget(budget);
  }
  const data = await doFetch(url, headers, body);
  return parseResponse(data, route.provider);
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
  const route = resolveRoute(taskType, mainSettings);
  const config = PROVIDER_CONFIGS[route.provider] || PROVIDER_CONFIGS[mainSettings.provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = route.model || mainSettings.model || config.defaultModel;
  const maxTokens = opts.maxTokens || getSmartMaxTokens(taskType, resolvedModel);
  const { url, headers } = getRequestConfig(route.provider, route.apiKey || mainSettings.apiKey, config);

  const { messages: windowedMessages, wasTruncated } = applySlidingWindow(messages, {
    keepRecent: opts.keepRecent || 4, maxTokens: opts.contextBudget || 80000,
  });
  if (wasTruncated && opts.onTruncated) opts.onTruncated();
  if (opts.onBudget) {
    const budget = calculateBudget(system, windowedMessages, resolvedModel, maxTokens);
    opts.onBudget(budget);
  }

  const body = buildBodyWithHistory(system, windowedMessages, route.provider, resolvedModel, { stream: true, maxTokens });
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }
  if (!res.body) {
    const data = await res.json();
    const text = parseResponse(data, route.provider);
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
        if (route.provider === 'anthropic') {
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
  return fullText;
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
