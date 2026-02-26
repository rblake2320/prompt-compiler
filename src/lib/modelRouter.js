/**
 * Model Router — assigns different AI models to different task types.
 *
 * Task types:
 * - compile: Decompose/synthesize prompts (needs structured output)
 * - code: Generate/edit code (needs high quality)
 * - chat: Quick follow-ups, clarifications (needs speed)
 * - review: Code review, error analysis (needs reasoning)
 * - image: Generate images (routes to image API)
 * - tts: Text-to-speech (routes to TTS API)
 * - audio: Music/sound generation (routes to audio API)
 * - summarize: Conversation compression (needs efficiency)
 */

import { getSettings, PROVIDER_CONFIGS } from './settings.js';

const ROUTER_KEY = 'pc_model_router';

// Default task-to-model mapping
const DEFAULT_ROUTES = {
  compile: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  code: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  chat: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  review: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  image: { provider: 'openai', model: 'dall-e-3', type: 'media' },
  tts: { provider: 'openai', model: 'tts-1', type: 'media' },
  audio: { provider: 'custom', model: '', type: 'media' },
  summarize: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
};

// All available task types with metadata
export const TASK_TYPES = [
  {
    id: 'compile',
    label: 'Compile (Decompose + Synthesize)',
    icon: '\u26a1',
    description: 'Layer decomposition and prompt synthesis',
    category: 'text',
  },
  {
    id: 'code',
    label: 'Code Generation',
    icon: '\ud83d\udcbb',
    description: 'Generate and edit HTML/CSS/JS code',
    category: 'text',
  },
  {
    id: 'chat',
    label: 'Quick Chat / Follow-up',
    icon: '\ud83d\udcac',
    description: 'Fast responses, clarifications, small edits',
    category: 'text',
  },
  {
    id: 'review',
    label: 'Code Review / Analysis',
    icon: '\ud83d\udd0d',
    description: 'Deep reasoning about code quality and errors',
    category: 'text',
  },
  {
    id: 'image',
    label: 'Image Generation',
    icon: '\ud83c\udfa8',
    description: 'Generate images via DALL-E, Flux, or Stability AI',
    category: 'media',
  },
  {
    id: 'tts',
    label: 'Text-to-Speech',
    icon: '\ud83d\udd0a',
    description: 'Generate speech audio from text',
    category: 'media',
  },
  {
    id: 'audio',
    label: 'Audio / Music Generation',
    icon: '\ud83c\udfb5',
    description: 'Generate music or sound effects',
    category: 'media',
  },
  {
    id: 'summarize',
    label: 'Summarize / Compress',
    icon: '\ud83d\udcdd',
    description: 'Compress conversation history to save tokens',
    category: 'text',
  },
];

// Available models per provider including media models
export const ALL_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', tier: 'premium' },
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', tier: 'standard' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', tier: 'fast' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o', tier: 'standard' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', tier: 'fast' },
    { id: 'o1', label: 'o1 (Reasoning)', tier: 'premium' },
    { id: 'dall-e-3', label: 'DALL-E 3', tier: 'media', category: 'image' },
    { id: 'tts-1', label: 'TTS-1', tier: 'media', category: 'tts' },
    { id: 'tts-1-hd', label: 'TTS-1 HD', tier: 'media', category: 'tts' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', tier: 'standard' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', tier: 'fast' },
    { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', tier: 'standard' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'standard' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', tier: 'fast' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', tier: 'premium' },
  ],
  stability: [
    { id: 'sd3-large', label: 'Stable Diffusion 3 Large', tier: 'media', category: 'image' },
    { id: 'sd3-medium', label: 'Stable Diffusion 3 Medium', tier: 'media', category: 'image' },
  ],
  elevenlabs: [
    { id: 'eleven_multilingual_v2', label: 'Multilingual v2', tier: 'media', category: 'tts' },
    { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5', tier: 'media', category: 'tts' },
  ],
};

/**
 * Get the full model router configuration.
 */
export function getRouterConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROUTER_KEY) || '{}');
    return { ...DEFAULT_ROUTES, ...saved };
  } catch {
    return { ...DEFAULT_ROUTES };
  }
}

/**
 * Save router config.
 */
export function saveRouterConfig(config) {
  localStorage.setItem(ROUTER_KEY, JSON.stringify(config));
}

/**
 * Update a single route.
 */
export function setRoute(taskType, provider, model) {
  const config = getRouterConfig();
  config[taskType] = { ...config[taskType], provider, model };
  saveRouterConfig(config);
  return config;
}

/**
 * Get the provider + model for a task type.
 * Falls back to the global settings if no specific route is set.
 */
export function getModelForTask(taskType) {
  const config = getRouterConfig();
  const route = config[taskType];

  if (route && route.provider && route.model) {
    return route;
  }

  // Fallback to global settings
  const settings = getSettings();
  const provConfig = PROVIDER_CONFIGS[settings.provider];
  return {
    provider: settings.provider,
    model: settings.model || provConfig?.defaultModel || 'claude-sonnet-4-20250514',
  };
}

/**
 * Get API keys for a specific provider.
 * Checks both the main settings key and provider-specific keys.
 */
const API_KEYS_KEY = 'pc_api_keys';

export function getApiKeys() {
  try {
    return JSON.parse(localStorage.getItem(API_KEYS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveApiKeys(keys) {
  localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
}

export function getApiKeyForProvider(provider) {
  const keys = getApiKeys();
  if (keys[provider]) return keys[provider];

  // Fallback to main settings key if provider matches
  const settings = getSettings();
  if (settings.provider === provider && settings.apiKey) {
    return settings.apiKey;
  }

  return '';
}

/**
 * Detect the best task type for a user message.
 * Used for automatic routing when user doesn't specify.
 */
export function detectTaskType(message) {
  const lower = message.toLowerCase();

  // Image generation signals
  if (/\b(generate|create|make|draw|design)\s+(an?\s+)?(image|picture|photo|illustration|icon|logo|graphic|banner|hero\s*image)/i.test(message)) {
    return 'image';
  }

  // TTS signals
  if (/\b(read\s+aloud|speak|voice|narrat|text.?to.?speech|tts|audio\s*version)/i.test(message)) {
    return 'tts';
  }

  // Audio/music signals
  if (/\b(generate|create|make)\s+(music|song|soundtrack|beat|jingle|sound\s*effect|sfx|audio)/i.test(message)) {
    return 'audio';
  }

  // Code review signals
  if (/\b(review|audit|analyze|check|fix\s+(?:the|these|all)\s+(?:error|bug|issue)|what'?s\s+wrong)/i.test(message)) {
    return 'review';
  }

  // Quick chat signals (short messages, questions)
  if (message.length < 80 || /^(yes|no|ok|sure|thanks|got it|what|how|why|can you)/i.test(lower)) {
    return 'chat';
  }

  // Default to code for project-mode follow-ups
  return 'code';
}
