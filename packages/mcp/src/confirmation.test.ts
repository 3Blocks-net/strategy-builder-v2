import { describe, it, expect, vi } from 'vitest';
import {
  ElicitationConfirmationProvider,
  PendingApprovals,
} from './confirmation.js';

const req = { tool: 'create_vault', summary: 'Vault erstellen', details: {} };

describe('ElicitationConfirmationProvider', () => {
  it('accept + confirm:true → freigegeben', async () => {
    const elicitInput = vi.fn(async () => ({ action: 'accept', content: { confirm: true } }));
    const p = new ElicitationConfirmationProvider({ elicitInput } as any);
    await expect(p.requestApproval(req)).resolves.toBe(true);
  });

  it('decline → abgelehnt (false)', async () => {
    const elicitInput = vi.fn(async () => ({ action: 'decline' }));
    const p = new ElicitationConfirmationProvider({ elicitInput } as any);
    await expect(p.requestApproval(req)).resolves.toBe(false);
  });

  it('accept aber confirm:false → abgelehnt', async () => {
    const elicitInput = vi.fn(async () => ({ action: 'accept', content: { confirm: false } }));
    const p = new ElicitationConfirmationProvider({ elicitInput } as any);
    await expect(p.requestApproval(req)).resolves.toBe(false);
  });

  it('Timeout/Fehler des Clients → wirft (hartes Fail, kein stilles true)', async () => {
    const elicitInput = vi.fn(async () => {
      throw new Error('request timed out');
    });
    const p = new ElicitationConfirmationProvider({ elicitInput } as any);
    await expect(p.requestApproval(req)).rejects.toThrow();
  });
});

describe('PendingApprovals — einmaliges, nicht fälschbares Token', () => {
  it('gültiges Token löst die Freigabe auf', async () => {
    const pending = new PendingApprovals();
    const { token, promise } = pending.create();
    expect(pending.redeem(token, true)).toBe(true);
    await expect(promise).resolves.toBe(true);
  });

  it('unbekanntes Token kann nicht eingelöst werden (nicht fälschbar)', () => {
    const pending = new PendingApprovals();
    expect(pending.redeem('deadbeef', true)).toBe(false);
  });

  it('Token ist einmalig — zweites Einlösen schlägt fehl', async () => {
    const pending = new PendingApprovals();
    const { token, promise } = pending.create();
    expect(pending.redeem(token, false)).toBe(true);
    await expect(promise).resolves.toBe(false);
    expect(pending.redeem(token, true)).toBe(false);
  });
});
