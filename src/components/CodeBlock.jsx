import { useState, useCallback } from 'react';
import CodeSandbox from './CodeSandbox';

// Language display names + file extensions
const LANG_MAP = {
  js: { label: 'JavaScript', ext: '.js' },
  javascript: { label: 'JavaScript', ext: '.js' },
  jsx: { label: 'JSX', ext: '.jsx' },
  ts: { label: 'TypeScript', ext: '.ts' },
  typescript: { label: 'TypeScript', ext: '.ts' },
  tsx: { label: 'TSX', ext: '.tsx' },
  py: { label: 'Python', ext: '.py' },
  python: { label: 'Python', ext: '.py' },
  rb: { label: 'Ruby', ext: '.rb' },
  ruby: { label: 'Ruby', ext: '.rb' },
  go: { label: 'Go', ext: '.go' },
  rs: { label: 'Rust', ext: '.rs' },
  rust: { label: 'Rust', ext: '.rs' },
  java: { label: 'Java', ext: '.java' },
  cpp: { label: 'C++', ext: '.cpp' },
  c: { label: 'C', ext: '.c' },
  cs: { label: 'C#', ext: '.cs' },
  csharp: { label: 'C#', ext: '.cs' },
  sh: { label: 'Shell', ext: '.sh' },
  bash: { label: 'Bash', ext: '.sh' },
  zsh: { label: 'Zsh', ext: '.zsh' },
  powershell: { label: 'PowerShell', ext: '.ps1' },
  ps1: { label: 'PowerShell', ext: '.ps1' },
  sql: { label: 'SQL', ext: '.sql' },
  html: { label: 'HTML', ext: '.html' },
  css: { label: 'CSS', ext: '.css' },
  scss: { label: 'SCSS', ext: '.scss' },
  json: { label: 'JSON', ext: '.json' },
  yaml: { label: 'YAML', ext: '.yaml' },
  yml: { label: 'YAML', ext: '.yaml' },
  xml: { label: 'XML', ext: '.xml' },
  md: { label: 'Markdown', ext: '.md' },
  markdown: { label: 'Markdown', ext: '.md' },
  dockerfile: { label: 'Dockerfile', ext: '' },
  docker: { label: 'Docker', ext: '' },
  tf: { label: 'Terraform', ext: '.tf' },
  hcl: { label: 'HCL', ext: '.hcl' },
  vbs: { label: 'VBScript', ext: '.vbs' },
  vbscript: { label: 'VBScript', ext: '.vbs' },
  lua: { label: 'Lua', ext: '.lua' },
  swift: { label: 'Swift', ext: '.swift' },
  kotlin: { label: 'Kotlin', ext: '.kt' },
  dart: { label: 'Dart', ext: '.dart' },
  r: { label: 'R', ext: '.r' },
  matlab: { label: 'MATLAB', ext: '.m' },
  toml: { label: 'TOML', ext: '.toml' },
  ini: { label: 'INI', ext: '.ini' },
  cfg: { label: 'Config', ext: '.cfg' },
  env: { label: 'Env', ext: '.env' },
  php: { label: 'PHP', ext: '.php' },
  scala: { label: 'Scala', ext: '.scala' },
  groovy: { label: 'Groovy', ext: '.groovy' },
  perl: { label: 'Perl', ext: '.pl' },
};

// Runnable in-browser or has external playground
const RUNNABLE = new Set([
  'html', 'javascript', 'js', 'jsx', 'css',
  'python', 'py', 'go', 'rust', 'rs', 'java', 'cpp', 'c',
  'ruby', 'rb', 'php', 'swift', 'kotlin', 'typescript', 'ts',
  'sql', 'r', 'lua', 'dart', 'scala', 'perl',
]);

function guessFilename(code, language) {
  const firstLine = code.split('\n')[0]?.trim() || '';
  const match = firstLine.match(/^(?:\/\/|#|\/\*|--|;)\s*(\S+\.\w+)/);
  if (match) return match[1];
  const info = LANG_MAP[language?.toLowerCase()];
  return info ? `code${info.ext || '.txt'}` : 'code.txt';
}

export default function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const download = useCallback(() => {
    const filename = guessFilename(code, language);
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [code, language]);

  const info = LANG_MAP[language?.toLowerCase()];
  const label = info?.label || language || 'Code';
  const canRun = RUNNABLE.has(language?.toLowerCase());

  return (
    <div className="my-3 rounded-lg border border-gray-700 overflow-hidden bg-gray-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <div className="flex items-center gap-1">
          {canRun && (
            <button
              onClick={() => setShowSandbox(!showSandbox)}
              className={`text-xs px-2 py-0.5 rounded transition-all font-medium ${
                showSandbox
                  ? 'text-emerald-400 bg-emerald-900/30'
                  : 'text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-900/20'
              }`}
            >
              {showSandbox ? '\u25a0 Stop' : '\u25b6 Run'}
            </button>
          )}
          <button
            onClick={download}
            className="text-xs px-2 py-0.5 rounded transition-all font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            title={`Download as ${guessFilename(code, language)}`}
          >
            \u2193 Save
          </button>
          <button
            onClick={copy}
            className={`text-xs px-2 py-0.5 rounded transition-all font-medium ${
              copied
                ? 'text-emerald-400 bg-emerald-900/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
            }`}
          >
            {copied ? '\u2713 Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-sm leading-relaxed font-mono text-gray-300 selection:bg-violet-500/30">
        <code>{code}</code>
      </pre>
      {showSandbox && (
        <CodeSandbox
          code={code}
          language={language}
          onClose={() => setShowSandbox(false)}
        />
      )}
    </div>
  );
}
