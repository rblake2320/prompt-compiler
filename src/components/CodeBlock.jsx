import { useState, useCallback } from 'react';

// Language display names
const LANG_LABELS = {
  js: 'JavaScript', javascript: 'JavaScript', jsx: 'JSX', ts: 'TypeScript',
  typescript: 'TypeScript', tsx: 'TSX', py: 'Python', python: 'Python',
  rb: 'Ruby', ruby: 'Ruby', go: 'Go', rs: 'Rust', rust: 'Rust',
  java: 'Java', cpp: 'C++', c: 'C', cs: 'C#', csharp: 'C#',
  sh: 'Shell', bash: 'Bash', zsh: 'Zsh', powershell: 'PowerShell', ps1: 'PowerShell',
  sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS', json: 'JSON',
  yaml: 'YAML', yml: 'YAML', xml: 'XML', md: 'Markdown', markdown: 'Markdown',
  dockerfile: 'Dockerfile', docker: 'Docker', tf: 'Terraform', hcl: 'HCL',
  vbs: 'VBScript', vbscript: 'VBScript', lua: 'Lua', swift: 'Swift',
  kotlin: 'Kotlin', dart: 'Dart', r: 'R', matlab: 'MATLAB',
};

export default function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const label = LANG_LABELS[language?.toLowerCase()] || language || 'Code';

  return (
    <div className="my-3 rounded-lg border border-gray-700 overflow-hidden bg-gray-950">
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-700">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <button
          onClick={copy}
          className={`text-xs px-2 py-0.5 rounded transition-all font-medium ${
            copied
              ? 'text-emerald-400 bg-emerald-900/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
          }`}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm leading-relaxed font-mono text-gray-300 selection:bg-violet-500/30">
        <code>{code}</code>
      </pre>
    </div>
  );
}
