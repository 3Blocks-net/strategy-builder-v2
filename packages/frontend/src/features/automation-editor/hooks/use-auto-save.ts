import { useEffect, useRef } from 'react';
import { useEditorStore } from '../store/editor-store';
import { apiFetch } from '@/lib/api';

const AUTO_SAVE_DELAY = 5000;
const SAVED_DISPLAY_DURATION = 2000;

export function useAutoSave(vaultAddress: string | undefined, automationId: string | null) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const label = useEditorStore((s) => s.label);
  const description = useEditorStore((s) => s.description);
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async () => {
    if (!vaultAddress || !automationId) return;
    setSaveStatus('saving');
    try {
      const res = await apiFetch(`/vaults/${vaultAddress}/automations/${automationId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          editorState: { nodes, edges },
          label,
          description,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveStatus('saved');
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVED_DISPLAY_DURATION);
    } catch {
      setSaveStatus('error');
    }
  };

  useEffect(() => {
    if (!isDirty || !automationId) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, AUTO_SAVE_DELAY);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isDirty, nodes, edges, label, description, automationId]);

  // Save on unmount if dirty
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Warn on browser close if dirty
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (useEditorStore.getState().isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return { saveNow: save };
}
