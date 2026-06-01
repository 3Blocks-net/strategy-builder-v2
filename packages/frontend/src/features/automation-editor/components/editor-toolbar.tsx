import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { AddStepDropdown } from './add-step-dropdown';
import type { StepTypeOption } from '../store/editor-store';

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
    </div>
  );
}
