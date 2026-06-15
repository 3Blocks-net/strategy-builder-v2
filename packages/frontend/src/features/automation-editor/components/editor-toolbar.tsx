import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { AddStepDropdown } from './add-step-dropdown';
import { useEditorStore, type StepTypeOption } from '../store/editor-store';

interface EditorToolbarProps {
  stepTypes: StepTypeOption[];
  onAddStep: (stepType: StepTypeOption) => void;
  label: string;
  onLabelChange: (label: string) => void;
  onDeploy: () => void;
}

export function EditorToolbar({
  stepTypes,
  onAddStep,
  label,
  onLabelChange,
  onDeploy,
}: EditorToolbarProps) {
  const navigate = useNavigate();
  const { address } = useParams<{ address: string }>();
  const errorCount = useEditorStore((s) => s.validationErrors.length);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const applyAutoLayout = useEditorStore((s) => s.applyAutoLayout);

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
      <div className="h-5 w-px bg-gray-200" />
      <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
        Undo
      </Button>
      <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
        Redo
      </Button>
      <Button variant="ghost" size="sm" onClick={applyAutoLayout} title="Auto-Layout">
        Layout
      </Button>
      <div className="flex-1" />
      {saveStatus === 'saving' && (
        <span className="text-xs text-gray-400">Saving...</span>
      )}
      {saveStatus === 'saved' && (
        <span className="text-xs text-green-500">Saved</span>
      )}
      {saveStatus === 'error' && (
        <span className="text-xs text-red-500">Save failed</span>
      )}
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
      <Button size="sm" onClick={onDeploy} disabled={errorCount > 0}>
        Deploy
      </Button>
    </div>
  );
}
