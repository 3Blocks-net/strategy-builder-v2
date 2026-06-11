import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import { PolicyGate, type ConfirmationProvider } from './policy-gate.js';
import { AuditLog } from './audit-log.js';
import { createVault, type CreateVaultDeps } from './tools/create-vault.js';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
const TOKEN = '0x55d398326f99059fF775485246999027B3197955';
const BACKEND = 'http://localhost:3001';

function backend(postCalls: { path: string; body: unknown }[] = []) {
  const auth: AuthLike = { authHeader: () => ({ Authorization: 'Bearer t' }), refresh: vi.fn(async () => {}) };
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/tokens/accepted')) {
      return new Response(JSON.stringify({ tokens: [{ address: TOKEN, symbol: 'USDT', decimals: 18 }] }), { status: 200 });
    }
    if (u.endsWith('/vaults') && init?.method === 'POST') {
      postCalls.push({ path: '/vaults', body: JSON.parse(String(init.body)) });
      return new Response('', { status: 201 });
    }
    return new Response('nf', { status: 404 });
  }) as unknown as typeof fetch;
  return new BackendClient({ backendUrl: BACKEND, auth, fetchFn });
}

function gate(decision: boolean, readOnly = false) {
  const confirmation: ConfirmationProvider = { requestApproval: vi.fn(async () => decision) };
  const audit = new AuditLog({ append: async () => {} });
  return new PolicyGate({ readOnly }, confirmation, audit);
}

function deps(over: Partial<CreateVaultDeps> = {}, postCalls: any[] = []): CreateVaultDeps {
  return {
    backend: backend(postCalls),
    gate: gate(true),
    ownerAddress: OWNER,
    chainId: 56,
    sendCreateVault: vi.fn(async () => ({ vaultAddress: '0xVault', txHash: '0xtx', blockNumber: 123 })),
    ...over,
  };
}

describe('createVault', () => {
  it('validiert Token, geht durchs Gate, sendet, registriert und liefert Adresse+TX', async () => {
    const postCalls: any[] = [];
    const d = deps({}, postCalls);
    const result = await createVault(d, { depositToken: TOKEN, label: 'Main' });

    expect(result).toEqual({ vaultAddress: '0xVault', txHash: '0xtx' });
    expect(d.sendCreateVault).toHaveBeenCalledWith({ owner: OWNER, depositToken: TOKEN });
    expect(postCalls[0].body).toMatchObject({
      address: '0xVault',
      chainId: 56,
      depositToken: TOKEN,
      txHash: '0xtx',
      createdAtBlock: 123,
      label: 'Main',
    });
  });

  it('lehnt einen nicht akzeptierten Deposit-Token ab — KEINE TX', async () => {
    const send = vi.fn();
    const d = deps({ sendCreateVault: send as any });
    await expect(
      createVault(d, { depositToken: '0xUnacceptedTokenAddress0000000000000000', label: 'X' }),
    ).rejects.toThrow(/nicht.*akzeptiert|FeeRegistry/i);
    expect(send).not.toHaveBeenCalled();
  });

  it('Read-only-Modus → keine TX', async () => {
    const send = vi.fn();
    const d = deps({ gate: gate(true, true), sendCreateVault: send as any });
    await expect(createVault(d, { depositToken: TOKEN })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('abgelehnte Bestätigung → keine TX', async () => {
    const send = vi.fn();
    const d = deps({ gate: gate(false), sendCreateVault: send as any });
    await expect(createVault(d, { depositToken: TOKEN })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
