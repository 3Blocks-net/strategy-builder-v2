import { useState, useRef, useEffect } from 'react';
import type { ContextVariable } from '../store/editor-store';
import { ContextVariableDropdown } from './context-variable-dropdown';

const NO_SLOT = 4294967295;

interface ContextInputFieldProps {
  fieldName: string;
  title?: string;
  description?: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  contextVariables: ContextVariable[];
  onCreateVariable: (variable: { name: string; type: string; description: string }) => void;
  placeholder?: string;
  isOptional: boolean;
}

export function ContextInputField({
  fieldName,
  title,
  description: desc,
  value,
  onChange,
  contextVariables,
  onCreateVariable,
  placeholder,
  isOptional,
}: ContextInputFieldProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isContextMode = typeof value === 'string' && contextVariables.some((v) => v.name === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  return (
    <div className="nodrag">
      <div className="mb-1">
        <label className="text-xs font-medium text-gray-700">{title}</label>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      <div className="relative" ref={dropdownRef}>
        <div className="flex gap-1">
          {isContextMode ? (
            <div className="flex-1 border border-blue-400 rounded px-2 py-1.5 text-sm bg-blue-50 flex items-center gap-1.5">
              <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">ctx</span>
              <span className="text-blue-700 font-medium">{value as string}</span>
              <button
                className="ml-auto text-blue-300 hover:text-blue-500 text-sm"
                onClick={() => onChange(fieldName, isOptional ? NO_SLOT : '')}
              >
                ✕
              </button>
            </div>
          ) : (
            <input
              type="text"
              className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              defaultValue={value === NO_SLOT || value === undefined ? '' : String(value)}
              onBlur={(e) => onChange(fieldName, e.target.value)}
              placeholder={placeholder}
            />
          )}
          <button
            className={`border rounded px-2 py-1 text-sm cursor-pointer ${
              isContextMode
                ? 'border-blue-400 bg-blue-50 text-blue-500'
                : 'border-gray-300 bg-white text-gray-400 hover:text-gray-600'
            }`}
            onClick={() => setShowDropdown(!showDropdown)}
            title="Context-Variable wählen"
          >
            ⟲
          </button>
        </div>
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50">
            <ContextVariableDropdown
              variables={contextVariables}
              value={isContextMode ? (value as string) : undefined}
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
    </div>
  );
}
