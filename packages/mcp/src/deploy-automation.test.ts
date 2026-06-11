import { describe, it, expect, vi } from 'vitest';
import { PolicyGate, type ConfirmationProvider } from './policy-gate.js';
import { AuditLog } from './audit-log.js';
import { DraftStore, type Draft } from './draft-store.js';
import { deployAutomation, type DeployDeps } from './tools/deploy-automation.js';
import type { DecoderCatalog } from './summary-decoder.js';
import type { RawGraph } from 'shared';

const OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const ALLOWED = '0x1111111111111111111111111111111111111111';
const STRANGER = '0x9999999999999999999999999999999999999999';
const TOKEN = '0x55d398326f99059fF775485246999027B3197955';
const SWAP = 'st-swap';
const TRANSFER = 'st-transfer';

const catalog: DecoderCatalog = {
  [SWAP]: {
    name: 'PancakeSwap V3 Swap',
    paramSchema: { properties: { tokenIn: { 'x-ui-widget': 'token-selector' }, amountIn: { 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'tokenIn' } } },
    abiFragment: { type: 'tuple', components: [{ name: 'tokenIn', type: 'address' }, { name: 'amountIn', type: 'uint256' }] },
  },
  [TRANSFER]: {
    name: 'ERC-20 Transfer',
    paramSchema: { properties: { token: { 'x-ui-widget': 'token-selector' }, recipient: { 'x-ui-role': 'recipient' }, amount: { 'x-ui-widget': 'token-amount', 'x-ui-amount-token-field': 'token' } } },
    abiFragment: { type: 'tuple', components: [{ name: 'token', type: 'address' }, { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  },
};

function gate(decision: boolean, readOnly = false) {
  const confirmation: ConfirmationProvider = { requestApproval: vi.fn(async () => decision) };
  return new PolicyGate({ readOnly }, confirmation, new AuditLog({ append: async () => {} }));
}

function draftWith(rawGraph: RawGraph): Draft {
  return {
    vaultAddress: '0xVault',
    automationId: 'auto-1',
    rawGraph,
    contextOverrides: {},
    ownerOnly: false,
    summary: { steps: [], execution: 'public', warnings: [] },
  };
}

const swapGraph: RawGraph = {
  nodes: [{ id: 'a1', type: 'ACTION', data: { stepTypeId: SWAP, params: { tokenIn: TOKEN, amountIn: '50' } } }],
  edges: [],
};
function transferGraph(recipient: string): RawGraph {
  return {
    nodes: [{ id: 'a1', type: 'ACTION', data: { stepTypeId: TRANSFER, params: { token: TOKEN, recipient, amount: '10' } } }],
    edges: [],
  };
}

function deps(over: Partial<DeployDeps> = {}, store = new DraftStore({ genId: () => 'd1' })) {
  const base: DeployDeps = {
    gate: gate(true),
    draftStore: store,
    catalog,
    config: { ownerAddress: OWNER, addressAllowlist: new Set([OWNER.toLowerCase(), ALLOWED.toLowerCase()]), enabledSensitiveSteps: new Set(['ERC-20 Transfer']) },
    deployOnChain: vi.fn(async () => ({ onChainId: 42, txHashes: ['0xctx', '0xauto'] })),
  };
  return { ...base, ...over };
}

describe('deployAutomation', () => {
  it('nicht-sensibler Graph (Swap) → deployt bestätigungsfrei, liefert On-Chain-ID + TX-Hashes', async () => {
    const store = new DraftStore({ genId: () => 'd1' });
    const id = store.create(draftWith(swapGraph));
    const d = deps({ gate: gate(false) /* würde ablehnen, darf aber nicht gefragt werden */ }, store);
    const r = await deployAutomation(d, { draftId: id });
    expect(r).toMatchObject({ onChainId: 42, automationId: 'auto-1' });
    expect(d.deployOnChain).toHaveBeenCalledTimes(1);
  });

  it('unbekannte/abgelaufene Draft-ID → Fehler, kein Deploy', async () => {
    const d = deps();
    await expect(deployAutomation(d, { draftId: 'ghost' })).rejects.toThrow(/Draft/i);
    expect(d.deployOnChain).not.toHaveBeenCalled();
  });

  it('In-Automation-Empfänger außerhalb der Allowlist → Ablehnung, kein Deploy', async () => {
    const store = new DraftStore({ genId: () => 'd1' });
    const id = store.create(draftWith(transferGraph(STRANGER)));
    const d = deps({}, store);
    await expect(deployAutomation(d, { draftId: id })).rejects.toThrow(/Allowlist/i);
    expect(d.deployOnChain).not.toHaveBeenCalled();
  });

  it('sensibler Step ohne Capability-Opt-in → nicht verbaubar', async () => {
    const store = new DraftStore({ genId: () => 'd1' });
    const id = store.create(draftWith(transferGraph(ALLOWED)));
    const d = deps({ config: { ownerAddress: OWNER, addressAllowlist: new Set([ALLOWED.toLowerCase()]), enabledSensitiveSteps: new Set() } }, store);
    await expect(deployAutomation(d, { draftId: id })).rejects.toThrow(/Capability|freigeschaltet|sensib/i);
    expect(d.deployOnChain).not.toHaveBeenCalled();
  });

  it('sensibler Step (Transfer) erzwingt Confirm — ohne Bestätigung kein Deploy', async () => {
    const store = new DraftStore({ genId: () => 'd1' });
    const id = store.create(draftWith(transferGraph(ALLOWED)));
    const d = deps({ gate: gate(false) }, store);
    await expect(deployAutomation(d, { draftId: id })).rejects.toThrow();
    expect(d.deployOnChain).not.toHaveBeenCalled();
  });

  it('sensibler Step mit Allowlist-Ziel + Capability + Bestätigung → deployt', async () => {
    const store = new DraftStore({ genId: () => 'd1' });
    const id = store.create(draftWith(transferGraph(ALLOWED)));
    const d = deps({ gate: gate(true) }, store);
    const r = await deployAutomation(d, { draftId: id });
    expect(r.onChainId).toBe(42);
    expect(d.deployOnChain).toHaveBeenCalledTimes(1);
  });
});
