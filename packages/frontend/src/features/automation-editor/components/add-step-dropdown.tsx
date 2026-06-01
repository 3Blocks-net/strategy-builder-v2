import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { StepTypeOption } from '../store/editor-store';

interface AddStepDropdownProps {
  stepTypes: StepTypeOption[];
  onAdd: (stepType: StepTypeOption) => void;
}

export function AddStepDropdown({ stepTypes, onAdd }: AddStepDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const conditions = stepTypes.filter((s) => s.category === 'CONDITION');
  const actions = stepTypes.filter((s) => s.category === 'ACTION');

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
      >
        + Add Step
      </Button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
          {conditions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 bg-blue-50 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                Conditions
              </div>
              {conditions.map((st) => (
                <button
                  key={st.id}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  onClick={() => {
                    onAdd(st);
                    setOpen(false);
                  }}
                >
                  <div className="text-sm font-medium text-gray-900">
                    {st.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {st.description}
                  </div>
                </button>
              ))}
            </div>
          )}
          {actions.length > 0 && (
            <div>
              <div className="px-3 py-1.5 bg-amber-50 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                Actions
              </div>
              {actions.map((st) => (
                <button
                  key={st.id}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                  onClick={() => {
                    onAdd(st);
                    setOpen(false);
                  }}
                >
                  <div className="text-sm font-medium text-gray-900">
                    {st.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {st.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
