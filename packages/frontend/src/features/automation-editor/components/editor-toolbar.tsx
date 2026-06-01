import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { AddStepDropdown } from './add-step-dropdown';
import { useEditorStore, type StepTypeOption } from '../store/editor-store';

interface EditorToolbarProps {
  stepTypes: StepTypeOption[];
  onAddStep: (stepType: StepTypeOption) => void;
  label: string;
  onLabelChange: (label: string) => void;
}

export function EditorToolbar({
  stepTypes,
  onAddStep,
  label,
  onLabelChange,
}: EditorToolbarProps) {
  const navigate = useNavigate();
  const { address } = useParams<{ address: string }>();
  const errorCount = useEditorStore((s) => s.validationErrors.length);

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/vault/${address}`)}
      >
        &larr; Back
      </Button>
      <div className="h-5 w-px bg-gray-200" />
      <input
        type="text"
        value={label}
        onChange={(e) => onLabelChange(e.target.value)}
        placeholder="Automation name..."
        className="text-sm font-medium border-none bg-transparent focus:outline-none focus:ring-0 w-48"
      />
      <div className="h-5 w-px bg-gray-200" />
      <AddStepDropdown stepTypes={stepTypes} onAdd={onAddStep} />
      <div className="flex-1" />
      {errorCount > 0 && (
        <div className="flex items-center gap-1.5 text-red-600">
          <span className="bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {errorCount}
          </span>
          <span className="text-xs font-medium">
            {errorCount === 1 ? 'error' : 'errors'}
          </span>
        </div>
      )}
    </div>
  );
}
