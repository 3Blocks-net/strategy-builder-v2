import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import { PolicyGate, type ConfirmationProvider } from './policy-gate.js';
import { AuditLog } from './audit-log.js';
import { deposit, withdraw, simulateAction, type MoneyDeps } from './tools/money-movement.js';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ALLOWED = '0x1111111111111111111111111111111111111111';
const STRANGER = '0x9999999999999999999999999999999999999999';
const VAULT = '0xVault';
const TOKEN18 = '0x55d398326f99059fF775485246999027B3197955';

function backend() {
  const auth: AuthLike = { authHeader: () => ({ Authorization: 'Bearer t' }), refresh: vi.fn(async () => {}) };
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith('/fees')) {
      return new Response(JSON.stringify({ depositFeeBps: 100, withdrawFeeBps: 50 }), { status: 200 });
    }
    return new Response('nf', { status: 404 });
  }) as unknown as typeof fetch;
  return new BackendClient({ backendUrl: 'http://localhost:3001', auth, fetchFn });
}

function capturingGate(decision: boolean, readOnly = false) {
  const summaries: string[] = [];
  const confirmation: ConfirmationProvider = {
    requestApproval: vi.fn(async (req) => {
      summaries.push(req.summary);
      return decision;
    }),
  };
  const gate = new PolicyGate({ readOnly }, confirmation, new AuditLog({ append: async () => {} }));
  return { gate, summaries, confirmation };
}

function deps(over: Partial<MoneyDeps> = {}): MoneyDeps {
  const { gate } = capturingGate(true);
  return {
    gate,
    backend: backend(),
    tokenDecimals: { [TOKEN18.toLowerCase()]: 18 },
    config: { ownerAddress: OWNER, addressAllowlist: new Set([OWNER.toLowerCase(), ALLOWED.toLowerCase()]), maxPerToken: new Map() },
    assertVault: vi.fn(async () => {}),
    depositOnChain: vi.fn(async () => '0xdep'),
    withdrawOnChain: vi.fn(async () => '0xwd'),
    ...over,
  };
}

describe('deposit', () => {
  it('konvertiert in Base-Units, geht durchs Confirm-Gate (Fee transparent) und sendet', async () => {
    const { gate, summaries } = capturingGate(true);
    const d = deps({ gate });
    const r = await deposit(d, { vault: VAULT, token: TOKEN18, amount: '1.5' });
    expect(r.txHash).toBe('0xdep');
    expect(d.depositOnChain).toHaveBeenCalledWith({ vault: VAULT, token: TOKEN18, amountBase: '1500000000000000000' });
    expect(summaries[0]).toMatch(/100 BPS|1\.00 ?%/); // Fee transparent
  });

  it('nicht-kuratierter Token (unbekannte Decimals) → Reject, keine TX', async () => {
    const d = deps();
    await expect(deposit(d, { vault: VAULT, token: '0xUnknown', amount: '1' })).rejects.toThrow(/kurat|Decimals/i);
    expect(d.depositOnChain).not.toHaveBeenCalled();
  });

  it('über Max-Betrag → Reject, keine TX', async () => {
    const d = deps({ config: { ownerAddress: OWNER, addressAllowlist: new Set(), maxPerToken: new Map([[TOKEN18.toLowerCase(), '100']]) } });
    await expect(deposit(d, { vault: VAULT, token: TOKEN18, amount: '500' })).rejects.toThrow(/Max|Limit/i);
    expect(d.depositOnChain).not.toHaveBeenCalled();
  });

  it('Read-only → keine TX', async () => {
    const { gate } = capturingGate(true, true);
    const d = deps({ gate });
    await expect(deposit(d, { vault: VAULT, token: TOKEN18, amount: '1' })).rejects.toThrow();
    expect(d.depositOnChain).not.toHaveBeenCalled();
  });

  it('fremder/injizierter Vault (assertVault wirft) → keine TX', async () => {
    const d = deps({ assertVault: vi.fn(async () => { throw new Error('Vault gehört nicht zur verbundenen Adresse'); }) });
    await expect(deposit(d, { vault: '0xFremd', token: TOKEN18, amount: '1' })).rejects.toThrow(/gehört nicht/i);
    expect(d.depositOnChain).not.toHaveBeenCalled();
  });
});

describe('withdraw', () => {
  it('Empfänger in Allowlist + Bestätigung → sendet mit Base-Units + Empfänger im Summary', async () => {
    const { gate, summaries } = capturingGate(true);
    const d = deps({ gate });
    const r = await withdraw(d, { vault: VAULT, token: TOKEN18, amount: '2', recipient: ALLOWED });
    expect(r.txHash).toBe('0xwd');
    expect(d.withdrawOnChain).toHaveBeenCalledWith({ vault: VAULT, token: TOKEN18, amountBase: '2000000000000000000', recipient: ALLOWED });
    expect(summaries[0]).toContain(ALLOWED);
  });

  it('Empfänger NICHT in Allowlist → Reject, keine TX', async () => {
    const d = deps();
    await expect(withdraw(d, { vault: VAULT, token: TOKEN18, amount: '1', recipient: STRANGER })).rejects.toThrow(/Allowlist/i);
    expect(d.withdrawOnChain).not.toHaveBeenCalled();
  });

  it('abgelehnte Bestätigung → keine TX', async () => {
    const { gate } = capturingGate(false);
    const d = deps({ gate });
    await expect(withdraw(d, { vault: VAULT, token: TOKEN18, amount: '1', recipient: ALLOWED })).rejects.toThrow();
    expect(d.withdrawOnChain).not.toHaveBeenCalled();
  });
});

describe('simulateAction (Dry-Run)', () => {
  it('liefert Gas-Schätzung + Fee + Base-Units ohne zu senden', async () => {
    const estimate = vi.fn(async () => '210000');
    const r = await simulateAction(
      { backend: backend(), tokenDecimals: { [TOKEN18.toLowerCase()]: 18 }, estimate },
      { type: 'withdraw', vault: VAULT, token: TOKEN18, amount: '3', recipient: ALLOWED },
    );
    expect(r).toMatchObject({ type: 'withdraw', amountBase: '3000000000000000000', gasEstimate: '210000' });
    expect(r.fee).toMatch(/50 BPS/);
    expect(estimate).toHaveBeenCalledWith('withdraw', VAULT, [TOKEN18, '3000000000000000000', ALLOWED]);
  });
});
