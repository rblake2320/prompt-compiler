import { useState } from 'react';

const EMOJI_SUGGESTIONS = ['⚡', '🧠', '🔍', '💡', '🎨', '📊', '🔗', '🛡️', '🚀', '📝', '🔑', '⚙️'];

function toKey(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'layer';
}

export default function AddLayerModal({ existingKeys, onAdd, onClose }) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('⚡');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');

  const key = toKey(label);
  const isDupe = existingKeys.includes(key);

  const handleAdd = () => {
    if (!label.trim()) { setError('Label is required'); return; }
    if (isDupe) { setError(`Key "${key}" already exists`); return; }
    onAdd({
      key,
      label: label.trim(),
      short: label.trim().split(' ')[0],
      icon: icon || '⚡',
      question: question.trim() || 'What does this layer address?',
      custom: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-100">Add Custom Layer</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors text-sm">✕</button>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Label <span className="text-red-400">*</span></label>
          <input
            autoFocus
            value={label}
            onChange={e => { setLabel(e.target.value); setError(''); }}
            placeholder="e.g. Security Engineering"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-violet-500 transition-colors placeholder-gray-600"
          />
          {label && <p className="text-xs text-gray-600">Key: <span className="font-mono text-gray-400">{key}</span></p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Icon</label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {EMOJI_SUGGESTIONS.map(e => (
              <button
                key={e}
                onClick={() => setIcon(e)}
                className={`w-8 h-8 rounded-lg text-base transition-all ${icon === e ? 'bg-violet-600 ring-1 ring-violet-500' : 'bg-gray-800 hover:bg-gray-700'}`}
              >{e}</button>
            ))}
          </div>
          <input
            value={icon}
            onChange={e => setIcon(e.target.value)}
            placeholder="Or type any emoji"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-violet-500 transition-colors placeholder-gray-600"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Guiding Question</label>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="What does this layer address?"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-violet-500 transition-colors placeholder-gray-600"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors">Cancel</button>
          <button onClick={handleAdd} className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-lg transition-colors">Add Layer</button>
        </div>
      </div>
    </div>
  );
}
