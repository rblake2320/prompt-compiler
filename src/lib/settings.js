export const PROVIDER_CONFIGS = {
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    proxyPath: '/api/proxy/anthropic',
    authType: 'anthropic',
    models: [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-haiku-4-5-20251001',
    ],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    proxyPath: '/api/proxy/openai',
    authType: 'bearer',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini'],
    defaultModel: 'gpt-4o',
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai',
    proxyPath: '/api/proxy/groq',
    authType: 'bearer',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    proxyPath: '/api/proxy/gemini',
    authType: 'bearer',
    models: [
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
    ],
    defaultModel: 'gemini-2.0-flash',
  },
};

const SETTINGS_DEFAULTS = { provider: 'anthropic', model: '', apiKey: '' };

export function getSettings() {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem('pc_settings') || '{}') };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem('pc_settings', JSON.stringify(settings));
}

export function getActiveLayers() {
  try {
    const v = localStorage.getItem('pc_active_layers');
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}

export function saveActiveLayers(keys) {
  localStorage.setItem('pc_active_layers', JSON.stringify(keys));
}

export function getCustomLayers() {
  try {
    return JSON.parse(localStorage.getItem('pc_custom_layers') || '[]');
  } catch { return []; }
}

export function saveCustomLayers(layers) {
  localStorage.setItem('pc_custom_layers', JSON.stringify(layers));
}
