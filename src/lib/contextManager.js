/**
 * Context Manager — prevents token blowout during multi-turn conversations.
 *
 * Strategies:
 * 1. Sliding window — keep last N full exchanges, summarize older ones
 * 2. HTML deduplication — only include latest project HTML, not every version
 * 3. Token estimation — rough count to decide when to compress
 * 4. Smart truncation — preserve system prompt + latest context
 */

// Rough token estimate: ~4 chars per token for English
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateMessagesTokens(messages) {
  return messages.reduce((sum, m) => {
    if (typeof m.content === 'string') return sum + estimateTokens(m.content);
    // Array content (tool results)
    if (Array.isArray(m.content)) {
      return sum + m.content.reduce((s, c) => s + estimateTokens(c.content || c.text || JSON.stringify(c)), 0);
    }
    return sum;
  }, 0);
}

/**
 * Summarize a message for compression.
 * Strips code blocks, keeps key sentences.
 */
function summarizeMessage(msg) {
  if (msg.role === 'user') {
    // Keep user messages short
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    return text.length > 200 ? text.slice(0, 200) + '...' : text;
  }

  if (msg.role === 'assistant') {
    let text = typeof msg.content === 'string' ? msg.content : '';
    // Strip code blocks (biggest token eaters)
    text = text.replace(/```[\s\S]*?```/g, '[code block removed]');
    // Keep first 300 chars
    return text.length > 300 ? text.slice(0, 300) + '...' : text;
  }

  return typeof msg.content === 'string' ? msg.content.slice(0, 100) : '[tool interaction]';
}

/**
 * Strip all HTML code blocks from a message, replacing with a note.
 * Used to deduplicate project HTML across conversation turns.
 */
function stripHtmlBlocks(text) {
  return text.replace(
    /```html\n[\s\S]*?```/g,
    '```\n[Full HTML provided - see current_project_html in system prompt]\n```'
  );
}

/**
 * Manage conversation context to stay within token budget.
 *
 * @param {string} systemPrompt - The system prompt (always included in full)
 * @param {Array} messages - Full conversation history
 * @param {object} opts
 * @param {number} opts.maxContextTokens - Target max tokens (default: 150000)
 * @param {number} opts.keepRecentFull - Number of recent exchanges to keep uncompressed (default: 3)
 * @param {boolean} opts.deduplicateHtml - Strip HTML from older messages (default: true)
 * @returns {{ messages: Array, stats: object }}
 */
export function manageContext(systemPrompt, messages, opts = {}) {
  const {
    maxContextTokens = 150000,
    keepRecentFull = 3,
    deduplicateHtml = true,
  } = opts;

  const systemTokens = estimateTokens(systemPrompt);
  const outputReserve = 8192; // Reserve for model output
  const budget = maxContextTokens - systemTokens - outputReserve;

  if (budget <= 0) {
    // System prompt alone is too big — truncate oldest messages
    return {
      messages: messages.slice(-2),
      stats: { original: messages.length, kept: 2, compressed: 0, estimatedTokens: estimateMessagesTokens(messages.slice(-2)) },
    };
  }

  // If messages fit within budget, return as-is (with optional HTML dedup)
  let processedMessages = [...messages];

  if (deduplicateHtml && processedMessages.length > 2) {
    // Strip HTML from all but the last assistant message
    const lastAssistantIdx = processedMessages.reduce(
      (last, m, i) => m.role === 'assistant' ? i : last, -1
    );
    processedMessages = processedMessages.map((m, i) => {
      if (m.role === 'assistant' && i !== lastAssistantIdx && typeof m.content === 'string') {
        return { ...m, content: stripHtmlBlocks(m.content) };
      }
      return m;
    });
  }

  const currentTokens = estimateMessagesTokens(processedMessages);
  if (currentTokens <= budget) {
    return {
      messages: processedMessages,
      stats: { original: messages.length, kept: messages.length, compressed: 0, estimatedTokens: currentTokens },
    };
  }

  // Need to compress — keep recent exchanges full, summarize older ones
  // An "exchange" is a user+assistant pair
  const exchanges = [];
  let i = 0;
  while (i < processedMessages.length) {
    if (processedMessages[i].role === 'user') {
      const pair = [processedMessages[i]];
      if (i + 1 < processedMessages.length && processedMessages[i + 1].role === 'assistant') {
        pair.push(processedMessages[i + 1]);
        i += 2;
      } else {
        i += 1;
      }
      exchanges.push(pair);
    } else {
      // Orphan assistant message
      exchanges.push([processedMessages[i]]);
      i += 1;
    }
  }

  const recentCount = Math.min(keepRecentFull, exchanges.length);
  const olderExchanges = exchanges.slice(0, exchanges.length - recentCount);
  const recentExchanges = exchanges.slice(exchanges.length - recentCount);

  // Summarize older exchanges
  const compressed = [];
  if (olderExchanges.length > 0) {
    const summaryParts = olderExchanges.map(ex =>
      ex.map(m => `[${m.role}]: ${summarizeMessage(m)}`).join('\n')
    );
    compressed.push({
      role: 'user',
      content: `[CONVERSATION SUMMARY - ${olderExchanges.length} earlier exchange(s)]:\n${summaryParts.join('\n---\n')}`,
    });
    compressed.push({
      role: 'assistant',
      content: 'Understood, I have context from our earlier discussion. Let me continue from where we left off.',
    });
  }

  // Add recent exchanges in full
  const recentFlat = recentExchanges.flat();
  const result = [...compressed, ...recentFlat];

  return {
    messages: result,
    stats: {
      original: messages.length,
      kept: recentFlat.length,
      compressed: olderExchanges.length,
      estimatedTokens: estimateMessagesTokens(result),
    },
  };
}

/**
 * Estimate total cost of a request (rough, for display purposes)
 */
export function estimateCost(systemPrompt, messages, model) {
  const inputTokens = estimateTokens(systemPrompt) + estimateMessagesTokens(messages);
  const outputTokens = 4000; // Estimate

  // Rough pricing per 1M tokens (input/output)
  const pricing = {
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-opus-4-20250514': { input: 15, output: 75 },
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
  };

  const p = pricing[model] || { input: 3, output: 15 };
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1000000;

  return {
    inputTokens,
    outputTokens,
    estimatedCost: cost,
    formatted: cost < 0.01 ? '<$0.01' : `$${cost.toFixed(3)}`,
  };
}

export { estimateTokens, estimateMessagesTokens };
