import { describe, it, expect, vi } from 'vitest';
import { BackendClient, type AuthLike } from './backend-client.js';
import { DraftStore } from './draft-store.js';
import { proposeAutomation, type ProposeDeps } from './tools/propose-automation.js';
import type { DecoderCatalog } from './summary-decoder.js';
import type { FlatIntent } from './intent-check.js';

const VAULT = '0xVault';
const TOKEN_IN = '0x55d398326f99059fF775485246999027B3197955';
const TOKEN_OUT = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const SWAP = 'st-swap';
const INTERVAL = 'st-interval';

const catalog: DecoderCatalog = {
  [INTERVAL]: {
    name: 'Interval Condition',
    paramSchema: { properties: { interval: { 'x-ui-widget': 'duration' }, timeSlot: { 'x-ui-widget': 'context-slot' } } },
    abiFragment: { type: 'tuple', components: [{ name: 'interval', type: 'uint256' }, { name: 'timeSlot', type: 'uint32' }] },
  },
  [SWAP]: {
    name: 'PancakeSwap V3 Swap',
    paramSchema: {
      properties: {
        tokenIn: { 'x-ui-widget': 'token-selector' },
        tokenOut: { 'x-ui-widget': 'token-selector' },
        fee: { 'x-ui-widget': 'fee-tier' },
        amountIn: { 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'tokenIn' },
      },
    },
    abiFragment: {
      type: 'tuple',
      components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'amountIn', type: 'uint256' },
      ],
    },
  },
};

const tokenDecimals = { [TOKEN_IN.toLowerCase()]: 18, [TOKEN_OUT.toLowerCase()]: 18 };

function dcaGraph() {
  return {
    nodes: [
      { id: 'c1', type: 'CONDITION', data: { stepTypeId: INTERVAL, params: { interval: { value: 7, unit: 'days' }, timeSlot: '__t' } } },
      { id: 'a1', type: 'ACTION', data: { stepTypeId: SWAP, params: { tokenIn: TOKEN_IN, tokenOut: TOKEN_OUT, fee: 500, amountIn: '50' } } },
    ],
    edges: [{ source: 'c1', target: 'a1', sourceHandle: 'true' }],
  };
}

const intent: FlatIntent = {
  execution: 'public',
  trigger: { periodSeconds: 604800 },
  actions: [{ token: TOKEN_IN, amount: '50' }],
};

function backend(over: { encodeStatus?: number } = {}) {
  const auth: AuthLike = { authHeader: () => ({ Authorization: 'Bearer t' }), refresh: vi.fn(async () => {}) };
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith('/automations') && init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'auto-1' }), { status: 201 });
    }
    if (u.includes('/encode')) {
      if (over.encodeStatus && over.encodeStatus >= 400) {
        return new Response(JSON.stringify({ message: 'STEP_PARAM_INVALID: interval must be > 0' }), { status: over.encodeStatus });
      }
      return new Response(JSON.stringify({ ownerOnly: false, steps: [] }), { status: 200 });
    }
    return new Response('nf', { status: 404 });
  }) as unknown as typeof fetch;
  return new BackendClient({ backendUrl: 'http://localhost:3001', auth, fetchFn });
}

function deps(over: Partial<ProposeDeps> = {}): ProposeDeps {
  return {
    backend: backend(),
    draftStore: new DraftStore({ genId: () => 'draft-xyz' }),
    catalog,
    tokenDecimals,
    getPool: vi.fn(async () => '0xPoolExists'),
    ...over,
  };
}

describe('proposeAutomation', () => {
  it('baut, validiert, cross-checkt und legt einen Draft ab (Draft-ID + Summary, kein Deploy)', async () => {
    const d = deps();
    const result = await proposeAutomation(d, { vaultAddress: VAULT, graph: dcaGraph(), intent });
    expect(result.draftId).toBe('draft-xyz');
    expect(result.summary.steps.some((s) => s.stepType === 'PancakeSwap V3 Swap' && s.amount === '50')).toBe(true);
    // Draft ist abgelegt und enthält den raw graph (für deploy in Slice 9).
    const stored = d.draftStore.get('draft-xyz');
    expect(stored?.vaultAddress).toBe(VAULT);
    expect(stored?.automationId).toBe('auto-1');
    expect(stored?.rawGraph.nodes).toHaveLength(2);
  });

  it('unbekannte Step-Type-ID → Reject (keine erfundenen Bausteine)', async () => {
    const g = dcaGraph();
    g.nodes[1].data.stepTypeId = 'ghost-step';
    await expect(proposeAutomation(deps(), { vaultAddress: VAULT, graph: g, intent })).rejects.toThrow(/Step-Type|Katalog/i);
  });

  it('nicht-kuratierter Token (unbekannte Decimals) → harter Fail vor TX', async () => {
    const g = dcaGraph();
    g.nodes[1].data.params.tokenIn = '0xUncuratedToken';
    await expect(proposeAutomation(deps(), { vaultAddress: VAULT, graph: g, intent })).rejects.toThrow(/decimals|Token|baubar/i);
  });

  it('Encode-Boundary lehnt ab (HTTP 400) → Reject mit Erklärung, kein Draft', async () => {
    const d = deps({ backend: backend({ encodeStatus: 400 }) });
    await expect(proposeAutomation(d, { vaultAddress: VAULT, graph: dcaGraph(), intent })).rejects.toThrow(/Encode|abgelehnt/i);
  });

  it('Intent ≠ Graph → Reject mit Diff (Prompt-Injection-Backstop)', async () => {
    // Injizierter Intent behauptet 5000 statt der im Graphen stehenden 50.
    const lyingIntent: FlatIntent = { ...intent, actions: [{ token: TOKEN_IN, amount: '5000' }] };
    await expect(
      proposeAutomation(deps(), { vaultAddress: VAULT, graph: dcaGraph(), intent: lyingIntent }),
    ).rejects.toThrow(/Intent.*Graph|Betrag/i);
  });

  it('nicht existierender Pool → Reject vor Deploy', async () => {
    const d = deps({ getPool: vi.fn(async () => '0x0000000000000000000000000000000000000000') });
    await expect(proposeAutomation(d, { vaultAddress: VAULT, graph: dcaGraph(), intent })).rejects.toThrow(/Pool/i);
  });
});
