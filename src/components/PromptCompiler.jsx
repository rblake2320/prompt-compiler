import { useState, useCallback, useEffect } from 'react';
import { callClaude, robustJsonParse } from '../lib/claude';
import { DECOMPOSE_SYSTEM, SYNTHESIZE_SYSTEM, LAYER_META } from '../lib/prompts';

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('pc_history') || '[]');
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem('pc_history', JSON.stringify(history));
}

export default function PromptCompiler() {
  const [input, setInput] = useState('');
  const [layers, setLayers] = useState(null);
  const [synthesized, setSynthesized] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('layers');
  const [copied, setCopied] = useState(false);
  const [expandedLayer, setExpandedLayer] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => { setHistory(loadHistory()); }, []);

  const addToHistory = useCallback((taskInput, layersData, synthData) => {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      input: taskInput,
      layers: layersData,
      synthesized: synthData,
    };
    const updated = [entry, ...loadHistory()].slice(0, 50);
    saveHistory(updated);
    setHistory(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  }, []);

  const deleteFromHistory = useCallback((id) => {
    const updated = loadHistory().filter((e) => e.id !== id);
    saveHistory(updated);
    setHistory(updated);
  }, []);

  const loadEntry = useCallback((entry) => {
    setInput(entry.input);
    setLayers(entry.layers);
    setSynthesized(entry.synthesized);
    setActiveTab('layers');
    setShowHistory(false);
    setExpandedLayer(null);
  }, []);

  const exportEntry = useCallback((entry) => {
    const text = `# 6-Layer Prompt Compilation\n## Task\n${entry.input}\n\n## Layers\n${LAYER_META.map((m) => {
      const l = entry.layers?.[m.key];
      if (!l) return '';
      return `### ${m.icon} ${m.label}\n${l.analysis}\n${(l.elements || []).map((e) => `- ${e}`).join('\n')}`;
    }).join('\n\n')}\n\n## Compiled Prompt\n\`\`\`\n${entry.synthesized}\n\`\`\`\n`;
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-${entry.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const clearAllHistory = useCallback(() => {
    if (window.confirm('Delete all saved compilations?')) {
      saveHistory([]);
      setHistory([]);
    }
  }, []);

  const compile = useCallback(async () => {
    if (!input.trim()) return;
    setLoading(true); setError(''); setLayers(null); setSynthesized('');
    setActiveTab('layers'); setCopied(false); setExpandedLayer(null);
    try {
      setPhase('Phase 1/2 \u2014 Decomposing into 6 layers\u2026');
      const rawLayers = await callClaude(DECOMPOSE_SYSTEM, 'Task/Goal:\n' + input);
      const parsed = robustJsonParse(rawLayers);
      setLayers(parsed);
      setPhase('Phase 2/2 \u2014 Synthesizing compiled prompt\u2026');
      const synthInput = 'Original task: ' + input + '\n\n6-Layer Decomposition:\n' + JSON.stringify(parsed, null, 2);
      const rawSynth = await callClaude(SYNTHESIZE_SYSTEM, synthInput);
      const synthText = rawSynth.trim();
      setSynthesized(synthText);
      setActiveTab('layers');
      addToHistory(input, parsed, synthText);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setPhase(''); }
  }, [input, addToHistory]);

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const truncate = (s, n) => s.length > n ? s.slice(0, n) + '\u2026' : s;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              6-Layer Prompt Compiler
            </h1>
            <p className="text-gray-400 text-sm">
              Decompose any task into Prompt &middot; Context &middot; Intent &middot; Flow &middot; Eval &middot; Tool layers
            </p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              showHistory ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
            {history.length > 0 && (
              <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">{history.length}</span>
            )}
          </button>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-semibold text-gray-300">Saved Compilations</span>
              {history.length > 0 && (
                <button onClick={clearAllHistory} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                  Clear All
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">
                No compilations yet. Results auto-save when you compile.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors group">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadEntry(entry)}>
                      <p className="text-sm text-gray-200 truncate">{truncate(entry.input, 80)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(entry.timestamp)} &middot; {entry.synthesized?.length?.toLocaleString() || 0} chars</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); exportEntry(entry); }}
                        className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                        title="Export as Markdown"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(entry.synthesized); }}
                        className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                        title="Copy compiled prompt"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteFromHistory(entry.id); }}
                        className="p-1.5 rounded-md hover:bg-red-900/50 text-gray-400 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
          <label className="text-sm font-medium text-gray-300">Describe your task, goal, or idea</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "Build an AI agent that monitors Jira tickets, triages by severity, drafts responses, and escalates critical issues to Slack\u2026"'
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            rows={4}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) compile(); }}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Ctrl+Enter to compile</span>
              {savedNotice && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 animate-pulse">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Saved to history
                </span>
              )}
            </div>
            <button onClick={compile} disabled={loading || !input.trim()}
              className="px-5 py-2 bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">
              {loading ? (<span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                {phase}</span>) : '\u26a1 Compile Prompt'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-red-300 text-sm"><span className="font-semibold">Error: </span>{error}</div>}

        {/* Results */}
        {(layers || synthesized) && (
          <div className="space-y-4">
            <div className="flex gap-2 bg-gray-900 rounded-lg p-1 w-fit">
              {[{ id: 'layers', label: '\ud83e\udde9 6 Layers', ready: !!layers },
                { id: 'synthesized', label: '\u26a1 Compiled Prompt', ready: !!synthesized }].map((tab) => (
                <button key={tab.id} onClick={() => tab.ready && setActiveTab(tab.id)} disabled={!tab.ready}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-violet-600 text-white shadow' : tab.ready ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 cursor-not-allowed'}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'layers' && layers && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {LAYER_META.map((meta, idx) => {
                  const layer = layers[meta.key];
                  if (!layer) return null;
                  const isExpanded = expandedLayer === meta.key;
                  return (
                    <div key={meta.key} onClick={() => setExpandedLayer(isExpanded ? null : meta.key)}
                      className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-all space-y-2 ${isExpanded ? 'border-violet-500/50 ring-1 ring-violet-500/20' : 'border-gray-800 hover:border-gray-600'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">{idx + 1}</span>
                          <span className="text-lg">{meta.icon}</span>
                          <span className="font-semibold text-sm text-gray-200">{meta.label}</span>
                        </div>
                        <svg className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                      <p className="text-xs text-gray-500 italic">{meta.question}</p>
                      <p className="text-sm text-gray-300 leading-relaxed">{layer.analysis}</p>
                      {isExpanded && layer.elements && (
                        <ul className="space-y-1.5 pt-2 border-t border-gray-800">
                          {layer.elements.map((el, i) => (
                            <li key={i} className="text-xs text-gray-400 flex gap-2">
                              <span className="text-violet-400 mt-0.5 shrink-0">&rsaquo;</span>
                              <span>{el}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'synthesized' && synthesized && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-300">Production-Ready Prompt</span>
                    <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full">{synthesized.length.toLocaleString()} chars</span>
                  </div>
                  <button onClick={() => copyToClipboard(synthesized)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${copied ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'}`}>
                    {copied ? '\u2713 Copied!' : '\ud83d\udccb Copy Prompt'}
                  </button>
                </div>
                <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-950 rounded-lg p-4 border border-gray-800 max-h-[32rem] overflow-y-auto font-mono selection:bg-violet-500/30">
                  {synthesized}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Idle */}
        {!layers && !synthesized && !loading && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-4 font-semibold">The 6-Layer Stack</p>
            <div className="space-y-2.5">
              {LAYER_META.map((m, i) => (
                <div key={m.key} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">{i + 1}</span>
                  <span className="text-lg">{m.icon}</span>
                  <span className="font-medium text-gray-300 w-52">{m.label}</span>
                  <span className="text-gray-500 text-xs md:text-sm">{m.question}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-600">Two-phase compilation: structured JSON decomposition &rarr; plain-text synthesis</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
