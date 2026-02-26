import { useState } from 'react';
import { getSettings, saveSettings, PROVIDER_CONFIGS } from '../lib/settings';
import { callClaude } from '../lib/claude';
import { TASK_TYPES, MEDIA_PROVIDERS, getRouterConfig, saveRouterConfig, getMediaKeys, saveMediaKeys } from '../lib/router';

export default function Settings({ onClose }) {
  const [s, setS] = useState(getSettings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [tab, setTab] = useState('general');
  const [routes, setRoutes] = useState(getRouterConfig);
  const [mediaKeys, setMediaKeys] = useState(getMediaKeys);

  const config = PROVIDER_CONFIGS[s.provider] || PROVIDER_CONFIGS.anthropic;
  const activeModel = s.model || config.defaultModel;

  const handleProviderChange = (provider) => {
    setS({ ...s, provider, model: PROVIDER_CONFIGS[provider].defaultModel });
    setTestResult('');
  };

  const handleSave = () => {
    saveSettings(s);
    saveRouterConfig(routes);
    saveMediaKeys(mediaKeys);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('');
    saveSettings(s);
    try {
      const result = await callClaude('You are a test assistant. Keep responses under 10 words.', 'Reply with exactly: Connection successful');
      setTestResult(result.length > 0 ? '✓ ' + result.slice(0, 100) : '? Empty response');
    } catch (e) {
      setTestResult('✗ ' + e.message.slice(0, 150));
    } finally { setTesting(false); }
  };

  const updateRoute = (taskType, field, value) => {
    setRoutes(prev => ({ ...prev, [taskType]: { ...prev[taskType], [field]: value } }));
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'router', label: 'Model Router' },
    { id: 'media', label: 'Media Keys' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors">✕</button>
        </div>

        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${tab === t.id ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Default Provider</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => (
                  <button key={key} onClick={() => handleProviderChange(key)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${s.provider === key ? 'bg-violet-600 border-violet-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {cfg.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Default Model</label>
              <select value={activeModel} onChange={(e) => setS({ ...s, model: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-violet-500">
                {config.models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                API Key <span className="text-gray-600 normal-case font-normal">— leave blank for server key</span>
              </label>
              <input type="password" value={s.apiKey || ''} onChange={(e) => setS({ ...s, apiKey: e.target.value })}
                placeholder={s.provider === 'anthropic' ? 'sk-ant-...' : s.provider === 'groq' ? 'gsk_...' : 'sk-...'}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono focus:outline-none focus:border-violet-500 placeholder-gray-600" />
              <p className="text-xs text-gray-600">Stored only in your browser.</p>
            </div>

            {testResult && (
              <div className={`text-xs rounded-lg px-3 py-2.5 font-mono border ${testResult.startsWith('✓') ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400' : 'bg-red-950/60 border-red-800/60 text-red-400'}`}>
                {testResult}
              </div>
            )}

            <button onClick={handleTest} disabled={testing}
              className="w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50">
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>
        )}

        {tab === 'router' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Assign different models to different tasks. Leave blank to use the default provider.</p>
            {Object.entries(TASK_TYPES).map(([key, task]) => {
              const route = routes[key] || {};
              const isMedia = task.category === 'media';
              const filteredProviders = isMedia
                ? Object.entries(MEDIA_PROVIDERS).filter(([, p]) => {
                    if (key === 'image') return p.type === 'image';
                    if (key === 'speech') return p.type === 'speech';
                    if (key === 'audio') return p.type === 'audio';
                    return false;
                  })
                : Object.entries(PROVIDER_CONFIGS);
              const selectedProvider = route.provider || '';
              const providerConfig = isMedia ? MEDIA_PROVIDERS[selectedProvider] : PROVIDER_CONFIGS[selectedProvider];
              const models = providerConfig?.models || [];
              return (
                <div key={key} className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{task.icon}</span>
                    <span className="text-sm font-medium text-gray-200">{task.label}</span>
                    <span className="text-xs text-gray-500 ml-auto">{task.category}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={selectedProvider} onChange={(e) => updateRoute(key, 'provider', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-500">
                      <option value="">Default</option>
                      {filteredProviders.map(([pk, pv]) => (<option key={pk} value={pk}>{pv.name}</option>))}
                    </select>
                    <select value={route.model || ''} onChange={(e) => updateRoute(key, 'model', e.target.value)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-violet-500">
                      <option value="">Default</option>
                      {models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'media' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Add API keys for media generation providers. OpenAI key is shared with text generation if already set.</p>
            {[
              { key: 'openai', label: 'OpenAI (DALL-E + TTS)', placeholder: 'sk-...', note: 'Shared with text provider if set above' },
              { key: 'stability', label: 'Stability AI', placeholder: 'sk-...', note: 'For Stable Diffusion image generation' },
              { key: 'elevenlabs', label: 'ElevenLabs', placeholder: 'xi-...', note: 'For high-quality text-to-speech' },
            ].map(({ key, label, placeholder, note }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</label>
                <input type="password" value={mediaKeys[key] || ''} onChange={(e) => setMediaKeys({ ...mediaKeys, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono focus:outline-none focus:border-violet-500 placeholder-gray-600" />
                <p className="text-xs text-gray-600">{note}</p>
              </div>
            ))}
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
              <h4 className="text-xs font-semibold text-gray-400 uppercase">Available Capabilities</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: 'Image Gen (DALL-E)', ok: !!(mediaKeys.openai || s.apiKey) },
                  { label: 'Image Gen (Stability)', ok: !!mediaKeys.stability },
                  { label: 'TTS (OpenAI)', ok: !!(mediaKeys.openai || s.apiKey) },
                  { label: 'TTS (ElevenLabs)', ok: !!mediaKeys.elevenlabs },
                ].map(({ label, ok }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                    <span className={ok ? 'text-gray-300' : 'text-gray-600'}>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <button onClick={handleSave}
          className="w-full py-2.5 px-4 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors">
          Save All & Close
        </button>
      </div>
    </div>
  );
}
