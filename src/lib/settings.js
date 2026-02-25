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
};

const DEFAULTS = { provider: 'anthropic', model: '', apiKey: '' };

export function getSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('pc_settings') || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem('pc_settings', JSON.stringify(settings));
}
