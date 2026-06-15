import { describe, it, expect } from 'vitest';
import { DraftStore, type Draft } from './draft-store.js';

const draft: Draft = {
  vaultAddress: '0xVault',
  automationId: 'auto-1',
  rawGraph: { nodes: [], edges: [] },
  contextOverrides: {},
  ownerOnly: false,
  summary: { steps: [], execution: 'public', warnings: [] },
  catalog: {},
};

describe('DraftStore', () => {
  it('legt einen Entwurf ab und gibt ihn unter der ID unverändert zurück', () => {
    let id = 0;
    const store = new DraftStore({ genId: () => `draft-${++id}` });
    const draftId = store.create(draft);
    expect(draftId).toBe('draft-1');
    expect(store.get(draftId)).toEqual(draft);
  });

  it('unbekannte ID → undefined', () => {
    const store = new DraftStore();
    expect(store.get('nope')).toBeUndefined();
  });

  it('abgelaufene Drafts (TTL) werden nicht mehr geliefert', () => {
    let now = 1000;
    const store = new DraftStore({ ttlMs: 100, clock: () => now, genId: () => 'd' });
    store.create(draft);
    now = 1050;
    expect(store.get('d')).toEqual(draft); // noch gültig
    now = 1101;
    expect(store.get('d')).toBeUndefined(); // abgelaufen
  });

  it('consume liefert den Entwurf genau einmal (Replay-Schutz)', () => {
    const store = new DraftStore({ genId: () => 'd' });
    store.create(draft);
    expect(store.consume('d')).toEqual(draft);
    expect(store.consume('d')).toBeUndefined(); // einmalig
    expect(store.get('d')).toBeUndefined();
  });

  it('hat keinen Update-Pfad — der gespeicherte Graph ist immutabel (LLM kann ihn nicht ändern)', () => {
    const store = new DraftStore();
    // Öffentliche API bietet nur create/get — kein update/set.
    expect((store as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((store as unknown as Record<string, unknown>).set).toBeUndefined();
  });
});
