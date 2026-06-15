import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import { loadTokenDecimals } from './automation-deps.js';

const auth: AuthLike = { authHeader: () => ({ Authorization: 'Bearer t' }), refresh: vi.fn(async () => {}) };

function backendWith(routes: Record<string, unknown>): BackendClient {
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    const path = String(url).replace('http://localhost:3001', '');
    if (path in routes) return new Response(JSON.stringify(routes[path]), { status: 200 });
    return new Response('nf', { status: 404 });
  }) as unknown as typeof fetch;
  return new BackendClient({ backendUrl: 'http://localhost:3001', auth, fetchFn });
}

describe('loadTokenDecimals', () => {
  // Regression: alle Token-Endpunkte liefern `{ tokens: [...] }` (Objekt, kein Array).
  // Früher iterierte der Loader die Protokoll-Listen direkt → "is not iterable" und
  // riss damit propose_automation + alle Geld-Tools mit.
  it('packt die { tokens }-Objektform aller drei Endpunkte aus', async () => {
    const backend = backendWith({
      '/tokens?protocol=aave': { tokens: [{ address: '0xAaa', decimals: 18 }] },
      '/tokens?protocol=pancakeswap': { tokens: [{ address: '0xBbb', decimals: 8 }] },
      '/tokens/accepted': { tokens: [{ address: '0xCcc', decimals: 6 }] },
    });
    const decimals = await loadTokenDecimals(backend);
    expect(decimals).toEqual({ '0xaaa': 18, '0xbbb': 8, '0xccc': 6 });
  });

  it('toleriert auch die bare-Array-Form (Abwärtskompatibilität)', async () => {
    const backend = backendWith({
      '/tokens?protocol=aave': [{ address: '0xAaa', decimals: 18 }],
      '/tokens?protocol=pancakeswap': { tokens: [] },
      '/tokens/accepted': { tokens: [] },
    });
    await expect(loadTokenDecimals(backend)).resolves.toEqual({ '0xaaa': 18 });
  });

  it('fehlende/fehlerhafte Endpunkte sind best-effort (kein Throw)', async () => {
    const backend = backendWith({
      '/tokens/accepted': { tokens: [{ address: '0xCcc', decimals: 6 }] },
      // aave/pancakeswap fehlen → 404 → geschluckt
    });
    await expect(loadTokenDecimals(backend)).resolves.toEqual({ '0xccc': 6 });
  });
});
