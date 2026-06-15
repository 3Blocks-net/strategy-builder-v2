import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import { makeAssertOwnedVault } from './vault-guard.js';

const MINE = '0x1111111111111111111111111111111111111111';
const FOREIGN = '0x9999999999999999999999999999999999999999';

function backend() {
  const auth: AuthLike = { authHeader: () => ({ Authorization: 'Bearer t' }), refresh: vi.fn(async () => {}) };
  const fetchFn = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith('/vaults')
      ? new Response(JSON.stringify([{ address: MINE, label: 'M', depositToken: '0xt', chainId: 56 }]), { status: 200 })
      : new Response('nf', { status: 404 }),
  ) as unknown as typeof fetch;
  return new BackendClient({ backendUrl: 'http://localhost:3001', auth, fetchFn });
}

describe('makeAssertOwnedVault', () => {
  it('akzeptiert einen Vault der verbundenen Adresse', async () => {
    await expect(makeAssertOwnedVault(backend())(MINE)).resolves.toBeUndefined();
  });

  it('lehnt eine fremde/injizierte Vault-Adresse ab (vor dem Signieren)', async () => {
    await expect(makeAssertOwnedVault(backend())(FOREIGN)).rejects.toThrow(/gehört nicht/i);
  });
});
