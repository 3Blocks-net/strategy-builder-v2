import { describe, it, expect, vi } from 'vitest';
import { PolicyGate, type ConfirmationProvider } from './policy-gate.js';
import { AuditLog } from './audit-log.js';
import { topUpGasDeposit, setMinFeeDeposit, setAutomationActive, type LifecycleDeps } from './tools/lifecycle.js';

const VAULT = '0xVault';
const TOKEN18 = '0x55d398326f99059fF775485246999027B3197955';

function gate(readOnly = false) {
  const confirmation: ConfirmationProvider = { requestApproval: vi.fn(async () => false) };
  return { gate: new PolicyGate({ readOnly }, confirmation, new AuditLog({ append: async () => {} })), confirmation };
}

function deps(over: Partial<LifecycleDeps> = {}): LifecycleDeps {
  return {
    gate: gate().gate,
    tokenDecimals: { [TOKEN18.toLowerCase()]: 18 },
    maxPerToken: new Map(),
    assertVault: vi.fn(async () => {}),
    topUpGasOnChain: vi.fn(async () => '0xgas'),
    setMinFeeOnChain: vi.fn(async () => '0xmin'),
    setAutomationActiveOnChain: vi.fn(async () => '0xact'),
    ...over,
  };
}

describe('topUpGasDeposit', () => {
  it('konvertiert Base-Units, läuft confirm-frei (nicht-sensibel) durchs Gate', async () => {
    const { gate: g, confirmation } = gate();
    const d = deps({ gate: g });
    const r = await topUpGasDeposit(d, { vault: VAULT, token: TOKEN18, amount: '5' });
    expect(r.txHash).toBe('0xgas');
    expect(d.topUpGasOnChain).toHaveBeenCalledWith({ vault: VAULT, token: TOKEN18, amountBase: '5000000000000000000' });
    expect(confirmation.requestApproval).not.toHaveBeenCalled(); // nicht-sensibel
  });

  it('Read-only blockt auch nicht-sensible Writes', async () => {
    const d = deps({ gate: gate(true).gate });
    await expect(topUpGasDeposit(d, { vault: VAULT, token: TOKEN18, amount: '5' })).rejects.toThrow();
    expect(d.topUpGasOnChain).not.toHaveBeenCalled();
  });
});

describe('setMinFeeDeposit', () => {
  it('setzt minFeeDeposit in Base-Units', async () => {
    const d = deps();
    const r = await setMinFeeDeposit(d, { vault: VAULT, token: TOKEN18, amount: '1' });
    expect(r.txHash).toBe('0xmin');
    expect(d.setMinFeeOnChain).toHaveBeenCalledWith({ vault: VAULT, amountBase: '1000000000000000000' });
  });
});

describe('setAutomationActive', () => {
  it('schaltet eine Automation aktiv/pausiert', async () => {
    const d = deps();
    const r = await setAutomationActive(d, { vault: VAULT, onChainId: 7, active: false });
    expect(r.txHash).toBe('0xact');
    expect(d.setAutomationActiveOnChain).toHaveBeenCalledWith({ vault: VAULT, onChainId: 7, active: false });
  });
});
