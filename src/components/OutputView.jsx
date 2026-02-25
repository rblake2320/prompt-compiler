import { useState, useCallback, useRef, useEffect } from 'react';
import CodeBlock from './CodeBlock';

// Parse AI response into segments of text and code blocks
function parseContent(text) {
  const segments = [];
  const regex = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', language: match[1] || '', content: match[2].trimEnd() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}

function MessageBubble({ role, content }) {
  const isUser = role === 'user';
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-violet-600/20 border border-violet-500/30 rounded-xl px-4 py-2.5">
          <p className="text-sm text-violet-200 whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }
  const segments = parseContent(content);
  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] space-y-0">
        {segments.map((seg, i) =>
          seg.type === 'code' ? (
            <CodeBlock key={i} code={seg.content} language={seg.language} />
          ) : (
            <div key={i} className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
              {seg.content.trim()}
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default function OutputView({
  conversation,
  onSendFollowUp,
  onClear,
  loading,
}) {
  const [followUp, setFollowUp] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, loading]);

  const handleSend = useCallback(() => {
    if (!followUp.trim() || loading) return;
    onSendFollowUp(followUp.trim());
    setFollowUp('');
  }, [followUp, loading, onSendFollowUp]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Copy entire conversation as text
  const copyAll = useCallback(() => {
    const text = conversation
      .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
  }, [conversation]);

  if (conversation.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <div className="text-3xl mb-3">🚀</div>
        <p className="text-sm text-gray-400">Click "Run Prompt" on the Compiled Prompt tab to execute your prompt</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: '70vh' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-300">Output</span>
          <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
            {conversation.filter((m) => m.role === 'assistant').length} response{conversation.filter((m) => m.role === 'assistant').length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyAll}
            className="text-xs px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            📋 Copy All
          </button>
          <button
            onClick={onClear}
            className="text-xs px-2 py-1 rounded-md hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversation.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Generating…
          </div>
        )}
      </div>

      {/* Follow-up input */}
      <div className="border-t border-gray-800 p-3 bg-gray-900 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Follow-up message… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            style={{ minHeight: '38px', maxHeight: '120px' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!followUp.trim() || loading}
            className="px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
