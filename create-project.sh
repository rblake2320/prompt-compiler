#!/bin/bash
cd ~/prompt-compiler

# --- package.json ---
cat > package.json << 'EOF'
{
  "name": "prompt-compiler",
  "version": "1.0.0",
  "description": "6-Layer Prompt Compiler",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vite": "^6.0.0"
  },
  "license": "MIT"
}
EOF

# --- vite.config.js ---
cat > vite.config.js << 'EOF'
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
          headers: {
            'x-api-key': env.ANTHROPIC_API_KEY || '',
            'anthropic-version': '2023-06-01',
          },
        },
      },
    },
  };
});
EOF

# --- tailwind.config.js ---
cat > tailwind.config.js << 'EOF'
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: [],
};
EOF

# --- postcss.config.js ---
cat > postcss.config.js << 'EOF'
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
EOF

# --- index.html ---
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>6-Layer Prompt Compiler</title>
</head>
<body class="bg-gray-950">
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
EOF

# --- .env.example ---
cat > .env.example << 'EOF'
ANTHROPIC_API_KEY=sk-ant-api03-REPLACE_ME
EOF

# --- .gitignore ---
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
.env.local
.env.*.local
.wrangler/
.vercel/
*.log
.DS_Store
EOF

# --- src/index.css ---
cat > src/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;
EOF

# --- src/main.jsx ---
cat > src/main.jsx << 'EOF'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
EOF

# --- src/App.jsx ---
cat > src/App.jsx << 'EOF'
import PromptCompiler from './components/PromptCompiler';
export default function App() { return <PromptCompiler />; }
EOF

# --- src/lib/prompts.js ---
cat > src/lib/prompts.js << 'PROMPTSEOF'
export const DECOMPOSE_SYSTEM = `You are a Prompt Architect. Given ANY user task, decompose it into 6 AI engineering layers.

For each layer provide:
- "analysis": 2-3 sentences explaining what this layer requires for the task
- "elements": array of 3-6 short actionable items

CRITICAL RULES:
- Respond with ONLY valid JSON. No markdown fences. No commentary before or after.
- Keep all string values on a single line. Never use literal newlines inside JSON strings.
- Do not use unescaped double quotes inside string values.

Exact shape required:
{
  "prompt": { "analysis": "...", "elements": ["...", "..."] },
  "context": { "analysis": "...", "elements": ["...", "..."] },
  "intent": { "analysis": "...", "elements": ["...", "..."] },
  "flow": { "analysis": "...", "elements": ["...", "..."] },
  "eval": { "analysis": "...", "elements": ["...", "..."] },
  "tool": { "analysis": "...", "elements": ["...", "..."] }
}`;

export const SYNTHESIZE_SYSTEM = `You are a Prompt Architect. You receive a 6-layer decomposition of a user's task. Synthesize ALL 6 layers into ONE production-grade system prompt.

The output prompt must include:
- Precise role/instructions (Prompt layer)
- Structured context blocks with placeholders (Context layer)
- Clear outcome/success statement (Intent layer)
- Multi-step numbered workflow (Flow layer)
- Built-in self-evaluation criteria (Eval layer)
- Tool/integration hooks and MCP references where applicable (Tool layer)

Use XML-style section tags for organization. Be thorough but lean.

Respond with ONLY the raw prompt text. No preamble. No wrapping. Just the prompt itself.`;

export const LAYER_META = [
  { key: 'prompt', label: 'Prompt Engineering', icon: '\u270d\ufe0f', question: 'How should the instruction be phrased?' },
  { key: 'context', label: 'Context Engineering', icon: '\ud83d\udcda', question: 'What must the model know right now?' },
  { key: 'intent', label: 'Intent Engineering', icon: '\ud83c\udfaf', question: 'What outcome is desired and why?' },
  { key: 'flow', label: 'Flow Engineering', icon: '\ud83d\udd04', question: 'How should this break into reliable steps?' },
  { key: 'eval', label: 'Evaluation Engineering', icon: '\u2705', question: 'How do we know it works correctly?' },
  { key: 'tool', label: 'Tool / Integration Engineering', icon: '\ud83d\udd27', question: 'What external actions or data are needed?' },
];
PROMPTSEOF

# --- src/lib/claude.js ---
cat > src/lib/claude.js << 'EOF'
function getBaseUrl() {
  if (typeof window !== 'undefined' && window.location.hostname.includes('claude.ai')) {
    return 'https://api.anthropic.com';
  }
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return '/api/anthropic';
  }
  return '/api/anthropic';
}

export async function callClaude(system, userMessage) {
  const url = `${getBaseUrl()}/v1/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${errText.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'API error');
  return (data.content || []).map((b) => b.text || '').join('');
}

export function robustJsonParse(raw) {
  let s = raw.trim().replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
  try { return JSON.parse(s); } catch (_) {}
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last <= first) throw new Error('No JSON object found');
  let sub = s.slice(first, last + 1);
  try { return JSON.parse(sub); } catch (_) {}
  sub = sub.replace(/"(?:[^"\\]|\\.)*"/g, (m) =>
    m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
  );
  try { return JSON.parse(sub); } catch (e) {
    throw new Error('JSON parse failed: ' + e.message);
  }
}
EOF

# --- src/components/PromptCompiler.jsx ---
cat > src/components/PromptCompiler.jsx << 'EOF'
import { useState, useCallback } from 'react';
import { callClaude, robustJsonParse } from '../lib/claude';
import { DECOMPOSE_SYSTEM, SYNTHESIZE_SYSTEM, LAYER_META } from '../lib/prompts';

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
      setSynthesized(rawSynth.trim());
      setActiveTab('layers');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); setPhase(''); }
  }, [input]);

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            6-Layer Prompt Compiler
          </h1>
          <p className="text-gray-400 text-sm max-w-2xl mx-auto">
            Decompose any task into Prompt &middot; Context &middot; Intent &middot; Flow &middot; Eval &middot; Tool layers, then synthesize a production-grade prompt.
          </p>
        </div>

        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
          <label className="text-sm font-medium text-gray-300">Describe your task, goal, or idea</label>
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "Build an AI agent that monitors Jira tickets..."'
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            rows={4}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) compile(); }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Ctrl+Enter to compile</span>
            <button onClick={compile} disabled={loading || !input.trim()}
              className="px-5 py-2 bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold rounded-lg hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">
              {loading ? (<span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                {phase}</span>) : '\u26a1 Compile Prompt'}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-950 border border-red-800 rounded-lg p-3 text-red-300 text-sm"><span className="font-semibold">Error: </span>{error}</div>}

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
EOF

# --- api/compile.js (serverless proxy) ---
cat > api/compile.js << 'EOF'
export const config = { runtime: 'edge' };
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const apiKey = typeof process !== 'undefined' ? process.env?.ANTHROPIC_API_KEY : globalThis.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), { status: 500 });
  try {
    const body = await req.json();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: res.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
EOF

# --- README.md ---
cat > README.md << 'EOF'
# 6-Layer Prompt Compiler

Decompose any task into the 6 AI engineering disciplines (Prompt · Context · Intent · Flow · Eval · Tool), then synthesize a single production-grade system prompt.

## Quick Start
```bash
npm install
cp .env.example .env   # Add your ANTHROPIC_API_KEY
npm run dev
```

## The 6-Layer Model

| # | Layer | Core Question |
|---|-------|--------------|
| 1 | Prompt Engineering | How should the instruction be phrased? |
| 2 | Context Engineering | What must the model know right now? |
| 3 | Intent Engineering | What outcome is desired and why? |
| 4 | Flow Engineering | How should this break into reliable steps? |
| 5 | Evaluation Engineering | How do we know it's working correctly? |
| 6 | Tool/Integration Engineering | What external actions or data are needed? |

## Architecture

Two-phase API pipeline:
1. **Decompose** — Claude returns structured JSON for all 6 layers
2. **Synthesize** — Claude returns plain-text production prompt (no JSON corruption risk)

## Deploy

**Vercel:** `vercel env add ANTHROPIC_API_KEY && vercel --prod`
**Cloudflare:** `wrangler secret put ANTHROPIC_API_KEY && npm run build && wrangler pages deploy dist`

## License
MIT
EOF

echo ""
echo "✅ All project files created successfully!"
echo "   Files: $(find . -type f | wc -l) files in $(find . -type d | wc -l) directories"
