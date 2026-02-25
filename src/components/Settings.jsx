import { useState } from 'react';
import { getSettings, saveSettings, PROVIDER_CONFIGS } from '../lib/settings';
import { callClaude } from '../lib/claude';

export default function Settings({ onClose }) {
  const [s, setS] = useState(getSettings);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');

  const config = PROVIDER_CONFIGS[s.provider] || PROVIDER_CONFIGS.anthropic;
  const activeModel = s.model || config.defaultModel;

  const handleProviderChange = (provider) => {
    setS({ ...s, provider, model: PROVIDER_CONFIGS[provider].defaultModel });
    setTestResult('');
  };

  const handleSave = () => {
    saveSettings(s);
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('');
    saveSettings(s);
    try {
      const result = await callClaude(
        'You are a test assistant. Keep responses under 10 words.',
        'Reply with exactly: Connection successful'
      );
      setTestResult(result.length > 0 ? '✓ ' + result.slice(0, 100) : '? Empty response');
    } catch (e) {
      setTestResult('✗ ' + e.message.slice(0, 150));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">AI Provider Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Provider */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => handleProviderChange(key)}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-all ${
                  s.provider === key
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {cfg.name}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Model</label>
          <select
            value={activeModel}
            onChange={(e) => setS({ ...s, model: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-violet-500 transition-colors"
          >
            {config.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            API Key{' '}
            <span className="text-gray-600 normal-case font-normal">
              — leave blank to use server key
            </span>
          </label>
          <input
            type="password"
            value={s.apiKey || ''}
            onChange={(e) => setS({ ...s, apiKey: e.target.value })}
            placeholder={
              s.provider === 'anthropic' ? 'sk-ant-...' :
              s.provider === 'groq' ? 'gsk_...' : 'sk-...'
            }
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm font-mono focus:outline-none focus:border-violet-500 transition-colors placeholder-gray-600"
          />
          <p className="text-xs text-gray-600">Stored only in your browser — never sent to our servers.</p>
        </div>

        {/* Test Result */}
        {testResult && (
          <div
            className={`text-xs rounded-lg px-3 py-2.5 font-mono leading-relaxed border ${
              testResult.startsWith('✓')
                ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-400'
                : 'bg-red-950/60 border-red-800/60 text-red-400'
            }`}
          >
            {testResult}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex-1 py-2 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {testing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Testing…
              </span>
            ) : 'Test Connection'}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 px-4 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
