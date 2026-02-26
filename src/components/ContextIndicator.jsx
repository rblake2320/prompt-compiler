import { estimateTokens, estimateMessagesTokens } from '../lib/contextManager';
import { estimateCost } from '../lib/contextManager';

/**
 * Shows current context window usage: token count, estimated cost, compression status.
 * Displayed in the output tab header area.
 */
export default function ContextIndicator({ systemPrompt, messages, model, compressionStats }) {
  const systemTokens = estimateTokens(systemPrompt || '');
  const messageTokens = estimateMessagesTokens(messages || []);
  const total = systemTokens + messageTokens;

  const cost = estimateCost(systemPrompt || '', messages || [], model || 'claude-sonnet-4-20250514');

  // Color thresholds
  let color = 'text-emerald-400';
  let bg = 'bg-emerald-400';
  if (total > 100000) { color = 'text-red-400'; bg = 'bg-red-400'; }
  else if (total > 60000) { color = 'text-amber-400'; bg = 'bg-amber-400'; }
  else if (total > 30000) { color = 'text-yellow-400'; bg = 'bg-yellow-400'; }

  const pct = Math.min((total / 200000) * 100, 100);

  return (
    <div className="flex items-center gap-3 text-xs">
      {/* Token bar */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Context:</span>
        <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bg} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className={color}>{(total / 1000).toFixed(0)}K</span>
        <span className="text-gray-600">/200K</span>
      </div>

      {/* Cost */}
      <span className="text-gray-500">~{cost.formatted}</span>

      {/* Compression status */}
      {compressionStats?.compressed > 0 && (
        <span className="text-cyan-400" title={`${compressionStats.compressed} exchange(s) compressed`}>
          \ud83d\udce6 {compressionStats.compressed} compressed
        </span>
      )}
    </div>
  );
}
