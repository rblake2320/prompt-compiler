import { useState } from 'react';
import { formatBytes, getTotalAssetSize, assetToHtml } from '../lib/assetManager';

export default function AssetPanel({ assets, onInjectAsset, onRemoveAsset, onClose }) {
  const [filter, setFilter] = useState('all');
  const [previewId, setPreviewId] = useState(null);

  const filtered = filter === 'all' ? assets : assets.filter(a => a.type === filter);
  const totalSize = getTotalAssetSize(assets);

  const counts = {
    all: assets.length,
    image: assets.filter(a => a.type === 'image').length,
    audio: assets.filter(a => a.type === 'audio').length,
  };

  if (assets.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">\ud83d\udcce Assets</h3>
          {onClose && <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">\u2715</button>}
        </div>
        <p className="text-xs text-gray-500 text-center py-4">
          No assets yet. Ask the AI to generate an image or audio \u2014 it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-300">\ud83d\udcce Assets</h3>
          <span className="text-xs text-gray-500">{assets.length} file{assets.length !== 1 ? 's' : ''} \u00b7 {formatBytes(totalSize)}</span>
        </div>
        {onClose && <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">\u2715</button>}
      </div>

      {/* Filter */}
      <div className="flex gap-1.5 mb-3">
        {[{ id: 'all', label: 'All' }, { id: 'image', label: '\ud83d\uddbc\ufe0f Images' }, { id: 'audio', label: '\ud83d\udd0a Audio' }].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              filter === f.id ? 'bg-violet-600/30 text-violet-300 border border-violet-500/50' : 'bg-gray-800 text-gray-500 border border-transparent hover:text-gray-300'
            }`}
          >{f.label} {counts[f.id] > 0 && `(${counts[f.id]})`}</button>
        ))}
      </div>

      {/* Asset Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
        {filtered.map(asset => (
          <div
            key={asset.id}
            className="bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden group relative"
          >
            {/* Preview */}
            {asset.type === 'image' && (asset.dataUri || asset.url) ? (
              <div className="aspect-square bg-gray-900 flex items-center justify-center">
                <img
                  src={asset.dataUri || asset.url}
                  alt={asset.name}
                  className="w-full h-full object-cover"
                  onClick={() => setPreviewId(previewId === asset.id ? null : asset.id)}
                />
              </div>
            ) : asset.type === 'audio' ? (
              <div className="aspect-square bg-gray-900 flex items-center justify-center">
                <div className="text-center p-2">
                  <span className="text-3xl">\ud83c\udfb5</span>
                  <audio controls className="w-full mt-2" style={{ maxWidth: '120px' }}>
                    <source src={asset.dataUri || asset.audioUrl || asset.url} />
                  </audio>
                </div>
              </div>
            ) : (
              <div className="aspect-square bg-gray-900 flex items-center justify-center">
                <span className="text-3xl">\ud83d\udcc4</span>
              </div>
            )}

            {/* Info */}
            <div className="p-2">
              <p className="text-xs text-gray-300 truncate">{asset.name}</p>
              <p className="text-xs text-gray-600">{asset.provider}</p>
            </div>

            {/* Hover actions */}
            <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              {onInjectAsset && (
                <button
                  onClick={() => onInjectAsset(asset)}
                  className="px-2 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded transition-colors"
                  title="Inject into project HTML"
                >\u2b07\ufe0f Inject</button>
              )}
              {onRemoveAsset && (
                <button
                  onClick={() => onRemoveAsset(asset.id)}
                  className="px-2 py-1 bg-red-600/80 hover:bg-red-500 text-white text-xs rounded transition-colors"
                >\ud83d\uddd1\ufe0f</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Full preview modal */}
      {previewId && (() => {
        const asset = assets.find(a => a.id === previewId);
        if (!asset) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setPreviewId(null)}>
            <div className="max-w-2xl max-h-[80vh] p-2" onClick={e => e.stopPropagation()}>
              <img src={asset.dataUri || asset.url} alt={asset.name} className="max-w-full max-h-[75vh] rounded-lg" />
              <div className="mt-2 text-center">
                <p className="text-sm text-gray-300">{asset.name}</p>
                {asset.prompt && <p className="text-xs text-gray-500 mt-1">Prompt: {asset.prompt}</p>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
