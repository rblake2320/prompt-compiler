/**
 * Context Manager for Prompt Compiler.
 *
 * Handles:
 * 1. Token estimation (fast, no external deps)
 * 2. Sliding window — keep last N turns full, summarize older
 * 3. Context budget calculation & display
 * 4. Conversation compression for long sessions
 */

// ─── Token Estimation ─────────────────────────────────────────────
// ~4 chars per token for English text, ~3.5 for code.
// This is an approximation — Claude tokenizer varies, but
// this is fast and within 15% accuracy for budgeting.

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 3.7);
}

export function estimateMessageTokens(messages) {
  return messages.reduce((sum, m) => {
    const content = typeof m.content === 'string'
      ? m.content
      : JSON.stringify(m.content);
    return sum + estimateTokens(content) + 4;
  }, 0);
}

// ─── Context Budget ───────────────────────────────────────────────

const MODEL_CONTEXT_WINDOWS = {
  'claude-opus-4-20250514': 200000,
  'claude-sonnet-4-20250514': 200000,
  'claude-haiku-4-5-20251001': 200000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'o1': 200000,
  'o1-mini': 128000,
  'llama-3.3-70b-versatile': 128000,
  'llama-3.1-8b-instant': 131072,
  'mixtral-8x7b-32768': 32768,
  'gemma2-9b-it': 8192,
  'gemini-2.0-flash': 1048576,
  'gemini-2.0-flash-lite': 1048576,
  'gemini-1.5-pro': 2097152,
  'gemini-1.5-flash': 1048576,
  'gemini-1.5-flash-8b': 1048576,
};

export function getContextWindow(model) {
  return MODEL_CONTEXT_WINDOWS[model] || 128000;
}

export function calculateBudget(systemPrompt, messages, model, maxOutputTokens = 8192) {
  const windowSize = getContextWindow(model);
  const systemTokens = estimateTokens(systemPrompt);
  const conversationTokens = estimateMessageTokens(messages);
  const totalUsed = systemTokens + conversationTokens;
  const availableForResponse = Math.max(0, windowSize - totalUsed - maxOutputTokens);
  const pct = Math.round((totalUsed / windowSize) * 100);

  return {
    systemTokens,
    conversationTokens,
    availableForResponse,
    totalUsed,
    windowSize,
    maxOutputTokens,
    pct,
    warning: pct > 80 ? 'high' : pct > 60 ? 'medium' : 'low',
  };
}

// ─── Sliding Window ───────────────────────────────────────────────

export function applySlidingWindow(messages, opts = {}) {
  const { keepRecent = 4, maxTokens = 80000 } = opts;
  const currentTokens = estimateMessageTokens(messages);
  if (currentTokens <= maxTokens) return { messages, wasTruncated: false };

  const pairs = [];
  let i = messages.length - 1;
  while (i >= 0 && pairs.length < keepRecent * 2) {
    pairs.unshift(messages[i]);
    i--;
  }

  const olderMessages = messages.slice(0, i + 1);
  if (olderMessages.length === 0) {
    return { messages, wasTruncated: false };
  }

  const summary = compressMessages(olderMessages);
  const summaryMsg = {
    role: 'user',
    content: `[Context Summary — earlier conversation compressed]\n${summary}\n[End Summary — recent messages follow]`,
  };

  return {
    messages: [summaryMsg, ...pairs],
    wasTruncated: true,
    droppedCount: olderMessages.length,
  };
}

function compressMessages(messages) {
  const parts = [];
  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (msg.role === 'user') {
      const truncated = content.length > 200 ? content.slice(0, 200) + '...' : content;
      parts.push(`User requested: ${truncated}`);
    } else if (msg.role === 'assistant') {
      const withoutCode = content.replace(/```[\s\S]*?```/g, '[code block]');
      const truncated = withoutCode.length > 300 ? withoutCode.slice(0, 300) + '...' : withoutCode;
      if (truncated.trim()) {
        parts.push(`Assistant: ${truncated}`);
      }
    }
  }
  return parts.join('\n');
}

// ─── Smart Max Tokens ─────────────────────────────────────────────

export function getSmartMaxTokens(taskType, model) {
  const window = getContextWindow(model);
  const defaults = {
    decompose: 4096,
    synthesize: 4096,
    generate: 16384,
    followup: 12288,
    quick_edit: 4096,
    image_prompt: 1024,
    review: 4096,
  };
  const base = defaults[taskType] || 8192;
  return Math.min(base, Math.floor(window * 0.25));
}

// ─── Conversation Utilities ───────────────────────────────────────

export function classifyFollowUp(text) {
  const quickPatterns = [
    /change.*(?:color|colour|font|size|text|title|heading|padding|margin)/i,
    /make.*(?:bigger|smaller|larger|bolder|lighter|darker|brighter)/i,
    /replace.*(?:text|image|icon|word)/i,
    /fix.*(?:typo|spelling|alignment|spacing)/i,
    /update.*(?:link|url|email|phone|address)/i,
    /remove.*(?:section|element|button|link)/i,
    /hide|show|toggle/i,
  ];
  const isQuick = quickPatterns.some(p => p.test(text)) && text.length < 200;
  return isQuick ? 'quick_edit' : 'followup';
}

export function detectMediaRequest(text) {
  const lower = text.toLowerCase();
  const types = [];
  if (/(?:generate|create|make|add|draw).*(?:image|picture|photo|illustration|icon|logo|graphic|banner|hero\s*image)/i.test(lower)) {
    types.push('image');
  }
  if (/(?:generate|create|make|add).*(?:sound|audio|music|background\s*music|sfx|sound\s*effect)/i.test(lower)) {
    types.push('audio');
  }
  if (/(?:generate|create|make|add|read|speak|narrate).*(?:speech|voice|voiceover|narration|tts|text.to.speech)/i.test(lower)) {
    types.push('speech');
  }
  return types;
}
