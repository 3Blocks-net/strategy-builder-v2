import { useState } from 'react';
import type { ContextVariable } from '../store/editor-store';
import { ContextVariableDropdown } from './context-variable-dropdown';

const NO_SLOT = 4294967295;

interface ContextOutputFieldProps {
  fieldName: string;
  title?: string;
  description?: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  contextVariables: ContextVariable[];
  onCreateVariable: (variable: { name: string; type: string; description: string }) => void;
}

export function ContextOutputField({
  fieldName,
  title,
  description: desc,
  value,
  onChange,
  contextVariables,
  onCreateVariable,
}: ContextOutputFieldProps) {
  // `''` is the active-but-no-variable-chosen-yet state (set when the checkbox
  // is ticked), so it must count as active — otherwise ticking the box flips
  // isActive back to false and the variable picker never renders.
  const isActive = value !== undefined && value !== NO_SLOT;
  const selectedName = typeof value === 'string' ? value : undefined;
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="nodrag">
      <div className="mb-1">
        <label className="text-xs font-medium text-gray-700">{title}</label>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 mb-2">
        <input
          type="checkbox"
          className="rounded accent-blue-500"
          checked={isActive}
          onChange={(e) => {
            if (e.target.checked) {
              setShowDropdown(true);
              onChange(fieldName, '');
            } else {
              onChange(fieldName, NO_SLOT);
              setShowDropdown(false);
            }
          }}
        />
        Ergebnis in Context speichern
      </label>
      {isActive && (
        <div className="relative ml-5">
          {selectedName ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 border border-blue-400 rounded px-2 py-1.5 text-sm bg-blue-50 flex items-center gap-1.5">
                <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">ctx</span>
                <span className="text-blue-700 font-medium">{selectedName}</span>
                <button
                  className="ml-auto text-blue-300 hover:text-blue-500 text-sm"
                  onClick={() => onChange(fieldName, '')}
                >
                  ✕
                </button>
              </div>
              <button
                className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-400 hover:text-gray-600"
                onClick={() => setShowDropdown(!showDropdown)}
              >
                ⟲
              </button>
            </div>
          ) : (
            <div>
              {!showDropdown ? (
                <button
                  className="w-full text-left border border-dashed border-gray-300 rounded px-2 py-1.5 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
                  onClick={() => setShowDropdown(true)}
                >
                  Variable wählen...
                </button>
              ) : null}
            </div>
          )}
          {showDropdown && (
            <div className="mt-1">
              <ContextVariableDropdown
                variables={contextVariables}
                value={selectedName}
                onSelect={(name) => {
                  onChange(fieldName, name);
                  setShowDropdown(false);
                }}
                onCreate={(v) => {
                  onCreateVariable(v);
                  onChange(fieldName, v.name);
                  setShowDropdown(false);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
