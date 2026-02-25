import { useState, useCallback, useRef, useEffect } from 'react';

// Online playground links by language
const PLAYGROUND_URLS = {
  python: 'https://www.online-python.com/',
  py: 'https://www.online-python.com/',
  go: 'https://go.dev/play/',
  rust: 'https://play.rust-lang.org/',
  rs: 'https://play.rust-lang.org/',
  java: 'https://www.jdoodle.com/online-java-compiler/',
  cpp: 'https://www.onlinegdb.com/online_c++_compiler',
  c: 'https://www.onlinegdb.com/online_c_compiler',
  ruby: 'https://try.ruby-lang.org/',
  rb: 'https://try.ruby-lang.org/',
  php: 'https://3v4l.org/',
  swift: 'https://swiftfiddle.com/',
  kotlin: 'https://play.kotlinlang.org/',
  typescript: 'https://www.typescriptlang.org/play',
  ts: 'https://www.typescriptlang.org/play',
  sql: 'https://www.db-fiddle.com/',
  r: 'https://rdrr.io/snippets/',
  lua: 'https://www.lua.org/demo.html',
  dart: 'https://dartpad.dev/',
  scala: 'https://scastie.scala-lang.org/',
  perl: 'https://www.jdoodle.com/execute-perl-online/',
};

// Languages we can run in-browser
const BROWSER_RUNNABLE = new Set([
  'html', 'javascript', 'js', 'jsx', 'css',
]);

function isHtml(code) {
  return /<!DOCTYPE|<html|<body|<head/i.test(code) || /<div|<p|<h[1-6]|<section/i.test(code);
}

// Build a full HTML document from code + language
function buildSandboxHtml(code, language) {
  const lang = language?.toLowerCase() || '';

  // Full HTML document
  if (lang === 'html' || isHtml(code)) {
    // If it's a complete document, use as-is
    if (/<html/i.test(code)) return code;
    // Wrap partial HTML
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>body{font-family:system-ui,-apple-system,sans-serif;padding:16px;background:#1a1a2e;color:#e0e0e0;}</style>
</head><body>${code}</body></html>`;
  }

  // CSS only
  if (lang === 'css') {
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>${code}</style>
</head><body>
<div class="demo">
  <h1>CSS Preview</h1>
  <p>Your styles are applied to this page.</p>
  <button>Sample Button</button>
  <div class="box" style="width:100px;height:100px;margin:10px 0;"></div>
</div>
</body></html>`;
  }

  // JavaScript (with console capture)
  if (['javascript', 'js', 'jsx'].includes(lang)) {
    return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  body { font-family: 'SF Mono', Monaco, Consolas, monospace; padding: 12px; background: #0a0a1a; color: #e0e0e0; font-size: 13px; }
  .log { padding: 4px 0; border-bottom: 1px solid #1a1a2e; }
  .error { color: #ff6b6b; }
  .warn { color: #ffd93d; }
  .info { color: #6bcbff; }
  #output { white-space: pre-wrap; }
</style>
</head><body>
<div id="output"></div>
<script>
  const output = document.getElementById('output');
  function addLine(text, cls) {
    const div = document.createElement('div');
    div.className = 'log ' + (cls || '');
    div.textContent = typeof text === 'object' ? JSON.stringify(text, null, 2) : String(text);
    output.appendChild(div);
  }
  const _log = console.log, _err = console.error, _warn = console.warn, _info = console.info;
  console.log = (...a) => { addLine(a.map(v => typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)).join(' ')); _log(...a); };
  console.error = (...a) => { addLine(a.join(' '), 'error'); _err(...a); };
  console.warn = (...a) => { addLine(a.join(' '), 'warn'); _warn(...a); };
  console.info = (...a) => { addLine(a.join(' '), 'info'); _info(...a); };
  try {
${code}
  } catch(e) { addLine('Error: ' + e.message, 'error'); }
</script>
</body></html>`;
  }

  return null; // Not runnable in browser
}

export default function CodeSandbox({ code, language, onClose }) {
  const [output, setOutput] = useState(null);
  const iframeRef = useRef(null);
  const lang = language?.toLowerCase() || '';
  const canRun = BROWSER_RUNNABLE.has(lang) || isHtml(code);
  const playgroundUrl = PLAYGROUND_URLS[lang];

  const run = useCallback(() => {
    const html = buildSandboxHtml(code, language);
    if (html) setOutput(html);
  }, [code, language]);

  // Auto-run on mount if it's HTML
  useEffect(() => {
    if (lang === 'html' || isHtml(code)) run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canRun && !playgroundUrl) {
    return (
      <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3">
        <p className="text-xs text-gray-500">In-browser execution not available for {language || 'this language'}.</p>
        <button onClick={onClose} className="mt-2 text-xs text-gray-400 hover:text-gray-200">Close</button>
      </div>
    );
  }

  if (!canRun && playgroundUrl) {
    return (
      <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 flex items-center justify-between">
        <p className="text-xs text-gray-400">Can\u2019t run {language} in-browser.</p>
        <div className="flex items-center gap-2">
          <a
            href={playgroundUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-md transition-colors"
          >
            Open Playground \u2197
          </a>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-300">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
          <span className="text-xs font-medium text-gray-300">Live Preview</span>
        </div>
        <div className="flex items-center gap-1.5">
          {!output && (
            <button
              onClick={run}
              className="text-xs px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors font-medium"
            >
              \u25b6 Run
            </button>
          )}
          {output && (
            <button
              onClick={run}
              className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              \u21bb Re-run
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs px-1.5 py-0.5 text-gray-500 hover:text-gray-300 transition-colors"
          >
            \u2715
          </button>
        </div>
      </div>
      {output ? (
        <iframe
          ref={iframeRef}
          srcDoc={output}
          sandbox="allow-scripts"
          className="w-full border-0 bg-white"
          style={{ minHeight: '200px', maxHeight: '500px', height: '300px' }}
          title="Code sandbox"
        />
      ) : (
        <div className="p-4 text-center">
          <button
            onClick={run}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            \u25b6 Run Code
          </button>
        </div>
      )}
    </div>
  );
}
