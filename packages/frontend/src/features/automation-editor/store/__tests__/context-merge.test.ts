import { describe, it, expect, beforeEach } from 'vitest';
import {
  useEditorStore,
  mergeContextVariables,
  type ContextVariable,
} from '../editor-store';

function v(slotIndex: number, name: string, extra: Partial<ContextVariable> = {}): ContextVariable {
  return { slotIndex, name, type: 'uint256', description: '', ...extra };
}

describe('mergeContextVariables', () => {
  it('returns overlay entries when base is empty', () => {
    const result = mergeContextVariables([], [v(0, 'amount')]);
    expect(result).toEqual([v(0, 'amount')]);
  });

  it('keeps base entries when overlay is empty', () => {
    const result = mergeContextVariables([v(0, 'amount')], []);
    expect(result).toEqual([v(0, 'amount')]);
  });

  it('unions slots from both sources by slotIndex', () => {
    const result = mergeContextVariables([v(0, 'fromVault')], [v(1, 'fromDraft')]);
    expect(result.map((x) => x.name)).toEqual(['fromVault', 'fromDraft']);
  });

  it('lets overlay win on slotIndex conflict', () => {
    const result = mergeContextVariables(
      [v(0, 'vaultName', { description: 'vault' })],
      [v(0, 'draftName', { description: 'draft' })],
    );
    expect(result).toEqual([v(0, 'draftName', { description: 'draft' })]);
  });

  it('sorts result by slotIndex', () => {
    const result = mergeContextVariables([v(2, 'b')], [v(0, 'a'), v(1, 'mid')]);
    expect(result.map((x) => x.slotIndex)).toEqual([0, 1, 2]);
  });
});

describe('editor-store context loading (race-free)', () => {
  beforeEach(() => {
    useEditorStore.getState().setContextVariables([]);
  });

  it('draft variables survive when vault slots are empty (the bug)', () => {
    // Draft (auto-saved editorState) arrives first, then empty vault context-slots.
    useEditorStore.getState().mergeEditorContextVariables([v(0, 'myDraftVar')]);
    useEditorStore.getState().mergeVaultContextSlots([]);

    expect(useEditorStore.getState().contextVariables).toEqual([v(0, 'myDraftVar')]);
  });

  it('is order-independent: vault slots first, then draft', () => {
    useEditorStore.getState().mergeVaultContextSlots([v(0, 'vaultSlot')]);
    useEditorStore.getState().mergeEditorContextVariables([v(1, 'draftVar')]);

    const names = useEditorStore.getState().contextVariables.map((x) => x.name);
    expect(names).toEqual(['vaultSlot', 'draftVar']);
  });

  it('is order-independent: draft first, then vault slots', () => {
    useEditorStore.getState().mergeEditorContextVariables([v(1, 'draftVar')]);
    useEditorStore.getState().mergeVaultContextSlots([v(0, 'vaultSlot')]);

    const names = useEditorStore.getState().contextVariables.map((x) => x.name);
    expect(names).toEqual(['vaultSlot', 'draftVar']);
  });

  it('draft edits win over deployed vault slot on the same slotIndex', () => {
    // Same slot index, but the draft has the user's edited name/description.
    useEditorStore.getState().mergeVaultContextSlots([
      v(0, 'oldName', { description: 'deployed', createdByAutomationId: 'a1' }),
    ]);
    useEditorStore.getState().mergeEditorContextVariables([
      v(0, 'editedName', { description: 'edited', createdByAutomationId: 'a1' }),
    ]);

    expect(useEditorStore.getState().contextVariables).toEqual([
      v(0, 'editedName', { description: 'edited', createdByAutomationId: 'a1' }),
    ]);
  });
});
