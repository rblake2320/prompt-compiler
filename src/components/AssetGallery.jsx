import { useState, useEffect } from 'react';
import { getProjectAssets, deleteAsset, getStorageStats } from '../lib/assets';

export default function AssetGallery({ projectId, onClose, onInjectAsset }) {
  const [assets, setAssets] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadAssets();
  }, [projectId]);

  const loadAssets = async () => {
    if (!projectId) return;
    const items = await getProjectAssets(projectId);
    setAssets(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    const s = await getStorageStats();
    setStats(s);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this asset?')) return;
    await deleteAsset(id);
    loadAssets();
  };

  const filtered = filter === 'all' ? assets : assets.filter(a => a.type === filter);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">
            🗂️ Project Assets
            {stats && <span className="text-xs text-gray-500 font-normal ml-2">{stats.totalAssets} items · {stats.totalSizeMB} MB</span>}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800">✕</button>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {['all', 'image', 'speech', 'audio'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Assets Grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <div className="text-3xl mb-2">🎨</div>
            <p className="text-sm">No assets yet. Ask the AI to generate images or audio!</p>
            <p className="text-xs mt-1 text-gray-700">Try: "Generate a hero image for this landing page"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(asset => (
              <div key={asset.id} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden group">
                {/* Preview */}
                {asset.type === 'image' && asset.dataUri && (
                  <div className="aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
                    <img src={asset.dataUri} alt={asset.name} className="w-full h-full object-cover" />
                  </div>
                )}
                {(asset.type === 'speech' || asset.type === 'audio') && asset.dataUri && (
                  <div className="p-3 bg-gray-900 flex items-center justify-center">
                    <audio controls src={asset.dataUri} className="w-full" style={{ height: '36px' }} />
                  </div>
                )}

                {/* Info */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-200 truncate">{asset.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      asset.type === 'image' ? 'bg-blue-900/50 text-blue-400' :
                      asset.type === 'speech' ? 'bg-green-900/50 text-green-400' :
                      'bg-purple-900/50 text-purple-400'
                    }`}>
                      {asset.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{asset.prompt}</p>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <span>{asset.provider}</span>
                    <span>·</span>
                    <span>{asset.format}</span>
                    <span>·</span>
                    <span>{new Date(asset.createdAt).toLocaleTimeString()}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onInjectAsset && (
                      <button onClick={() => onInjectAsset(asset)}
                        className="flex-1 py-1 px-2 bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 text-xs rounded transition-colors">
                        Inject
                      </button>
                    )}
                    <button onClick={() => {
                      const a = document.createElement('a');
                      a.href = asset.dataUri;
                      a.download = `${asset.name}.${asset.format}`;
                      a.click();
                    }}
                      className="flex-1 py-1 px-2 bg-gray-700/50 hover:bg-gray-700 text-gray-400 text-xs rounded transition-colors">
                      Download
                    </button>
                    <button onClick={() => handleDelete(asset.id)}
                      className="py-1 px-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs rounded transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
