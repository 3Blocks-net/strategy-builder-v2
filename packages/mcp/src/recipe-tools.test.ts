import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import { listRecipes } from './tools/recipe-tools.js';

const BACKEND = 'http://localhost:3001';

function client(handler: (url: string) => Response) {
  const calls: string[] = [];
  const auth: AuthLike = { authHeader: () => ({ Authorization: 'Bearer t' }), refresh: vi.fn(async () => {}) };
  const fetchFn = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    return handler(String(url));
  }) as unknown as typeof fetch;
  return { bc: new BackendClient({ backendUrl: BACKEND, auth, fetchFn }), calls };
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

describe('listRecipes', () => {
  it('liefert die kuratierten Recipe-Shapes durch', async () => {
    const recipes = [
      {
        key: 'dca',
        name: 'DCA',
        description: 'Dollar-Cost-Averaging',
        category: 'accumulation',
        shape: {
          nodes: [
            { id: 'trigger', stepType: 'Interval Condition', params: { interval: 'INTERVALL' } },
            { id: 'buy', stepType: 'PancakeSwap V3 Swap', params: { tokenIn: 'TOKEN_IN' } },
          ],
          edges: [{ source: 'trigger', target: 'buy', sourceHandle: 'out' }],
        },
      },
    ];
    const { bc, calls } = client((u) => (u.endsWith('/recipes') ? json(recipes) : json('nf', 404)));
    await expect(listRecipes(bc)).resolves.toEqual(recipes);
    expect(calls[0]).toBe(`${BACKEND}/recipes`);
  });

  it('leerer Katalog → []', async () => {
    const { bc } = client((u) => (u.endsWith('/recipes') ? json([]) : json('nf', 404)));
    await expect(listRecipes(bc)).resolves.toEqual([]);
  });
});
