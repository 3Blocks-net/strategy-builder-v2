import { useState } from 'react';
import { useEditorStore } from '../store/editor-store';
import { CreateVariableInline } from './create-variable-inline';

export function ContextPanel() {
  const contextVariables = useEditorStore((s) => s.contextVariables);
  const addContextVariable = useEditorStore((s) => s.addContextVariable);
  const updateContextVariable = useEditorStore((s) => s.updateContextVariable);
  const nodes = useEditorStore((s) => s.nodes);

  const [showCreate, setShowCreate] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const usageMap = new Map<string, string[]>();
  for (const node of nodes) {
    for (const [, val] of Object.entries(node.data.params)) {
      if (typeof val === 'string' && contextVariables.some((v) => v.name === val)) {
        const list = usageMap.get(val) ?? [];
        list.push(node.data.stepTypeName);
        usageMap.set(val, list);
      }
    }
  }

  const startEdit = (v: typeof contextVariables[0]) => {
    setEditingSlot(v.slotIndex);
    setEditName(v.name);
    setEditType(v.type);
    setEditDesc(v.description);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 border-b border-gray-100">
        {showCreate ? (
          <CreateVariableInline
            onSave={(v) => {
              addContextVariable(v);
              setShowCreate(false);
            }}
            onCancel={() => setShowCreate(false)}
          />
        ) : (
          <button
            className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
            onClick={() => setShowCreate(true)}
          >
            + Neue Context-Variable
          </button>
        )}
      </div>

      {contextVariables.length === 0 && !showCreate && (
        <div className="text-center py-8 text-gray-400 text-sm">
          Keine Context-Variablen vorhanden.
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {contextVariables.map((v) =>
          editingSlot === v.slotIndex ? (
            <div key={v.slotIndex} className="p-4 bg-gray-50 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                  Slot {v.slotIndex}
                </span>
                <span className="text-xs text-gray-500">Bearbeiten</span>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Name</div>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Typ</div>
                <select
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                >
                  <option value="uint256">uint256</option>
                  <option value="address">address</option>
                  <option value="bool">bool</option>
                  <option value="bytes">bytes</option>
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Beschreibung</div>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  className="px-3 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50"
                  onClick={() => setEditingSlot(null)}
                >
                  Abbrechen
                </button>
                <button
                  className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
                  onClick={() => {
                    updateContextVariable(v.slotIndex, {
                      name: editName.trim(),
                      type: editType,
                      description: editDesc.trim(),
                    });
                    setEditingSlot(null);
                  }}
                >
                  Speichern
                </button>
              </div>
            </div>
          ) : (
            <div key={v.slotIndex} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                    Slot {v.slotIndex}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{v.name}</span>
                </div>
                <button
                  className="text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => startEdit(v)}
                >
                  ✎
                </button>
              </div>
              <div className="text-xs text-gray-500">
                {v.type}{v.description ? ` · ${v.description}` : ''}
              </div>
              {usageMap.get(v.name) && (
                <div className="text-xs text-gray-400 mt-1">
                  Benutzt von:{' '}
                  {usageMap.get(v.name)!.map((stepName, i) => (
                    <span key={i} className="text-blue-500">
                      {i > 0 ? ', ' : ''}{stepName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
