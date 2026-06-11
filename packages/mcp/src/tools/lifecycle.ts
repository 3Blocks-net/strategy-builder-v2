import { toBaseUnits } from 'shared';
import { PolicyGate } from '../policy-gate.js';

export interface LifecycleDeps {
  gate: PolicyGate;
  /** lowercased Token-Adresse → Decimals. */
  tokenDecimals: Record<string, number>;
  topUpGasOnChain: (a: { vault: string; token: string; amountBase: string }) => Promise<string>;
  setMinFeeOnChain: (a: { vault: string; amountBase: string }) => Promise<string>;
  setAutomationActiveOnChain: (a: {
    vault: string;
    onChainId: number;
    active: boolean;
  }) => Promise<string>;
}

function decimalsOf(tokenDecimals: Record<string, number>, token: string): number {
  const d = tokenDecimals[token.toLowerCase()];
  if (d === undefined) {
    throw new Error(`Nicht-kuratierter Token ${token} (unbekannte Decimals).`);
  }
  return d;
}

/**
 * Lifecycle-Writes (risikoärmer): bewegen kein Vermögen an externe Ziele, laufen
 * aber als signierende Writes durch das PolicyGate — nicht-sensibel (confirm-frei),
 * der Read-only-Modus wird respektiert.
 */
export async function topUpGasDeposit(
  deps: LifecycleDeps,
  params: { vault: string; token: string; amount: string },
): Promise<{ txHash: string }> {
  const amountBase = toBaseUnits(params.amount, decimalsOf(deps.tokenDecimals, params.token));
  return deps.gate.guard(
    {
      tool: 'top_up_gas_deposit',
      sensitive: false,
      summary: `Gas-Reserve auffüllen: ${params.amount} (Token ${params.token}) in Vault ${params.vault}.`,
      details: { vault: params.vault, token: params.token, amount: params.amount },
    },
    async () => {
      const txHash = await deps.topUpGasOnChain({ vault: params.vault, token: params.token, amountBase });
      return { result: { txHash }, txHash };
    },
  );
}

export async function setMinFeeDeposit(
  deps: LifecycleDeps,
  params: { vault: string; token: string; amount: string },
): Promise<{ txHash: string }> {
  const amountBase = toBaseUnits(params.amount, decimalsOf(deps.tokenDecimals, params.token));
  return deps.gate.guard(
    {
      tool: 'set_min_fee_deposit',
      sensitive: false,
      summary: `Auto-Top-up-Ziel (minFeeDeposit) setzen: ${params.amount} in Vault ${params.vault}.`,
      details: { vault: params.vault, amount: params.amount },
    },
    async () => {
      const txHash = await deps.setMinFeeOnChain({ vault: params.vault, amountBase });
      return { result: { txHash }, txHash };
    },
  );
}

export async function setAutomationActive(
  deps: LifecycleDeps,
  params: { vault: string; onChainId: number; active: boolean },
): Promise<{ txHash: string }> {
  return deps.gate.guard(
    {
      tool: 'set_automation_active',
      sensitive: false,
      summary: `Automation #${params.onChainId} ${params.active ? 'aktivieren' : 'pausieren'} (Vault ${params.vault}).`,
      details: { vault: params.vault, onChainId: params.onChainId, active: params.active },
    },
    async () => {
      const txHash = await deps.setAutomationActiveOnChain({
        vault: params.vault,
        onChainId: params.onChainId,
        active: params.active,
      });
      return { result: { txHash }, txHash };
    },
  );
}
