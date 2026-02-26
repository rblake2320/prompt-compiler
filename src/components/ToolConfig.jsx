import { useState, useCallback, useEffect } from 'react';
import { getUserTools, addUserTool, removeUserTool, getMcpServers, saveMcpServers } from '../lib/tools';

function ToolCard({ tool, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-400 font-mono">
            {tool._source || 'built-in'}
          </span>
          <span className="text-sm font-medium text-gray-200">{tool.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs px-2 py-1 text-gray-400 hover:text-gray-200"
          >
            {expanded ? 'Hide' : 'Schema'}
          </button>
          {onRemove && (
            <button
              onClick={() => onRemove(tool.name)}
              className="text-xs px-2 py-1 text-red-400 hover:text-red-300"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1">{tool.description?.slice(0, 120)}</p>
      {expanded && (
        <pre className="mt-2 text-xs text-gray-500 bg-gray-950 rounded p-2 overflow-x-auto">
          {JSON.stringify(tool.input_schema, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function ToolConfig({ builtInTools = [], onClose }) {
  const [userTools, setUserTools] = useState([]);
  const [mcpServers, setMcpServers] = useState([]);
  const [addMode, setAddMode] = useState(false);
  const [addMcpMode, setAddMcpMode] = useState(false);
  const [newToolJson, setNewToolJson] = useState('');
  const [newMcpUrl, setNewMcpUrl] = useState('');
  const [newMcpName, setNewMcpName] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('builtin');

  useEffect(() => {
    setUserTools(getUserTools());
    setMcpServers(getMcpServers());
  }, []);

  const handleAddTool = useCallback(() => {
    setError('');
    try {
      const tool = JSON.parse(newToolJson);
      const updated = addUserTool(tool);
      setUserTools(updated);
      setNewToolJson('');
      setAddMode(false);
    } catch (e) {
      setError(e.message);
    }
  }, [newToolJson]);

  const handleRemoveTool = useCallback((name) => {
    const updated = removeUserTool(name);
    setUserTools(updated);
  }, []);

  const handleAddMcp = useCallback(() => {
    if (!newMcpUrl.trim() || !newMcpName.trim()) return;
    const updated = [
      ...mcpServers,
      { name: newMcpName.trim(), url: newMcpUrl.trim(), transport: 'sse', enabled: true },
    ];
    saveMcpServers(updated);
    setMcpServers(updated);
    setNewMcpUrl('');
    setNewMcpName('');
    setAddMcpMode(false);
  }, [mcpServers, newMcpUrl, newMcpName]);

  const handleToggleMcp = useCallback((idx) => {
    const updated = mcpServers.map((s, i) =>
      i === idx ? { ...s, enabled: !s.enabled } : s
    );
    saveMcpServers(updated);
    setMcpServers(updated);
  }, [mcpServers]);

  const handleRemoveMcp = useCallback((idx) => {
    const updated = mcpServers.filter((_, i) => i !== idx);
    saveMcpServers(updated);
    setMcpServers(updated);
  }, [mcpServers]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-lg">\ud83d\udd27</span>
            <h2 className="text-lg font-semibold text-gray-200">Tools &amp; Integrations</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-lg"
          >
            \u2715
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-0">
          {[
            { id: 'builtin', label: 'Built-in', count: builtInTools.length },
            { id: 'custom', label: 'Custom Tools', count: userTools.length },
            { id: 'mcp', label: 'MCP Servers', count: mcpServers.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-t-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 bg-gray-700 px-1.5 py-0 rounded text-[10px]">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {/* Built-in tools */}
          {activeTab === 'builtin' && (
            <>
              <p className="text-xs text-gray-500">These tools are always available when working on a project.</p>
              {builtInTools.map(t => (
                <ToolCard key={t.name} tool={{ ...t, _source: 'built-in' }} />
              ))}
              {builtInTools.length === 0 && (
                <p className="text-sm text-gray-500">No built-in tools active. Enable project mode to use them.</p>
              )}
            </>
          )}

          {/* Custom tools */}
          {activeTab === 'custom' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Add custom tool definitions (JSON schema). AI can call these during conversations.</p>
                <button
                  onClick={() => setAddMode(!addMode)}
                  className="text-xs px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-md"
                >
                  + Add Tool
                </button>
              </div>

              {addMode && (
                <div className="bg-gray-950 rounded-lg p-3 border border-gray-800">
                  <textarea
                    value={newToolJson}
                    onChange={e => setNewToolJson(e.target.value)}
                    placeholder='{\n  "name": "my_tool",\n  "description": "What this tool does",\n  "input_schema": {\n    "type": "object",\n    "properties": { ... },\n    "required": [...]\n  }\n}'
                    rows={8}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 placeholder-gray-600 font-mono resize-none focus:outline-none focus:border-violet-500"
                  />
                  {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => { setAddMode(false); setError(''); }} className="text-xs text-gray-400 px-3 py-1.5">Cancel</button>
                    <button onClick={handleAddTool} className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-md">Add</button>
                  </div>
                </div>
              )}

              {userTools.map(t => (
                <ToolCard key={t.name} tool={t} onRemove={handleRemoveTool} />
              ))}
              {userTools.length === 0 && !addMode && (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500">No custom tools configured.</p>
                  <p className="text-xs text-gray-600 mt-1">Paste a tool JSON schema to give AI new capabilities.</p>
                </div>
              )}
            </>
          )}

          {/* MCP Servers */}
          {activeTab === 'mcp' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Connect MCP servers to give AI access to external tools and data.</p>
                <button
                  onClick={() => setAddMcpMode(!addMcpMode)}
                  className="text-xs px-2.5 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-md"
                >
                  + Add Server
                </button>
              </div>

              {addMcpMode && (
                <div className="bg-gray-950 rounded-lg p-3 border border-gray-800 space-y-2">
                  <input
                    value={newMcpName}
                    onChange={e => setNewMcpName(e.target.value)}
                    placeholder="Server name (e.g. GitHub, Jira)"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                  />
                  <input
                    value={newMcpUrl}
                    onChange={e => setNewMcpUrl(e.target.value)}
                    placeholder="SSE endpoint URL (e.g. https://mcp.example.com/sse)"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-violet-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAddMcpMode(false)} className="text-xs text-gray-400 px-3 py-1.5">Cancel</button>
                    <button onClick={handleAddMcp} className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-md">Connect</button>
                  </div>
                </div>
              )}

              {mcpServers.map((s, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.enabled ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                      <span className="text-sm font-medium text-gray-200">{s.name}</span>
                      <span className="text-xs text-gray-500 font-mono">{s.transport}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono truncate max-w-md">{s.url}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleMcp(i)}
                      className={`text-xs px-2 py-1 rounded-md ${
                        s.enabled ? 'bg-emerald-900/50 text-emerald-400' : 'bg-gray-700 text-gray-400'
                      }`}
                    >
                      {s.enabled ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => handleRemoveMcp(i)}
                      className="text-xs px-2 py-1 text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {mcpServers.length === 0 && !addMcpMode && (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-500">No MCP servers connected.</p>
                  <p className="text-xs text-gray-600 mt-1">Add an SSE endpoint to give AI access to external tools.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
