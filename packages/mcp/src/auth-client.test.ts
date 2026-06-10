import { describe, it, expect, vi } from 'vitest';
import { inspect } from 'node:util';
import { SiweMessage } from 'siwe';
import { AuthClient, type MessageSigner } from './auth-client.js';

const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const BACKEND = 'http://localhost:3000';
const FRONTEND = 'http://localhost:5173';

function stubSigner(): MessageSigner {
  return {
    address: ADDRESS,
    signMessage: vi.fn(async (message: string) => `0xsig(${message.length})`),
  };
}

/** Fake fetch, das die drei Auth-Endpunkte deterministisch bedient. */
function fakeBackend(overrides: Partial<Record<string, unknown>> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/auth/nonce')) {
      return new Response(JSON.stringify({ nonce: 'noncedeadbeef0123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (u.endsWith('/auth/verify')) {
      return new Response(
        JSON.stringify({ accessToken: 'access.jwt.token', refreshToken: 'refresh-secret' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: 'access.jwt.token.v2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls, ...overrides };
}

function makeClient(signer = stubSigner(), backend = fakeBackend()) {
  const client = new AuthClient({
    backendUrl: BACKEND,
    frontendUrl: FRONTEND,
    chainId: 56,
    signer,
    fetchFn: backend.fetchFn,
  });
  return { client, signer, backend };
}

describe('AuthClient', () => {
  it('führt den vollen SIWE-Handshake aus und speichert die Tokens', async () => {
    const { client, signer, backend } = makeClient();
    await client.authenticate();

    const urls = backend.calls.map((c) => c.url);
    expect(urls.some((u) => u.endsWith('/auth/nonce'))).toBe(true);
    const verifyCall = backend.calls.find((c) => c.url.endsWith('/auth/verify'));
    expect(verifyCall).toBeDefined();

    const body = JSON.parse(String(verifyCall!.init!.body));
    // Die signierte Nachricht enthält die Backend-Nonce.
    expect(body.message).toContain('noncedeadbeef0123');
    // Signatur stammt aus dem Signer.
    expect(signer.signMessage).toHaveBeenCalledWith(body.message);
    expect(body.signature).toBe(`0xsig(${String(body.message).length})`);

    expect(client.accessToken).toBe('access.jwt.token');
    expect(client.authHeader()).toEqual({ Authorization: 'Bearer access.jwt.token' });
  });

  it('signiert mit dem Frontend-Host als SIWE-domain', async () => {
    const { client, backend } = makeClient();
    await client.authenticate();
    const verifyCall = backend.calls.find((c) => c.url.endsWith('/auth/verify'))!;
    const { message } = JSON.parse(String(verifyCall.init!.body));
    const parsed = new SiweMessage(message);
    expect(parsed.domain).toBe('localhost:5173');
    expect(parsed.address).toBe(ADDRESS);
    expect(parsed.nonce).toBe('noncedeadbeef0123');
    expect(parsed.chainId).toBe(56);
  });

  it('erneuert den Access-Token über /auth/refresh', async () => {
    const { client, backend } = makeClient();
    await client.authenticate();
    await client.refresh();
    const refreshCall = backend.calls.find((c) => c.url.endsWith('/auth/refresh'))!;
    const body = JSON.parse(String(refreshCall.init!.body));
    expect(body.refreshToken).toBe('refresh-secret');
    expect(client.accessToken).toBe('access.jwt.token.v2');
  });

  it('wirft einen sicheren Fehler, wenn das Backend die Signatur ablehnt', async () => {
    const backend = fakeBackend();
    (backend.fetchFn as ReturnType<typeof vi.fn>).mockImplementation(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/auth/nonce')) {
        return new Response(JSON.stringify({ nonce: 'n' }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: 'SIGNATURE_INVALID' }), { status: 401 });
    });
    const { client } = makeClient(stubSigner(), backend);
    await expect(client.authenticate()).rejects.toThrow();
    expect(client.accessToken).toBeUndefined();
  });

  it('leakt die Tokens nicht über Serialisierung/Inspect', async () => {
    const { client } = makeClient();
    await client.authenticate();
    const views = [JSON.stringify(client) ?? '', inspect(client, { depth: 5 }), String(client)];
    for (const view of views) {
      expect(view).not.toContain('access.jwt.token');
      expect(view).not.toContain('refresh-secret');
    }
  });
});
