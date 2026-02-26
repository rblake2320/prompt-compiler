import { getSettings, PROVIDER_CONFIGS } from './settings.js';
import { routeToolCall } from './tools.js';

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

  return fullText;
}

/**
 * Agentic tool-use conversation.
 * Non-streaming. Runs a loop: send → check for tool_use → execute → send result → repeat.
 * 
 * @param {string} system - System prompt
 * @param {Array} messages - Conversation history
 * @param {Array} tools - Tool definitions (Claude API format)
 * @param {object} toolContext - Context passed to tool executors
 * @param {object} opts - { maxTurns, signal, onToolUse, onText }
 * @returns {Promise<{ text: string, toolResults: Array }>}
 */
export async function agenticToolCall(
  system,
  messages,
  tools,
  toolContext = {},
  opts = {}
) {
  const { provider = 'anthropic', model, apiKey = '' } = getSettings();
  const config = PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.anthropic;
  const resolvedModel = model || config.defaultModel;
  const { url, headers } = getRequestConfig(provider, apiKey, config);

  const maxTurns = opts.maxTurns || 5;
  const allToolResults = [];
  let conversationMessages = [...messages];
  let finalText = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const body = buildBodyWithHistory(
      system,
      conversationMessages,
      provider,
      resolvedModel,
      { tools }
    );

    const data = await doFetch(url, headers, body);

    // Extract text and tool_use blocks from response
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

    // If no tool calls, we're done
    if (toolUseBlocks.length === 0 || data.stop_reason !== 'tool_use') {
      break;
    }

    // Add assistant response to conversation
    conversationMessages.push({ role: 'assistant', content: data.content });

    // Execute each tool and collect results
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

    // Send tool results back
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
  try { return JSON.parse(sub); } catch (e) {
    throw new Error('JSON parse failed: ' + e.message);
  }
}
