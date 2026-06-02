import { useState, useRef, useEffect } from 'react';
import type { ContextVariable } from '../store/editor-store';
import { CreateVariableInline } from './create-variable-inline';

interface ContextVariableDropdownProps {
  variables: ContextVariable[];
  value?: string;
  onSelect: (variableName: string) => void;
  onCreate: (variable: { name: string; type: string; description: string }) => void;
}

export function ContextVariableDropdown({
  variables,
  value,
  onSelect,
  onCreate,
}: ContextVariableDropdownProps) {
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setCreating(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (creating) {
    return (
      <div ref={ref} className="nodrag">
        <CreateVariableInline
          onSave={(v) => {
            onCreate(v);
            onSelect(v.name);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  return (
    <div ref={ref} className="nodrag border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden max-h-60 overflow-y-auto">
      {variables.length > 0 && (
        <div>
          {variables.map((v) => (
            <button
              key={v.slotIndex}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 flex items-center gap-2 ${
                value === v.name ? 'bg-blue-50' : ''
              }`}
              onClick={() => onSelect(v.name)}
            >
              <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                {v.slotIndex}
              </span>
              <span className="font-medium text-gray-900">{v.name}</span>
              <span className="text-xs text-gray-400 ml-auto">{v.type}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium border-t border-gray-100"
        onClick={() => setCreating(true)}
      >
        + Neue Variable erstellen
      </button>
    </div>
  );
}
