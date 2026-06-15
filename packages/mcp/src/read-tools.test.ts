import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import {
  listVaults,
  getVault,
  getPortfolio,
  listAutomations,
  getExecutions,
  getPositions,
  getPerformance,
  getValueHistory,
} from './tools/read-tools.js';

const BACKEND = 'http://localhost:3000';
const MY_VAULT = '0x1111111111111111111111111111111111111111';
const FOREIGN_VAULT = '0x9999999999999999999999999999999999999999';

function auth(): AuthLike {
  return {
    authHeader: () => ({ Authorization: 'Bearer token.v1' }),
    refresh: vi.fn(async () => {}),
  };
}

type Handler = (url: string, init?: RequestInit) => Response;

function client(handler: Handler, a: AuthLike = auth()) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  return { bc: new BackendClient({ backendUrl: BACKEND, auth: a, fetchFn }), calls, auth: a };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('listVaults', () => {
  it('liefert strukturierte Vaults des Owners und sendet den Auth-Header', async () => {
    const { bc, calls } = client((u) =>
      u.endsWith('/vaults')
        ? json([
            { address: MY_VAULT, label: 'Main', depositToken: '0xtok', chainId: 56, txHash: '0xabc' },
          ])
        : json('nf', 404),
    );
    const vaults = await listVaults(bc);
    expect(vaults).toEqual([
      { address: MY_VAULT, label: 'Main', depositToken: '0xtok', chainId: 56 },
    ]);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer token.v1');
  });

  it('gibt bei keinem Vault eine leere Liste zurück (kein Fehler)', async () => {
    const { bc } = client((u) => (u.endsWith('/vaults') ? json([]) : json('nf', 404)));
    await expect(listVaults(bc)).resolves.toEqual([]);
  });
});

describe('getPortfolio — Owner-Isolation', () => {
  it('liefert das Portfolio des eigenen Vaults', async () => {
    const { bc } = client((u) =>
      u.endsWith(`/vaults/${MY_VAULT}/portfolio`)
        ? json({ positions: [{ token: '0xtok', balance: '5', usdValue: '5.00' }], totalUsd: '5.00' })
        : json('nf', 404),
    );
    const p = await getPortfolio(bc, MY_VAULT);
    expect(p).toEqual({ positions: [{ token: '0xtok', balance: '5', usdValue: '5.00' }], totalUsd: '5.00' });
  });

  it('lehnt fremde Vaults klar ab (Backend 403) — kein Daten-Leak', async () => {
    const { bc } = client((u) =>
      u.endsWith(`/vaults/${FOREIGN_VAULT}/portfolio`) ? json({ message: 'FORBIDDEN' }, 403) : json('nf', 404),
    );
    await expect(getPortfolio(bc, FOREIGN_VAULT)).rejects.toThrow(/nicht.*verbundenen Adresse|gehört nicht/i);
  });
});

describe('getVault', () => {
  it('kombiniert Owner-Vault + Gas-Deposit', async () => {
    const { bc } = client((u) => {
      if (u.endsWith('/vaults'))
        return json([{ address: MY_VAULT, label: 'Main', depositToken: '0xtok', chainId: 56 }]);
      if (u.endsWith(`/vaults/${MY_VAULT}/gas-deposit`))
        return json({ enabled: true, token: '0xtok', deposited: '100', minFeeDeposit: '10' });
      return json('nf', 404);
    });
    const v = await getVault(bc, MY_VAULT);
    expect(v).toEqual({
      address: MY_VAULT,
      label: 'Main',
      depositToken: '0xtok',
      chainId: 56,
      gasDeposit: { enabled: true, token: '0xtok', deposited: '100', minFeeDeposit: '10' },
    });
  });

  it('verweigert einen Vault, der nicht zur verbundenen Adresse gehört', async () => {
    const { bc } = client((u) => (u.endsWith('/vaults') ? json([]) : json('nf', 404)));
    await expect(getVault(bc, FOREIGN_VAULT)).rejects.toThrow(/nicht.*verbundenen Adresse|gehört nicht/i);
  });
});

describe('listAutomations', () => {
  it('mappt ownerOnly→scope, active und Schrittzahl', async () => {
    const { bc } = client((u) =>
      u.endsWith(`/vaults/${MY_VAULT}/automations`)
        ? json([
            { id: 'a1', onChainId: 7, label: 'DCA', description: 'weekly', ownerOnly: false, stepCount: 3, active: true, triggerStatus: 'ready', editorState: { huge: true } },
          ])
        : json('nf', 404),
    );
    const list = await listAutomations(bc, MY_VAULT);
    expect(list).toEqual([
      { id: 'a1', onChainId: 7, label: 'DCA', description: 'weekly', scope: 'public', stepCount: 3, active: true, triggerStatus: 'ready' },
    ]);
    // editorState (groß, irrelevant fürs LLM) wird nicht durchgereicht
    expect(JSON.stringify(list)).not.toContain('huge');
  });

  it('leere Automations-Liste → []', async () => {
    const { bc } = client((u) => (u.includes('/automations') ? json([]) : json('nf', 404)));
    await expect(listAutomations(bc, MY_VAULT)).resolves.toEqual([]);
  });
});

describe('getExecutions', () => {
  it('sortiert Runs, Transfers und dekodierte Fehlschläge in Buckets', async () => {
    const { bc } = client((u) =>
      u.includes(`/vaults/${MY_VAULT}/executions`)
        ? json({
            total: 3,
            page: 1,
            pageSize: 20,
            rows: [
              { kind: 'execution', id: 'e1', txHash: '0xrun', automationId: 7, blockTimestamp: '2026-01-01T00:00:00Z', gasCompAmount: '1', gasCompToken: '0xt', gasCompUsd: '1.0' },
              { kind: 'vault_event', id: 'v1', txHash: '0xdep', eventType: 'DEPOSIT', token: '0xt', amount: '50', amountUsd: '50', feeAmount: '1', feeBps: 20, blockTimestamp: '2026-01-02T00:00:00Z' },
              { kind: 'failure', id: 'f1', txHash: '0xfail', automationId: 7, errorMessage: 'Step 2: Aave health factor too low', failureStatus: 'open', attemptCount: 3, blockTimestamp: '2026-01-03T00:00:00Z' },
            ],
          })
        : json('nf', 404),
    );
    const ex = await getExecutions(bc, MY_VAULT);
    expect(ex.total).toBe(3);
    expect(ex.runs).toEqual([
      { id: 'e1', txHash: '0xrun', automationId: 7, timestamp: '2026-01-01T00:00:00Z', gasComp: { amount: '1', token: '0xt', usd: '1.0' } },
    ]);
    expect(ex.transfers).toEqual([
      { id: 'v1', txHash: '0xdep', type: 'DEPOSIT', token: '0xt', amount: '50', amountUsd: '50', fee: { amount: '1', bps: 20 }, timestamp: '2026-01-02T00:00:00Z' },
    ]);
    expect(ex.failures).toEqual([
      { id: 'f1', txHash: '0xfail', automationId: 7, reason: 'Step 2: Aave health factor too low', status: 'open', attemptCount: 3, timestamp: '2026-01-03T00:00:00Z' },
    ]);
  });

  it('leerer Verlauf → leere Buckets, kein Fehler', async () => {
    const { bc } = client((u) =>
      u.includes('/executions') ? json({ total: 0, page: 1, pageSize: 20, rows: [] }) : json('nf', 404),
    );
    const ex = await getExecutions(bc, MY_VAULT);
    expect(ex).toEqual({ total: 0, page: 1, pageSize: 20, runs: [], transfers: [], failures: [] });
  });
});

describe('getPositions — DeFi-Positionssicht', () => {
  const view = {
    vaultAddress: MY_VAULT,
    totalValueUsd: 1234.5,
    netEquityUsd: 1200,
    positions: [{ protocol: 'aave', kind: 'supplied', token: '0xt', amount: '10', usdValue: '10', healthFactor: '1.8' }],
    source: 'snapshot',
  };

  it('liefert die Positionssicht des eigenen Vaults (Passthrough)', async () => {
    const { bc, calls } = client((u) =>
      u.endsWith(`/vaults/${MY_VAULT}/positions`) ? json(view) : json('nf', 404),
    );
    await expect(getPositions(bc, MY_VAULT)).resolves.toEqual(view);
    expect(calls[0].url).toBe(`${BACKEND}/vaults/${MY_VAULT}/positions`);
  });

  it('reicht refresh=1 als Query durch', async () => {
    const { bc, calls } = client((u) =>
      u.includes(`/vaults/${MY_VAULT}/positions`) ? json(view) : json('nf', 404),
    );
    await getPositions(bc, MY_VAULT, { refresh: true });
    expect(calls[0].url).toBe(`${BACKEND}/vaults/${MY_VAULT}/positions?refresh=1`);
  });

  it('lehnt fremde Vaults ab (403)', async () => {
    const { bc } = client((u) =>
      u.includes(`/vaults/${FOREIGN_VAULT}/positions`) ? json({ message: 'FORBIDDEN' }, 403) : json('nf', 404),
    );
    await expect(getPositions(bc, FOREIGN_VAULT)).rejects.toThrow(/gehört nicht|verbundenen Adresse/i);
  });
});

describe('getPerformance & getValueHistory', () => {
  it('getPerformance reicht den Range durch (Passthrough)', async () => {
    const perf = { range: '7d', pnlUsd: 12.3, netDepositsUsd: 100, costsUsd: 2.1 };
    const { bc, calls } = client((u) =>
      u.includes(`/vaults/${MY_VAULT}/performance`) ? json(perf) : json('nf', 404),
    );
    await expect(getPerformance(bc, MY_VAULT, { range: '7d' })).resolves.toEqual(perf);
    expect(calls[0].url).toBe(`${BACKEND}/vaults/${MY_VAULT}/performance?range=7d`);
  });

  it('getValueHistory reicht den Range durch (Passthrough)', async () => {
    const hist = { range: '30d', points: [{ t: '2026-01-01', usd: 100 }], markers: [] };
    const { bc, calls } = client((u) =>
      u.includes(`/vaults/${MY_VAULT}/value-history`) ? json(hist) : json('nf', 404),
    );
    await expect(getValueHistory(bc, MY_VAULT, { range: '30d' })).resolves.toEqual(hist);
    expect(calls[0].url).toBe(`${BACKEND}/vaults/${MY_VAULT}/value-history?range=30d`);
  });

  it('ohne Range wird kein Query angehängt (Backend-Default)', async () => {
    const { bc, calls } = client((u) =>
      u.includes(`/vaults/${MY_VAULT}/performance`) ? json({ range: 'all' }) : json('nf', 404),
    );
    await getPerformance(bc, MY_VAULT);
    expect(calls[0].url).toBe(`${BACKEND}/vaults/${MY_VAULT}/performance`);
  });
});

describe('BackendClient — Auth-Refresh bei 401', () => {
  it('erneuert den Token einmal und wiederholt die Anfrage', async () => {
    let first = true;
    const a = auth();
    const { bc } = client((u) => {
      if (u.endsWith('/vaults')) {
        if (first) {
          first = false;
          return json({ message: 'EXPIRED' }, 401);
        }
        return json([{ address: MY_VAULT, label: 'M', depositToken: '0xt', chainId: 56 }]);
      }
      return json('nf', 404);
    }, a);
    const vaults = await listVaults(bc);
    expect(a.refresh).toHaveBeenCalledTimes(1);
    expect(vaults).toHaveLength(1);
  });
});
