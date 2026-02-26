import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { callClaude, streamClaudeWithHistory, agenticToolCall, robustJsonParse } from '../lib/claude';
import {
  buildDecomposeSystem,
  buildSynthesizeSystem,
  DEFAULT_LAYERS,
} from '../lib/prompts';
import {
  getActiveLayers,
  saveActiveLayers,
  getCustomLayers,
  saveCustomLayers,
} from '../lib/settings';
import { createProject, updateProject, saveVersion } from '../lib/projects';
import { BUILT_IN_TOOLS, getAllTools } from '../lib/tools';
import { injectAssetIntoHtml } from '../lib/assetManager';
import Settings from './Settings';
import LayerCard from './LayerCard';
import AddLayerModal from './AddLayerModal';
import OutputView from './OutputView';
import ProjectManager from './ProjectManager';
import ToolConfig from './ToolConfig';
import ModelRouterConfig from './ModelRouterConfig';
import AssetPanel from './AssetPanel';
import ContextIndicator from './ContextIndicator';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem('pc_history') || '[]'); }
  catch { return []; }
}
function saveHistory(h) { localStorage.setItem('pc_history', JSON.stringify(h)); }

export default function PromptCompiler() {
  const [input, setInput] = useState('');
  const [layers, setLayers] = useState(null);
  const [synthesized, setSynthesized] = useState('');
  const [layersEdited, setLayersEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('');
  const [resynthLoading, setResynthLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('layers');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddLayer, setShowAddLayer] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Execution state
  const [conversation, setConversation] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const abortRef = useRef(null);

  // Project state
  const [currentProject, setCurrentProject] = useState(null);
  const [currentHtml, setCurrentHtml] = useState('');
  const [showProjects, setShowProjects] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showModelRouter, setShowModelRouter] = useState(false);
  const [projectNotice, setProjectNotice] = useState('');
  const [changeLog, setChangeLog] = useState([]);

  // Assets state
  const [assets, setAssets] = useState([]);
  const [showAssets, setShowAssets] = useState(false);

  // Context tracking
  const [contextStats, setContextStats] = useState(null);

  // Tool activity feed
  const [toolActivity, setToolActivity] = useState([]);

  // Layer config
  const [customLayers, setCustomLayers] = useState(getCustomLayers);
  const [selectedKeys, setSelectedKeys] = useState(() => {
    const saved = getActiveLayers();
    return saved || DEFAULT_LAYERS.map(l => l.key);
  });

  const allLayers = useMemo(() => [...DEFAULT_LAYERS, ...customLayers], [customLayers]);
  const activeLayers = useMemo(
    () => allLayers.filter(l => selectedKeys.includes(l.key)),
    [allLayers, selectedKeys]
  );

  useEffect(() => { setHistory(loadHistory()); }, []);
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // Layer selection helpers
  const toggleLayer = useCallback((key) => {
    setSelectedKeys(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      if (next.length === 0) return prev;
      saveActiveLayers(next);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const all = allLayers.map(l => l.key);
    setSelectedKeys(all);
    saveActiveLayers(all);
  }, [allLayers]);

  const selectNone = useCallback(() => {
    const first = [allLayers[0]?.key].filter(Boolean);
    setSelectedKeys(first);
    saveActiveLayers(first);
  }, [allLayers]);

  const addCustomLayer = useCallback((meta) => {
    const updated = [...getCustomLayers(), meta];
    saveCustomLayers(updated);
    setCustomLayers(updated);
    setSelectedKeys(prev => {
      const next = [...prev, meta.key];
      saveActiveLayers(next);
      return next;
    });
  }, []);

  const deleteCustomLayer = useCallback((key) => {
    const updated = getCustomLayers().filter(l => l.key !== key);
    saveCustomLayers(updated);
    setCustomLayers(updated);
    setSelectedKeys(prev => {
      const next = prev.filter(k => k !== key);
      const fallback = DEFAULT_LAYERS.map(l => l.key);
      const final = next.length > 0 ? next : fallback;
      saveActiveLayers(final);
      return final;
    });
  }, []);

  // History helpers
  const addToHistory = useCallback((taskInput, layersData, synthData, usedLayers) => {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      input: taskInput,
      layers: layersData,
      synthesized: synthData,
      layerKeys: usedLayers.map(l => l.key),
    };
    const updated = [entry, ...loadHistory()].slice(0, 50);
    saveHistory(updated);
    setHistory(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  }, []);

  const deleteFromHistory = useCallback((id) => {
    const updated = loadHistory().filter(e => e.id !== id);
    saveHistory(updated);
    setHistory(updated);
  }, []);

  const loadEntry = useCallback((entry) => {
    setInput(entry.input);
    setLayers(entry.layers);
    setSynthesized(entry.synthesized);
    setLayersEdited(false);
    setActiveTab('layers');
    setShowHistory(false);
    setConversation([]);
    setStreamingText('');
    if (entry.layerKeys) {
      setSelectedKeys(entry.layerKeys);
      saveActiveLayers(entry.layerKeys);
    }
  }, []);

  const exportEntry = useCallback((entry) => {
    const usedMetas = allLayers.filter(m => (entry.layerKeys || allLayers.map(l => l.key)).includes(m.key));
    const lines = [];
    lines.push('# Prompt Compilation');
    lines.push('## Task');
    lines.push(entry.input);
    lines.push('');
    lines.push('## Layers');
    usedMetas.forEach(m => {
      const l = entry.layers?.[m.key];
      if (!l) return;
      lines.push('### ' + m.icon + ' ' + m.label);
      lines.push(l.analysis);
      (l.elements || []).forEach(e => lines.push('- ' + e));
      lines.push('');
    });
    lines.push('## Compiled Prompt');
    lines.push('```');
    lines.push(entry.synthesized);
    lines.push('```');
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prompt-' + entry.id + '.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [allLayers]);

  const clearAllHistory = useCallback(() => {
    if (window.confirm('Delete all saved compilations?')) {
      saveHistory([]);
      setHistory([]);
    }
  }, []);

  // ─── Project helpers ──────────────────────────────────────────

  const saveCurrentAsProject = useCallback(async (convo, html) => {
    try {
      if (currentProject) {
        const updated = await updateProject(currentProject.id, {
          conversation: convo,
          currentHtml: html || currentHtml,
          compiledPrompt: synthesized,
          assets,
        });
        setCurrentProject(updated);
        setProjectNotice('Project saved');
      } else {
        const project = await createProject({
          name: input.slice(0, 60),
          input,
          compiledPrompt: synthesized,
          layers,
          layerKeys: activeLayers.map(l => l.key),
          currentHtml: html || currentHtml,
          conversation: convo,
          assets,
        });
        setCurrentProject(project);
        setProjectNotice('Project created');
      }
      setTimeout(() => setProjectNotice(''), 2000);
    } catch (e) {
      console.error('Failed to save project', e);
    }
  }, [currentProject, currentHtml, synthesized, input, layers, activeLayers, assets]);

  const handleUpdateHtml = useCallback((html, changelog) => {
    setCurrentHtml(html);
    setChangeLog(prev => [...prev, { time: new Date().toISOString(), text: changelog }]);
  }, []);

  const handleAssetCreated = useCallback((asset) => {
    setAssets(prev => [...prev, asset]);
    setToolActivity(prev => [...prev, {
      time: new Date().toISOString(),
      type: asset.type === 'image' ? 'image_generated' : 'speech_generated',
      name: asset.name,
      provider: asset.provider,
    }]);
  }, []);

  const handleInjectAsset = useCallback((asset) => {
    if (!currentHtml) return;
    const updated = injectAssetIntoHtml(currentHtml, asset);
    if (updated !== currentHtml) {
      handleUpdateHtml(updated, `Injected ${asset.type}: ${asset.name}`);
    }
  }, [currentHtml, handleUpdateHtml]);

  const handleRemoveAsset = useCallback((assetId) => {
    setAssets(prev => prev.filter(a => a.id !== assetId));
  }, []);

  const loadProject = useCallback((project) => {
    setInput(project.input || '');
    setLayers(project.layers || null);
    setSynthesized(project.compiledPrompt || '');
    setConversation(project.conversation || []);
    setCurrentHtml(project.currentHtml || '');
    setCurrentProject(project);
    setAssets(project.assets || []);
    setActiveTab(project.conversation?.length > 0 ? 'output' : project.compiledPrompt ? 'synthesized' : 'layers');
    setShowProjects(false);
    setLayersEdited(false);
    if (project.layerKeys) {
      setSelectedKeys(project.layerKeys);
      saveActiveLayers(project.layerKeys);
    }
  }, []);

  const handleSaveVersion = useCallback(async () => {
    if (!currentProject) return;
    const label = window.prompt('Version label:', `v${(currentProject.versions?.length || 0) + 1}`);
    if (!label) return;
    const updated = await saveVersion(currentProject.id, label);
    setCurrentProject(updated);
    setProjectNotice('Version saved');
    setTimeout(() => setProjectNotice(''), 2000);
  }, [currentProject]);

  // ─── Compile ──────────────────────────────────────────────────

  const compile = useCallback(async () => {
    if (!input.trim() || activeLayers.length === 0) return;
    setLoading(true);
    setError('');
    setLayers(null);
    setSynthesized('');
    setActiveTab('layers');
    setCopied(false);
    setLayersEdited(false);
    setConversation([]);
    setStreamingText('');
    setCurrentHtml('');
    setChangeLog([]);
    setAssets([]);
    setToolActivity([]);
    try {
      setPhase(`Phase 1/2 \u2014 Decomposing into ${activeLayers.length} layer${activeLayers.length === 1 ? '' : 's'}\u2026`);
      const rawLayers = await callClaude(buildDecomposeSystem(activeLayers), 'Task/Goal:\n' + input, 'compile');
      const parsed = robustJsonParse(rawLayers);
      setLayers(parsed);
      setPhase('Phase 2/2 \u2014 Synthesizing compiled prompt\u2026');
      const synthInput = 'Original task: ' + input + '\n\nLayer Decomposition:\n' + JSON.stringify(parsed, null, 2);
      const rawSynth = await callClaude(buildSynthesizeSystem(activeLayers), synthInput, 'compile');
      setSynthesized(rawSynth.trim());
      addToHistory(input, parsed, rawSynth.trim(), activeLayers);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setPhase(''); }
  }, [input, activeLayers, addToHistory]);

  // Re-synthesize after layer edits
  const resynthesize = useCallback(async () => {
    if (!layers) return;
    setResynthLoading(true);
    setError('');
    try {
      const synthInput = 'Original task: ' + input + '\n\nLayer Decomposition:\n' + JSON.stringify(layers, null, 2);
      const rawSynth = await callClaude(buildSynthesizeSystem(activeLayers), synthInput, 'compile');
      setSynthesized(rawSynth.trim());
      setLayersEdited(false);
      setActiveTab('synthesized');
    } catch (e) { setError(e.message); }
    finally { setResynthLoading(false); }
  }, [layers, input, activeLayers]);

  // Build system prompt with project context
  const buildProjectSystemPrompt = useCallback(() => {
    let sys = synthesized;
    if (currentHtml) {
      sys += '\n\n<current_project_html>\n' + currentHtml + '\n</current_project_html>';
      sys += '\n\nIMPORTANT: The user has a live project. When they ask for changes, provide the COMPLETE updated HTML document. Do not provide partial snippets \u2014 always include the full <!DOCTYPE html> to </html> so the preview can render it.';
    }
    if (assets.length > 0) {
      sys += '\n\n<project_assets>\n' +
        assets.map(a => `- ${a.type}: "${a.name}" (${a.provider}) [id:${a.id}]`).join('\n') +
        '\n</project_assets>\nYou can reference these assets by name. Use the generate_image or generate_speech tools to create new media assets.';
    }
    if (changeLog.length > 0) {
      sys += '\n\n<change_history>\n' + changeLog.slice(-10).map(c => `- ${c.text}`).join('\n') + '\n</change_history>';
    }
    return sys;
  }, [synthesized, currentHtml, changeLog, assets]);

  // ─── Run Prompt (streaming) ───────────────────────────────────

  const runPrompt = useCallback(async () => {
    if (!synthesized || !input.trim()) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunLoading(true);
    setError('');
    setStreamingText('');
    const userMsg = { role: 'user', content: input };
    const newConvo = [userMsg];
    setConversation(newConvo);
    setActiveTab('output');

    let accumulated = '';
    try {
      const result = await streamClaudeWithHistory(
        buildProjectSystemPrompt(),
        newConvo,
        (chunk) => {
          accumulated += chunk;
          setStreamingText(accumulated);
        },
        controller.signal,
        { taskType: 'code' }
      );
      const fullText = result.fullText || result;
      setContextStats(result.contextStats || null);
      const finalConvo = [userMsg, { role: 'assistant', content: fullText }];
      setConversation(finalConvo);
      setStreamingText('');

      // Auto-extract HTML
      const htmlMatch = fullText.match(/```html\n([\s\S]*?)```/);
      if (htmlMatch && htmlMatch[1].includes('<!DOCTYPE')) {
        const newHtml = htmlMatch[1].trimEnd();
        setCurrentHtml(newHtml);
        setChangeLog([{ time: new Date().toISOString(), text: 'Initial generation' }]);
        saveCurrentAsProject(finalConvo, newHtml);
      } else {
        saveCurrentAsProject(finalConvo, currentHtml);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
      if (accumulated) {
        const finalConvo = [userMsg, { role: 'assistant', content: accumulated }];
        setConversation(finalConvo);
        setStreamingText('');
      }
    } finally {
      setRunLoading(false);
      abortRef.current = null;
    }
  }, [synthesized, input, buildProjectSystemPrompt, currentHtml, saveCurrentAsProject]);

  // ─── Follow-up with context management ────────────────────────

  const sendFollowUp = useCallback(async (text) => {
    if (!text.trim() || !synthesized) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunLoading(true);
    setError('');
    setStreamingText('');
    const userMsg = { role: 'user', content: text };
    const updatedConvo = [...conversation, userMsg];
    setConversation(updatedConvo);

    let accumulated = '';
    try {
      const result = await streamClaudeWithHistory(
        buildProjectSystemPrompt(),
        updatedConvo,
        (chunk) => {
          accumulated += chunk;
          setStreamingText(accumulated);
        },
        controller.signal,
        { taskType: undefined } // Auto-detect from message
      );
      const fullText = result.fullText || result;
      setContextStats(result.contextStats || null);
      const finalConvo = [...updatedConvo, { role: 'assistant', content: fullText }];
      setConversation(finalConvo);
      setStreamingText('');

      // Extract HTML from latest response and update project
      const htmlMatch = fullText.match(/```html\n([\s\S]*?)```/);
      if (htmlMatch && htmlMatch[1].includes('<!DOCTYPE')) {
        const newHtml = htmlMatch[1].trimEnd();
        setCurrentHtml(newHtml);
        setChangeLog(prev => [...prev, { time: new Date().toISOString(), text: 'Updated via follow-up' }]);
        saveCurrentAsProject(finalConvo, newHtml);
      } else {
        saveCurrentAsProject(finalConvo, currentHtml);
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
      if (accumulated) {
        setConversation([...updatedConvo, { role: 'assistant', content: accumulated }]);
        setStreamingText('');
      }
    } finally {
      setRunLoading(false);
      abortRef.current = null;
    }
  }, [conversation, synthesized, buildProjectSystemPrompt, currentHtml, saveCurrentAsProject]);

  const clearConversation = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setConversation([]);
    setStreamingText('');
    setToolActivity([]);
  }, []);

  const handlePreviewErrors = useCallback((errors) => {
    if (errors.length === 0) return;
    const errorMsg = 'The preview detected these errors:\n' + errors.map(e => `- ${e}`).join('\n') + '\n\nPlease fix these issues and provide the complete updated HTML.';
    sendFollowUp(errorMsg);
  }, [sendFollowUp]);

  const handleLayerSave = useCallback((key, draft) => {
    setLayers(prev => ({ ...prev, [key]: draft }));
    setLayersEdited(true);
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setLayers(null);
    setSynthesized('');
    setError('');
    setPhase('');
    setLayersEdited(false);
    setActiveTab('layers');
    setCopied(false);
    setConversation([]);
    setStreamingText('');
    setCurrentProject(null);
    setCurrentHtml('');
    setChangeLog([]);
    setAssets([]);
    setToolActivity([]);
    setContextStats(null);
  }, []);

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const formatDate = (iso) => {
    const d = new Date(iso), now = new Date(), diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const truncate = (s, n) => s.length > n ? s.slice(0, n) + '\u2026' : s;

  const hasResults = !!(layers || synthesized);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4">
            {hasResults && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                New Task
              </button>
            )}
            <div className="space-y-0.5">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
                Prompt Compiler
              </h1>
              <p className="text-gray-400 text-sm">
                {currentProject ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Project: {currentProject.name}
                    {projectNotice && <span className="text-emerald-400 text-xs ml-2">{'\u2713'} {projectNotice}</span>}
                  </span>
                ) : (
                  `${activeLayers.length}-layer AI prompt decomposition & synthesis`
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {currentProject && (
              <button
                onClick={handleSaveVersion}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 transition-all border border-emerald-800/50"
                title="Save version snapshot"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save Version
              </button>
            )}
            {assets.length > 0 && (
              <button
                onClick={() => setShowAssets(!showAssets)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  showAssets ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
                title="Project Assets"
              >
                {'\ud83d\udcce'} Assets
                <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">{assets.length}</span>
              </button>
            )}
            <button
              onClick={() => setShowModelRouter(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              title="Model Router \u2014 assign models to tasks"
            >
              {'\ud83e\udde0'} Router
            </button>
            <button
              onClick={() => setShowTools(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              title="Tools & Integrations"
            >
              {'\ud83d\udd27'} Tools
            </button>
            <button
              onClick={() => setShowProjects(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              title="Saved Projects"
            >
              {'\ud83d\udcc1'} Projects
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
              title="AI Provider Settings"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                showHistory ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {history.length > 0 && (
                <span className="bg-gray-700 text-gray-300 text-xs px-1.5 py-0.5 rounded-full">{history.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Tool Activity Feed */}
        {toolActivity.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {toolActivity.slice(-5).map((activity, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800/50 border border-gray-700/50 rounded-full text-xs shrink-0">
                <span>{activity.type === 'image_generated' ? '\ud83c\udfa8' : '\ud83d\udd0a'}</span>
                <span className="text-gray-400">{activity.name}</span>
                <span className="text-gray-600">via {activity.provider}</span>
              </div>
            ))}
          </div>
        )}

        {/* Asset Panel (toggle) */}
        {showAssets && (
          <AssetPanel
            assets={assets}
            onInjectAsset={handleInjectAsset}
            onRemoveAsset={handleRemoveAsset}
            onClose={() => setShowAssets(false)}
          />
        )}

        {/* History Panel */}
        {showHistory && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-sm font-semibold text-gray-300">Saved Compilations</span>
              {history.length > 0 && (
                <button onClick={clearAllHistory} className="text-xs text-red-400 hover:text-red-300 transition-colors">Clear All</button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="p-6 text-center text-gray-500 text-sm">No compilations yet. Results auto-save when you compile.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-800">
                {history.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors group">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => loadEntry(entry)}>
                      <p className="text-sm text-gray-200 truncate">{truncate(entry.input, 80)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDate(entry.timestamp)} {'\u00b7'} {entry.layerKeys?.length || 6} layers {'\u00b7'} {entry.synthesized?.length?.toLocaleString() || 0} chars
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={e => { e.stopPropagation(); exportEntry(entry); }}
                        className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors" title="Export as Markdown">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      <button onClick={e => { e.stopPropagation(); copyToClipboard(entry.synthesized); }}
                        className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors" title="Copy compiled prompt">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button onClick={e => { e.stopPropagation(); deleteFromHistory(entry.id); }}
                        className="p-1.5 rounded-md hover:bg-red-900/50 text-gray-400 hover:text-red-400 transition-colors" title="Delete">
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

        {/* Input Card */}
        {!hasResults && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
            <label className="text-sm font-medium text-gray-300">Describe your task, goal, or idea</label>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder='e.g. "Build an AI agent that monitors Jira tickets, triages by severity, drafts responses, and escalates critical issues to Slack\u2026"'
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              rows={4}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) compile(); }}
            />

            {/* Layer Selector */}
            <div className="border-t border-gray-800 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400">
                  Layers&nbsp;
                  <span className="text-violet-400 font-semibold">{activeLayers.length}</span>
                  <span className="text-gray-600">/{allLayers.length}</span>
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">All</button>
                  <span className="text-gray-700">{'\u00b7'}</span>
                  <button onClick={selectNone} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Min</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allLayers.map(meta => {
                  const active = selectedKeys.includes(meta.key);
                  return (
                    <div key={meta.key} className="flex items-center">
                      <button
                        onClick={() => toggleLayer(meta.key)}
                        className={`flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full text-xs font-medium border transition-all ${
                          active
                            ? 'bg-violet-600/20 border-violet-500/50 text-violet-300 hover:bg-violet-600/30'
                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                        }`}
                      >
                        <span>{meta.icon}</span>
                        <span className="ml-0.5">{meta.short || meta.label}</span>
                      </button>
                      {meta.custom && (
                        <button
                          onClick={() => deleteCustomLayer(meta.key)}
                          className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-gray-600 hover:text-red-400 hover:bg-red-900/30 transition-colors text-xs"
                          title={`Remove ${meta.label}`}
                        >{'\u00d7'}</button>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={() => setShowAddLayer(true)}
                  className="flex items-center gap-1 pl-2 pr-2 py-1 rounded-full text-xs font-medium border border-dashed border-gray-700 text-gray-500 hover:border-violet-500/50 hover:text-violet-400 transition-all"
                >
                  + Layer
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">Ctrl+Enter to compile</span>
                {savedNotice && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Saved
                  </span>
                )}
              </div>
              <button
                onClick={compile}
                disabled={loading || !input.trim() || activeLayers.length === 0}
                className="px-5 py-2 bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {phase}
                  </span>
                ) : `\u26a1 Compile (${activeLayers.length} layer${activeLayers.length === 1 ? '' : 's'})`}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-red-300 text-sm flex items-start gap-2">
            <span className="font-semibold shrink-0">Error:</span>
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto shrink-0 text-red-500 hover:text-red-300">{'\u2715'}</button>
          </div>
        )}

        {/* Results */}
        {hasResults && (
          <div className="space-y-4">
            {/* Re-compile input (compact) */}
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  rows={2}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
                />
                <button
                  onClick={compile}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 text-sm transition-all whitespace-nowrap"
                >
                  {loading ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      {phase}
                    </span>
                  ) : '\u26a1 Re-compile'}
                </button>
              </div>
            </div>

            {/* Re-synthesize notice */}
            {layersEdited && (
              <div className="flex items-center justify-between bg-amber-950/40 border border-amber-800/40 rounded-lg px-3 py-2.5">
                <span className="text-xs text-amber-300">Layers edited {'\u2014'} synthesized prompt is out of date</span>
                <button
                  onClick={resynthesize}
                  disabled={resynthLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {resynthLoading ? (
                    <span className="flex items-center gap-1.5">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Synthesizing{'\u2026'}
                    </span>
                  ) : '\u21bb Re-synthesize'}
                </button>
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-2 bg-gray-900 rounded-lg p-1">
                {[
                  { id: 'layers', label: `\ud83e\udde9 ${activeLayers.length} Layer${activeLayers.length === 1 ? '' : 's'}`, ready: !!layers },
                  { id: 'synthesized', label: '\u26a1 Compiled Prompt', ready: !!synthesized },
                  { id: 'output', label: '\ud83d\ude80 Output', ready: conversation.length > 0 || !!streamingText },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => tab.ready && setActiveTab(tab.id)}
                    disabled={!tab.ready}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === tab.id ? 'bg-violet-600 text-white shadow' :
                      tab.ready ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Context indicator — show when on output tab */}
              {activeTab === 'output' && conversation.length > 0 && (
                <ContextIndicator
                  systemPrompt={buildProjectSystemPrompt()}
                  messages={conversation}
                  compressionStats={contextStats}
                />
              )}
            </div>

            {/* Layers Tab */}
            {activeTab === 'layers' && layers && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeLayers.map((meta, idx) => {
                  const data = layers[meta.key];
                  if (!data) return null;
                  return (
                    <LayerCard
                      key={meta.key}
                      meta={meta}
                      data={data}
                      index={idx}
                      onSave={handleLayerSave}
                    />
                  );
                })}
              </div>
            )}

            {/* Synthesized Tab */}
            {activeTab === 'synthesized' && synthesized && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-300">Production-Ready Prompt</span>
                    <span className="text-xs bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded-full">{synthesized.length.toLocaleString()} chars</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={runPrompt}
                      disabled={runLoading}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white disabled:opacity-50"
                    >
                      {runLoading ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Running{'\u2026'}
                        </span>
                      ) : '\ud83d\ude80 Run Prompt'}
                    </button>
                    <button
                      onClick={() => copyToClipboard(synthesized)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
                        copied ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {copied ? '\u2713 Copied!' : '\ud83d\udccb Copy'}
                    </button>
                  </div>
                </div>
                <pre className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed bg-gray-950 rounded-lg p-4 border border-gray-800 max-h-[32rem] overflow-y-auto font-mono selection:bg-violet-500/30">
                  {synthesized}
                </pre>
              </div>
            )}

            {/* Output Tab */}
            {activeTab === 'output' && (
              <OutputView
                conversation={conversation}
                streamingText={streamingText}
                onSendFollowUp={sendFollowUp}
                onClear={clearConversation}
                loading={runLoading}
                currentHtml={currentHtml}
                onUpdateHtml={handleUpdateHtml}
                onPreviewErrors={handlePreviewErrors}
              />
            )}
          </div>
        )}

        {/* Idle — layer stack preview */}
        {!hasResults && !loading && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-4 font-semibold">Active Layer Stack</p>
            <div className="space-y-2">
              {activeLayers.map((m, i) => (
                <div key={m.key} className="flex items-center gap-3 text-sm">
                  <span className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">{i + 1}</span>
                  <span className="text-lg">{m.icon}</span>
                  <span className="font-medium text-gray-300 w-52">{m.label}</span>
                  <span className="text-gray-500 text-xs md:text-sm">{m.question}</span>
                </div>
              ))}
              {allLayers.filter(l => !selectedKeys.includes(l.key)).length > 0 && (
                <div className="pt-2 border-t border-gray-800/50">
                  <p className="text-xs text-gray-600 mb-1.5">Inactive layers</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allLayers.filter(l => !selectedKeys.includes(l.key)).map(m => (
                      <button
                        key={m.key}
                        onClick={() => toggleLayer(m.key)}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-800 border border-gray-700 text-gray-600 hover:text-gray-400 hover:border-gray-600 transition-all"
                      >
                        {m.icon} {m.short || m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-600">Two-phase compilation: structured JSON decomposition {'\u2192'} plain-text synthesis</p>
            </div>
          </div>
        )}

      </div>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      {showAddLayer && (
        <AddLayerModal
          existingKeys={allLayers.map(l => l.key)}
          onAdd={addCustomLayer}
          onClose={() => setShowAddLayer(false)}
        />
      )}
      {showProjects && (
        <ProjectManager
          onLoad={loadProject}
          onClose={() => setShowProjects(false)}
          currentProjectId={currentProject?.id}
        />
      )}
      {showTools && (
        <ToolConfig
          builtInTools={BUILT_IN_TOOLS}
          onClose={() => setShowTools(false)}
        />
      )}
      {showModelRouter && (
        <ModelRouterConfig onClose={() => setShowModelRouter(false)} />
      )}
    </div>
  );
}
