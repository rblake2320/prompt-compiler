/**
 * Model Router for Prompt Compiler.
 *
 * Routes different task types to different models/providers.
 * Users configure which model handles: code gen, chat, image gen, TTS, etc.
 *
 * Storage: localStorage key 'pc_model_router'
 */

import { PROVIDER_CONFIGS } from './settings.js';

// ─── Task Types ───────────────────────────────────────────────────

export const TASK_TYPES = {
  decompose:   { label: 'Decompose (Layer Analysis)', description: 'Breaking task into layers', category: 'text', icon: '🔬' },
  synthesize:  { label: 'Synthesize (Compile Prompt)', description: 'Merging layers into prompt', category: 'text', icon: '🧬' },
  generate:    { label: 'Code Generation', description: 'Building HTML/JS/CSS apps', category: 'text', icon: '💻' },
  followup:    { label: 'Follow-up Edits', description: 'Iterating on code changes', category: 'text', icon: '✏️' },
  quick_chat:  { label: 'Quick Chat', description: 'Simple questions, small tasks', category: 'text', icon: '💬' },
  review:      { label: 'Code Review', description: 'Analyzing code for issues', category: 'text', icon: '🔍' },
  image:       { label: 'Image Generation', description: 'Creating images from text', category: 'media', icon: '🎨' },
  speech:      { label: 'Text-to-Speech', description: 'Converting text to audio', category: 'media', icon: '🗣️' },
  audio:       { label: 'Sound/Music Generation', description: 'Creating sound effects or music', category: 'media', icon: '🎵' },
};

// ─── Media Providers ──────────────────────────────────────────────

export const MEDIA_PROVIDERS = {
  'openai-dalle': {
    name: 'DALL-E 3 (OpenAI)', type: 'image',
    models: ['dall-e-3', 'dall-e-2'], defaultModel: 'dall-e-3',
    keyField: 'openai', endpoint: 'https://api.openai.com/v1/images/generations',
  },
  'stability': {
    name: 'Stability AI', type: 'image',
    models: ['stable-diffusion-3', 'stable-image-ultra', 'stable-image-core'], defaultModel: 'stable-image-core',
    keyField: 'stability', endpoint: 'https://api.stability.ai/v2beta/stable-image/generate/core',
  },
  'openai-tts': {
    name: 'OpenAI TTS', type: 'speech',
    models: ['tts-1', 'tts-1-hd'], defaultModel: 'tts-1',
    keyField: 'openai', endpoint: 'https://api.openai.com/v1/audio/speech',
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
  },
  'elevenlabs': {
    name: 'ElevenLabs', type: 'speech',
    models: ['eleven_multilingual_v2', 'eleven_turbo_v2_5'], defaultModel: 'eleven_multilingual_v2',
    keyField: 'elevenlabs', endpoint: 'https://api.elevenlabs.io/v1/text-to-speech',
  },
};

// ─── Router Config Storage ────────────────────────────────────────

const ROUTER_KEY = 'pc_model_router';
const MEDIA_KEYS_KEY = 'pc_media_keys';

const DEFAULT_ROUTES = {
  decompose:  { provider: 'anthropic', model: '' },
  synthesize: { provider: 'anthropic', model: '' },
  generate:   { provider: 'anthropic', model: '' },
  followup:   { provider: 'anthropic', model: '' },
  quick_chat: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
  review:     { provider: 'anthropic', model: '' },
  image:      { provider: 'openai-dalle', model: 'dall-e-3' },
  speech:     { provider: 'openai-tts', model: 'tts-1' },
  audio:      { provider: null, model: null },
};

export function getRouterConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROUTER_KEY) || '{}');
    return { ...DEFAULT_ROUTES, ...saved };
  } catch { return { ...DEFAULT_ROUTES }; }
}

export function saveRouterConfig(config) {
  localStorage.setItem(ROUTER_KEY, JSON.stringify(config));
}

export function getMediaKeys() {
  try { return JSON.parse(localStorage.getItem(MEDIA_KEYS_KEY) || '{}'); }
  catch { return {}; }
}

export function saveMediaKeys(keys) {
  localStorage.setItem(MEDIA_KEYS_KEY, JSON.stringify(keys));
}

// ─── Route Resolution ─────────────────────────────────────────────

export function resolveRoute(taskType, mainSettings) {
  const routes = getRouterConfig();
  const route = routes[taskType];

  if (!route || !route.provider) {
    return {
      provider: mainSettings.provider,
      model: mainSettings.model || PROVIDER_CONFIGS[mainSettings.provider]?.defaultModel,
      apiKey: mainSettings.apiKey,
      isMedia: false,
    };
  }

  const mediaProvider = MEDIA_PROVIDERS[route.provider];
  if (mediaProvider) {
    const mediaKeys = getMediaKeys();
    return {
      provider: route.provider,
      model: route.model || mediaProvider.defaultModel,
      apiKey: mediaKeys[mediaProvider.keyField] || mainSettings.apiKey,
      isMedia: true,
      mediaConfig: mediaProvider,
    };
  }

  const config = PROVIDER_CONFIGS[route.provider];
  if (!config) {
    return {
      provider: mainSettings.provider,
      model: mainSettings.model || PROVIDER_CONFIGS[mainSettings.provider]?.defaultModel,
      apiKey: mainSettings.apiKey,
      isMedia: false,
    };
  }

  return {
    provider: route.provider,
    model: route.model || config.defaultModel,
    apiKey: mainSettings.apiKey,
    isMedia: false,
  };
}

// ─── Provider Health Check ────────────────────────────────────────

export async function testProviderKey(provider, apiKey) {
  if (!apiKey) return { ok: false, error: 'No API key' };
  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
      });
      if (res.ok) return { ok: true };
      const err = await res.text().catch(() => '');
      if (err.includes('credit') || err.includes('billing')) return { ok: true, warning: 'Key valid but may have billing issues' };
      return { ok: false, error: `HTTP ${res.status}` };
    }
    if (provider === 'openai' || provider === 'openai-dalle' || provider === 'openai-tts') {
      const res = await fetch('https://api.openai.com/v1/models', { headers: { 'Authorization': `Bearer ${apiKey}` } });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    }
    if (provider === 'stability') {
      const res = await fetch('https://api.stability.ai/v1/user/account', { headers: { 'Authorization': `Bearer ${apiKey}` } });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    }
    if (provider === 'elevenlabs') {
      const res = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': apiKey } });
      return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, warning: 'No health check available for this provider' };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ─── Available Models for UI ──────────────────────────────────────

export function getModelsForTask(taskType) {
  const task = TASK_TYPES[taskType];
  if (!task) return [];
  if (task.category === 'media') {
    return Object.entries(MEDIA_PROVIDERS)
      .filter(([, p]) => p.type === taskType)
      .map(([key, p]) => ({ providerKey: key, providerName: p.name, models: p.models, defaultModel: p.defaultModel }));
  }
  return Object.entries(PROVIDER_CONFIGS).map(([key, p]) => ({ providerKey: key, providerName: p.name, models: p.models, defaultModel: p.defaultModel }));
}
