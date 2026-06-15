import { toBaseUnits } from 'shared';
import { PolicyGate } from '../policy-gate.js';
import { decimalsOf, checkMax } from '../token-utils.js';

export interface LifecycleDeps {
  gate: PolicyGate;
  /** lowercased Token-Adresse → Decimals. */
  tokenDecimals: Record<string, number>;
  /** lowercased Token-Adresse → human Max-Betrag (für topUp). */
  maxPerToken: Map<string, string>;
  /** Wirft, wenn der Vault nicht zur Owner-Adresse gehört (vor dem Signieren). */
  assertVault: (vault: string) => Promise<void>;
  topUpGasOnChain: (a: { vault: string; token: string; amountBase: string }) => Promise<string>;
  setMinFeeOnChain: (a: { vault: string; amountBase: string }) => Promise<string>;
  setAutomationActiveOnChain: (a: {
    vault: string;
    onChainId: number;
    active: boolean;
  }) => Promise<string>;
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
  await deps.assertVault(params.vault);
  const decimals = decimalsOf(deps.tokenDecimals, params.token);
  checkMax(deps.maxPerToken, params.token, params.amount, decimals);
  const amountBase = toBaseUnits(params.amount, decimals);
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
  await deps.assertVault(params.vault);
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
  await deps.assertVault(params.vault);
  return deps.gate.guard(
    {
      tool: 'set_automation_active',
      // Reaktivieren erfordert Confirm (eine bewusst pausierte Automation darf nicht
      // still wieder anlaufen, z. B. via Prompt-Injection); Pausieren ist confirm-frei.
      sensitive: params.active,
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
