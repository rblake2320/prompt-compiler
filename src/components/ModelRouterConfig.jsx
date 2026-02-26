import { useState, useEffect } from 'react';
import {
  TASK_TYPES,
  ALL_MODELS,
  getRouterConfig,
  setRoute,
  getApiKeys,
  saveApiKeys,
} from '../lib/modelRouter';
import { getSettings } from '../lib/settings';

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  groq: 'Groq',
  gemini: 'Gemini',
  stability: 'Stability AI',
  elevenlabs: 'ElevenLabs',
};

const API_KEY_PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'openai', label: 'OpenAI (GPT + DALL-E + TTS)', placeholder: 'sk-...' },
  { id: 'groq', label: 'Groq', placeholder: 'gsk_...' },
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...' },
  { id: 'stability', label: 'Stability AI (Images)', placeholder: 'sk-...' },
  { id: 'elevenlabs', label: 'ElevenLabs (TTS)', placeholder: 'xi-...' },
];

export default function ModelRouterConfig({ onClose }) {
  const [tab, setTab] = useState('routes'); // routes | keys
  const [config, setConfig] = useState(getRouterConfig);
  const [keys, setKeys] = useState(getApiKeys);
  const [showKey, setShowKey] = useState({});
  const [saved, setSaved] = useState('');

  const globalSettings = getSettings();

  function handleRouteChange(taskId, provider, model) {
    const updated = setRoute(taskId, provider, model);
    setConfig(updated);
    flash('Route saved');
  }

  function handleKeyChange(provider, value) {
    const updated = { ...keys, [provider]: value };
    setKeys(updated);
    saveApiKeys(updated);
  }

  function flash(msg) {
    setSaved(msg);
    setTimeout(() => setSaved(''), 1500);
  }

  function getModelsForProvider(provider, category) {
    const models = ALL_MODELS[provider] || [];
    if (category) return models.filter(m => m.category === category);
    return models.filter(m => !m.category);
  }

  function hasKeyForProvider(provider) {
    if (keys[provider]) return true;
    if (provider === globalSettings.provider && globalSettings.apiKey) return true;
    return false;
  }

  const textTasks = TASK_TYPES.filter(t => t.category === 'text');
  const mediaTasks = TASK_TYPES.filter(t => t.category === 'media');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-gray-100">\u2699\ufe0f Model Router</h2>
            <p className="text-xs text-gray-500">Assign different AI models to different task types</p>
          </div>
          <div className="flex items-center gap-2">
            {saved && <span className="text-xs text-emerald-400">\u2713 {saved}</span>}
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">\u2715</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3">
          {[{ id: 'routes', label: '\ud83d\udcca Task Routes' }, { id: 'keys', label: '\ud83d\udd11 API Keys' }].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
                tab === t.id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {tab === 'routes' && (
            <>
              {/* Text Tasks */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-3">\ud83d\udcdd Text / Code Tasks</h3>
                <div className="space-y-2">
                  {textTasks.map(task => {
                    const route = config[task.id] || {};
                    return (
                      <div key={task.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2.5">
                        <span className="text-lg w-8 text-center">{task.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-200">{task.label}</div>
                          <div className="text-xs text-gray-500">{task.description}</div>
                        </div>
                        <select
                          value={route.provider || 'anthropic'}
                          onChange={e => {
                            const prov = e.target.value;
                            const models = getModelsForProvider(prov);
                            handleRouteChange(task.id, prov, models[0]?.id || '');
                          }}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
                        >
                          {['anthropic', 'openai', 'groq', 'gemini'].map(p => (
                            <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                          ))}
                        </select>
                        <select
                          value={route.model || ''}
                          onChange={e => handleRouteChange(task.id, route.provider || 'anthropic', e.target.value)}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-48"
                        >
                          {getModelsForProvider(route.provider || 'anthropic').map(m => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                        {!hasKeyForProvider(route.provider || 'anthropic') && (
                          <span className="text-xs text-amber-400" title="No API key set">\u26a0\ufe0f</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Media Tasks */}
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-3">\ud83c\udfa8 Media Generation Tasks</h3>
                <div className="space-y-2">
                  {mediaTasks.map(task => {
                    const route = config[task.id] || {};
                    const mediaCategory = task.id === 'image' ? 'image' : task.id === 'tts' ? 'tts' : null;
                    const availableProviders = task.id === 'image'
                      ? ['openai', 'stability']
                      : task.id === 'tts'
                      ? ['openai', 'elevenlabs']
                      : ['custom'];

                    return (
                      <div key={task.id} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2.5">
                        <span className="text-lg w-8 text-center">{task.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-200">{task.label}</div>
                          <div className="text-xs text-gray-500">{task.description}</div>
                        </div>
                        <select
                          value={route.provider || availableProviders[0]}
                          onChange={e => {
                            const prov = e.target.value;
                            const models = ALL_MODELS[prov]?.filter(m => m.category === mediaCategory) || [];
                            handleRouteChange(task.id, prov, models[0]?.id || '');
                          }}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300"
                        >
                          {availableProviders.map(p => (
                            <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
                          ))}
                        </select>
                        <select
                          value={route.model || ''}
                          onChange={e => handleRouteChange(task.id, route.provider || availableProviders[0], e.target.value)}
                          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 w-48"
                        >
                          {(ALL_MODELS[route.provider || availableProviders[0]] || [])
                            .filter(m => m.category === mediaCategory)
                            .map(m => (
                              <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                          {task.id === 'audio' && <option value="">Not configured</option>}
                        </select>
                        {!hasKeyForProvider(route.provider || availableProviders[0]) && (
                          <span className="text-xs text-amber-400" title="No API key set">\u26a0\ufe0f</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gray-800/30 rounded-lg px-3 py-2 text-xs text-gray-500">
                \ud83d\udca1 <strong>Tip:</strong> Use fast/cheap models (Haiku, GPT-4o-mini) for chat and summarization. Use powerful models (Sonnet, GPT-4o) for code generation. Media routes require separate API keys.
              </div>
            </>
          )}

          {tab === 'keys' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">API keys are stored in your browser's localStorage. They're never sent to our servers \u2014 API calls go directly from your browser to each provider.</p>
              {API_KEY_PROVIDERS.map(prov => (
                <div key={prov.id} className="bg-gray-800/50 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-medium text-gray-300">{prov.label}</label>
                    <div className="flex items-center gap-2">
                      {prov.id === globalSettings.provider && globalSettings.apiKey && (
                        <span className="text-xs text-cyan-400">Using Settings key</span>
                      )}
                      {hasKeyForProvider(prov.id) && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type={showKey[prov.id] ? 'text' : 'password'}
                      value={keys[prov.id] || ''}
                      onChange={e => handleKeyChange(prov.id, e.target.value)}
                      placeholder={prov.placeholder}
                      className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-300 font-mono placeholder-gray-600 focus:outline-none focus:border-violet-500"
                    />
                    <button
                      onClick={() => setShowKey(prev => ({ ...prev, [prov.id]: !prev[prov.id] }))}
                      className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-400 rounded transition-colors"
                    >{showKey[prov.id] ? 'Hide' : 'Show'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
