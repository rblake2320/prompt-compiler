/**
 * Compact token budget indicator.
 * Shows context usage as a progress bar with details on hover.
 */
export default function TokenBudget({ budget }) {
  if (!budget) return null;

  const { systemTokens, conversationTokens, totalUsed, windowSize, pct, warning } = budget;

  const barColor = warning === 'high' ? 'bg-red-500' : warning === 'medium' ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = warning === 'high' ? 'text-red-400' : warning === 'medium' ? 'text-amber-400' : 'text-gray-500';

  const fmt = (n) => n > 1000 ? `${(n / 1000).toFixed(1)}K` : n;

  return (
    <div className="group relative inline-flex items-center gap-1.5">
      <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{pct}%</span>

      {/* Hover tooltip */}
      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl min-w-[200px] text-xs space-y-1.5">
          <div className="font-semibold text-gray-300 mb-2">Context Budget</div>
          <div className="flex justify-between text-gray-400">
            <span>System prompt</span>
            <span className="font-mono">{fmt(systemTokens)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Conversation</span>
            <span className="font-mono">{fmt(conversationTokens)}</span>
          </div>
          <div className="border-t border-gray-800 my-1" />
          <div className="flex justify-between text-gray-300 font-medium">
            <span>Total used</span>
            <span className="font-mono">{fmt(totalUsed)}</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>Window size</span>
            <span className="font-mono">{fmt(windowSize)}</span>
          </div>
          {warning === 'high' && (
            <div className="text-red-400 mt-1.5">⚠ Context is filling up. Older messages will be summarized.</div>
          )}
        </div>
      </div>
    </div>
  );
}
