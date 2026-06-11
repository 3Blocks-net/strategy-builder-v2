import { describe, it, expect, vi } from 'vitest';
import { encryptKeystoreJsonSync } from 'ethers';
import { connectOwnerSession, type SessionDeps } from './session.js';
import { whoami } from './tools/whoami.js';
import type { McpConfig } from './config.js';

const PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PASSWORD = 'pw-in-keychain';

const keystoreJson = encryptKeystoreJsonSync(
  { address: ADDRESS, privateKey: PRIVATE_KEY },
  PASSWORD,
  { scrypt: { N: 1 << 8 } },
);

const cfg: McpConfig = {
  backendUrl: 'http://localhost:3000',
  frontendUrl: 'http://localhost:5173',
  chainId: 56,
  keystorePath: '/secure/keystore.json',
  keychainAccount: 'default',
  readOnly: false,
  auditLogPath: '/tmp/pecunity-test-audit.log',
};

function okFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith('/auth/nonce')) return new Response(JSON.stringify({ nonce: 'nonce12345678' }), { status: 200 });
    if (u.endsWith('/auth/verify'))
      return new Response(JSON.stringify({ accessToken: 'a', refreshToken: 'r' }), { status: 200 });
    return new Response('nf', { status: 404 });
  }) as unknown as typeof fetch;
}

function deps(over: Partial<SessionDeps> = {}): SessionDeps {
  return {
    readPassword: vi.fn(async () => PASSWORD),
    readKeystoreFile: vi.fn(async () => keystoreJson),
    fetchFn: okFetch(),
    ...over,
  };
}

describe('connectOwnerSession', () => {
  it('verbindet, leitet die Owner-Adresse ab und whoami liefert sie', async () => {
    const session = await connectOwnerSession(cfg, deps());
    expect(session.address).toBe(ADDRESS);
    expect(whoami(session)).toEqual({ address: ADDRESS });
    expect(session.auth.accessToken).toBe('a');
  });

  it('wirft einen klaren, sicheren Fehler ohne Passwort, wenn der Keychain leer ist', async () => {
    const d = deps({ readPassword: vi.fn(async () => null) });
    let caught: unknown;
    try {
      await connectOwnerSession(cfg, d);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const text = (caught as Error).message + ((caught as Error).stack ?? '');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(PRIVATE_KEY);
    // verweist auf den Init-Weg
    expect((caught as Error).message.toLowerCase()).toContain('init');
  });

  it('wirft einen sicheren Fehler bei falschem Keychain-Passwort (kein Key-Leak)', async () => {
    const d = deps({ readPassword: vi.fn(async () => 'wrong') });
    let caught: unknown;
    try {
      await connectOwnerSession(cfg, d);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const text = (caught as Error).message + ((caught as Error).stack ?? '');
    expect(text).not.toContain(PRIVATE_KEY);
    expect(text).not.toContain('wrong');
  });
});
