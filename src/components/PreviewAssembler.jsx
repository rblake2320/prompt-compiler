import { useState, useCallback, useMemo, useRef } from 'react';

/**
 * Extracts all code blocks from conversation messages.
 */
function extractCodeBlocks(conversation) {
  const blocks = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  for (const msg of conversation) {
    if (msg.role !== 'assistant') continue;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(msg.content)) !== null) {
      const lang = (match[1] || '').toLowerCase();
      const code = match[2].trimEnd();
      blocks.push({ lang, code, id: blocks.length });
    }
  }
  return blocks;
}

function isFullHtml(code) {
  return /<html/i.test(code) || /<!DOCTYPE/i.test(code);
}

function isReactCode(code) {
  return (
    /(?:function|const|class)\s+\w+.*(?:=>|\{)[\s\S]*(?:return\s*\(|<[A-Z])/m.test(code) ||
    /<[A-Z][a-zA-Z]*[\s/>]/m.test(code)
  );
}

// Non-visual languages to skip
const SKIP_LANGS = new Set([
  'json','yaml','yml','toml','ini','env','sh','bash','zsh','shell',
  'sql','python','py','go','rust','rs','java','cpp','c','cs','csharp',
  'ruby','rb','php','swift','kotlin','vbs','powershell','ps1','lua',
  'dockerfile','tf','hcl','markdown','md','makefile','cmake','r',
  'perl','scala','dart','elixir','haskell','clojure','groovy',
]);

/**
 * Assemble code blocks into a single runnable HTML document.
 */
function assemblePreview(blocks) {
  const html = [];
  const css = [];
  const js = [];
  const jsx = [];
  let fullDoc = null;

  for (const block of blocks) {
    if (SKIP_LANGS.has(block.lang)) continue;

    if (block.lang === 'html' || (!block.lang && /<[a-z][^>]*>/i.test(block.code))) {
      if (isFullHtml(block.code)) {
        fullDoc = block.code;
      } else {
        html.push(block.code);
      }
    } else if (block.lang === 'css' || block.lang === 'scss') {
      css.push(block.code);
    } else if (
      ['jsx', 'tsx'].includes(block.lang) ||
      (['javascript', 'js'].includes(block.lang) && isReactCode(block.code))
    ) {
      jsx.push(block.code);
    } else if (['javascript', 'js', 'ts', 'typescript'].includes(block.lang)) {
      js.push(block.code);
    } else if (!block.lang && /<[a-z]/i.test(block.code)) {
      html.push(block.code);
    }
  }

  // If we found a complete HTML document, inject extras into it
  if (fullDoc) {
    let doc = fullDoc;
    if (css.length > 0) {
      const tag = '<style>\n' + css.join('\n\n') + '\n</style>';
      if (/<\/head>/i.test(doc)) {
        doc = doc.replace(/<\/head>/i, tag + '\n</head>');
      } else {
        doc = tag + '\n' + doc;
      }
    }
    if (js.length > 0) {
      const tag = '<script>\n' + js.join('\n\n') + '\n<\/script>';
      if (/<\/body>/i.test(doc)) {
        doc = doc.replace(/<\/body>/i, tag + '\n</body>');
      } else {
        doc = doc + '\n' + tag;
      }
    }
    return doc;
  }

  const hasReact = jsx.length > 0;
  const allCss = css.join('\n\n');
  const allJs = js.join('\n\n');
  const allHtml = html.join('\n\n');
  const allJsx = jsx.join('\n\n');

  if (hasReact) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"><\/script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js"><\/script>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
    ${allCss}
  </style>
</head>
<body>
  <div id="root">${allHtml}</div>
  ${allJs ? '<script>\n' + allJs + '\n<\/script>' : ''}
  <script type="text/babel">
    ${allJsx}

    // Auto-mount: find the last exported/defined component
    ;(() => {
      try {
        const candidates = [
          typeof App !== 'undefined' && App,
          typeof Hero !== 'undefined' && Hero,
          typeof LandingPage !== 'undefined' && LandingPage,
          typeof Page !== 'undefined' && Page,
          typeof Home !== 'undefined' && Home,
          typeof Main !== 'undefined' && Main,
          typeof Dashboard !== 'undefined' && Dashboard,
          typeof Layout !== 'undefined' && Layout,
        ].filter(Boolean);
        if (candidates.length > 0) {
          const Comp = candidates[0];
          ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Comp));
        }
      } catch(e) {
        document.getElementById('root').innerHTML =
          '<div style="padding:20px;color:#ff6b6b;font-family:monospace"><h3>Render Error</h3><pre>' +
          e.message + '</pre></div>';
      }
    })();
  <\/script>
</body>
</html>`;
  }

  // Plain HTML/CSS/JS mode
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; }
    ${allCss}
  </style>
</head>
<body>
  ${allHtml}
  ${allJs ? '<script>\n' + allJs + '\n<\/script>' : ''}
</body>
</html>`;
}

/**
 * Count how many previewable code blocks exist
 */
export function countPreviewableBlocks(conversation) {
  const blocks = extractCodeBlocks(conversation);
  return blocks.filter(b => !SKIP_LANGS.has(b.lang)).length;
}

export default function PreviewAssembler({ conversation, onClose }) {
  const [viewMode, setViewMode] = useState('desktop');
  const [showSource, setShowSource] = useState(false);
  const iframeRef = useRef(null);

  const blocks = useMemo(() => extractCodeBlocks(conversation), [conversation]);
  const previewHtml = useMemo(() => assemblePreview(blocks), [blocks]);
  const previewableCount = useMemo(
    () => blocks.filter(b => !SKIP_LANGS.has(b.lang)).length,
    [blocks]
  );

  const downloadHtml = useCallback(() => {
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'preview.html';
    a.click();
    URL.revokeObjectURL(url);
  }, [previewHtml]);

  const openInNewTab = useCallback(() => {
    const blob = new Blob([previewHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }, [previewHtml]);

  const copyHtml = useCallback(() => {
    navigator.clipboard.writeText(previewHtml);
  }, [previewHtml]);

  const refreshPreview = useCallback(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = '';
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.srcdoc = previewHtml;
      });
    }
  }, [previewHtml]);

  const viewWidths = {
    mobile: '375px',
    tablet: '768px',
    desktop: '100%',
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <span className="text-sm font-semibold text-emerald-400">\u25b6 Run &amp; Test</span>
          <span className="text-xs bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded-full">
            {previewableCount} block{previewableCount !== 1 ? 's' : ''} assembled
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Responsive toggles */}
          <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {[
              { id: 'mobile', label: '\ud83d\udcf1', w: '375px' },
              { id: 'tablet', label: '\ud83d\udccb', w: '768px' },
              { id: 'desktop', label: '\ud83d\udcbb', w: '100%' },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={`px-2 py-1 rounded-md text-xs transition-all ${
                  viewMode === v.id
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title={`${v.id} (${v.w})`}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-gray-700" />

          <button
            onClick={refreshPreview}
            className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors"
            title="Refresh preview"
          >
            \u21bb Refresh
          </button>
          <button
            onClick={() => setShowSource(!showSource)}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              showSource
                ? 'bg-violet-600 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200'
            }`}
          >
            &lt;/&gt; Source
          </button>
          <button
            onClick={copyHtml}
            className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors"
          >
            Copy HTML
          </button>
          <button
            onClick={downloadHtml}
            className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors"
          >
            \u2193 Download
          </button>
          <button
            onClick={openInNewTab}
            className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors"
          >
            Open in Tab \u2197
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Source panel (side by side when toggled) */}
        {showSource && (
          <div className="w-1/2 border-r border-gray-800 overflow-auto bg-gray-950 p-4">
            <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap leading-relaxed">
              {previewHtml}
            </pre>
          </div>
        )}

        {/* Preview iframe */}
        <div className={`flex-1 flex items-start justify-center bg-gray-950 overflow-auto p-4 ${
          showSource ? '' : ''
        }`}>
          <div
            style={{
              width: viewWidths[viewMode],
              maxWidth: '100%',
              height: '100%',
            }}
            className={`transition-all duration-300 ${
              viewMode !== 'desktop'
                ? 'border border-gray-700 rounded-xl overflow-hidden shadow-2xl'
                : ''
            }`}
          >
            <iframe
              ref={iframeRef}
              srcDoc={previewHtml}
              sandbox="allow-scripts allow-same-origin"
              className="w-full h-full border-0 bg-white rounded-lg"
              style={{ minHeight: 'calc(100vh - 60px)' }}
              title="Run & Test Preview"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
