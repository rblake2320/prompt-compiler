import { useState } from 'react';

export default function LayerCard({ meta, data, index, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ analysis: '', elements: [] });

  const startEdit = () => {
    setDraft({ analysis: data.analysis, elements: [...(data.elements || [])] });
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
    const cleaned = {
      analysis: draft.analysis.trim(),
      elements: draft.elements.map(e => e.trim()).filter(Boolean),
    };
    onSave(meta.key, cleaned);
    setEditing(false);
  };

  const updateElement = (i, val) =>
    setDraft(d => ({ ...d, elements: d.elements.map((e, idx) => idx === i ? val : e) }));

  const addElement = () =>
    setDraft(d => ({ ...d, elements: [...d.elements, ''] }));

  const removeElement = (i) =>
    setDraft(d => ({ ...d, elements: d.elements.filter((_, idx) => idx !== i) }));

  if (editing) {
    return (
      <div className="bg-gray-900 border border-violet-500/50 ring-1 ring-violet-500/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">{index + 1}</span>
          <span className="text-lg">{meta.icon}</span>
          <span className="font-semibold text-sm text-violet-300">{meta.label}</span>
          <span className="text-xs text-violet-400 ml-auto">Editing</span>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Analysis</label>
          <textarea
            value={draft.analysis}
            onChange={e => setDraft(d => ({ ...d, analysis: e.target.value }))}
            rows={3}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-sm text-gray-200 resize-none focus:outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Elements</label>
          {draft.elements.map((el, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={el}
                onChange={e => updateElement(i, e.target.value)}
                className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button
                onClick={() => removeElement(i)}
                className="px-2 rounded-lg bg-gray-800 hover:bg-red-900/40 text-gray-500 hover:text-red-400 transition-colors text-sm"
              >×</button>
            </div>
          ))}
          <button
            onClick={addElement}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors py-0.5"
          >
            + Add item
          </button>
        </div>

        <div className="flex gap-2 pt-1 border-t border-gray-800">
          <button
            onClick={saveEdit}
            className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Save Changes
          </button>
          <button
            onClick={cancelEdit}
            className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 space-y-2 transition-all group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">{index + 1}</span>
          <span className="text-lg">{meta.icon}</span>
          <span className="font-semibold text-sm text-gray-200">{meta.label}</span>
        </div>
        <button
          onClick={startEdit}
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs transition-all"
          title="Edit this layer"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>
      </div>
      <p className="text-xs text-gray-500 italic">{meta.question}</p>
      <p className="text-sm text-gray-300 leading-relaxed">{data.analysis}</p>
      {(data.elements || []).length > 0 && (
        <ul className="space-y-1 pt-1">
          {(data.elements || []).map((el, i) => (
            <li key={i} className="text-xs text-gray-400 flex gap-2">
              <span className="text-violet-400 mt-0.5 shrink-0">›</span>
              <span>{el}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
