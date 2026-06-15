import { useState } from 'react';

interface CreateVariableInlineProps {
  onSave: (variable: { name: string; type: string; description: string }) => void;
  onCancel: () => void;
}

export function CreateVariableInline({ onSave, onCancel }: CreateVariableInlineProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState('uint256');
  const [description, setDescription] = useState('');

  return (
    <div className="nodrag space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div>
        <div className="text-xs text-gray-500 mb-1">Name *</div>
        <input
          type="text"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="z.B. transfer-amount"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">Typ</div>
        <select
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={type}
          onChange={(e) => setType(e.target.value)}
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
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Was speichert diese Variable?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          className="px-3 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50"
          onClick={onCancel}
        >
          Abbrechen
        </button>
        <button
          className="px-3 py-1 text-xs border-none rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), type, description: description.trim() })}
        >
          Erstellen
        </button>
      </div>
    </div>
  );
}
