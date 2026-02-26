import { useState, useEffect, useCallback } from 'react';
import { listProjects, deleteProject, exportProject, importProject } from '../lib/projects';

export default function ProjectManager({ onLoad, onClose, currentProjectId }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importMode, setImportMode] = useState(false);
  const [importJson, setImportJson] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listProjects();
      setProjects(list);
    } catch (e) {
      console.error('Failed to load projects', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = useCallback(async (id, name) => {
    if (!window.confirm(`Delete project "${name}"?`)) return;
    await deleteProject(id);
    refresh();
  }, [refresh]);

  const handleExport = useCallback(async (id) => {
    const json = await exportProject(id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const project = await importProject(importJson);
      setImportJson('');
      setImportMode(false);
      refresh();
      onLoad(project);
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  }, [importJson, onLoad, refresh]);

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-lg">\ud83d\udcc1</span>
            <h2 className="text-lg font-semibold text-gray-200">Projects</h2>
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
              {projects.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportMode(!importMode)}
              className="text-xs px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-md transition-colors"
            >
              Import
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors text-lg"
            >
              \u2715
            </button>
          </div>
        </div>

        {/* Import panel */}
        {importMode && (
          <div className="px-5 py-3 border-b border-gray-800 bg-gray-950">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste project JSON here..."
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => { setImportMode(false); setImportJson(''); }}
                className="text-xs px-3 py-1.5 text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!importJson.trim()}
                className="text-xs px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-md disabled:opacity-40"
              >
                Import Project
              </button>
            </div>
          </div>
        )}

        {/* Project list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
          ) : projects.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-3xl mb-3">\ud83d\udcc2</div>
              <p className="text-sm text-gray-500">No saved projects yet.</p>
              <p className="text-xs text-gray-600 mt-1">Projects auto-save when you Run Prompt.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-800/50 transition-colors group ${
                    currentProjectId === p.id ? 'bg-violet-900/20 border-l-2 border-violet-500' : ''
                  }`}
                >
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => onLoad(p)}
                  >
                    <p className="text-sm text-gray-200 truncate font-medium">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">{formatDate(p.updatedAt)}</span>
                      {p.versions?.length > 0 && (
                        <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0 rounded">
                          {p.versions.length} version{p.versions.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {p.currentHtml && (
                        <span className="text-xs bg-emerald-900/40 text-emerald-500 px-1.5 py-0 rounded">
                          has preview
                        </span>
                      )}
                      {p.conversation?.length > 0 && (
                        <span className="text-xs text-gray-600">
                          {Math.ceil(p.conversation.filter(m => m.role === 'assistant').length)} response{p.conversation.filter(m => m.role === 'assistant').length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExport(p.id); }}
                      className="p-1.5 rounded-md hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
                      title="Export JSON"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                      className="p-1.5 rounded-md hover:bg-red-900/50 text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
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
      </div>
    </div>
  );
}
