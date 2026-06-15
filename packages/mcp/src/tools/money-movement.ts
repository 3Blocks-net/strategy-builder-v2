import { toBaseUnits } from 'shared';
import { PolicyGate } from '../policy-gate.js';
import { BackendClient } from '../backend-client.js';
import { decimalsOf, checkMax } from '../token-utils.js';

export interface MoneyConfig {
  ownerAddress: string;
  /** lowercased erlaubte Withdraw-Ziele (Owner sollte enthalten sein). */
  addressAllowlist: Set<string>;
  /** lowercased Token-Adresse → human Max-Betrag pro Aktion (optional). */
  maxPerToken: Map<string, string>;
}

export interface MoneyDeps {
  gate: PolicyGate;
  backend: BackendClient;
  /** lowercased Token-Adresse → Decimals. */
  tokenDecimals: Record<string, number>;
  config: MoneyConfig;
  /** Wirft, wenn der Vault nicht zur Owner-Adresse gehört (vor dem Signieren). */
  assertVault: (vault: string) => Promise<void>;
  depositOnChain: (a: { vault: string; token: string; amountBase: string }) => Promise<string>;
  withdrawOnChain: (a: {
    vault: string;
    token: string;
    amountBase: string;
    recipient: string;
  }) => Promise<string>;
}

async function feeLine(backend: BackendClient, kind: 'deposit' | 'withdraw'): Promise<string> {
  try {
    const fees = await backend.get<{ depositFeeBps: number; withdrawFeeBps: number }>('/fees');
    const bps = kind === 'deposit' ? fees.depositFeeBps : fees.withdrawFeeBps;
    return `Gebühr ${bps} BPS (${(bps / 100).toFixed(2)} %)`;
  } catch {
    return 'Gebühr unbekannt';
  }
}

/** Einzahlung in den Vault (Base-Units-Konvertierung, Confirm-Gate, Fee transparent). */
export async function deposit(
  deps: MoneyDeps,
  params: { vault: string; token: string; amount: string },
): Promise<{ txHash: string }> {
  await deps.assertVault(params.vault);
  const decimals = decimalsOf(deps.tokenDecimals, params.token);
  checkMax(deps.config.maxPerToken, params.token, params.amount, decimals);
  const amountBase = toBaseUnits(params.amount, decimals);
  const fee = await feeLine(deps.backend, 'deposit');
  const summary =
    `Einzahlung: ${params.amount} (Token ${params.token}) in Vault ${params.vault}. ` +
    `Kann eine einmalige ERC20-Freigabe (bis maxUint256) an den Vault auslösen. ${fee}.`;

  return deps.gate.guard(
    {
      tool: 'deposit',
      sensitive: true,
      summary,
      details: { vault: params.vault, token: params.token, amount: params.amount },
    },
    async () => {
      const txHash = await deps.depositOnChain({ vault: params.vault, token: params.token, amountBase });
      return { result: { txHash }, txHash };
    },
  );
}

/** Auszahlung aus dem Vault — Empfänger muss in der Adress-Allowlist sein. */
export async function withdraw(
  deps: MoneyDeps,
  params: { vault: string; token: string; amount: string; recipient: string },
): Promise<{ txHash: string }> {
  await deps.assertVault(params.vault);
  const decimals = decimalsOf(deps.tokenDecimals, params.token);
  checkMax(deps.config.maxPerToken, params.token, params.amount, decimals);
  if (!deps.config.addressAllowlist.has(params.recipient.toLowerCase())) {
    throw new Error(
      `Withdraw-Empfänger ${params.recipient} ist nicht in der Adress-Allowlist — abgelehnt.`,
    );
  }
  const amountBase = toBaseUnits(params.amount, decimals);
  const fee = await feeLine(deps.backend, 'withdraw');
  const summary =
    `Auszahlung: ${params.amount} (Token ${params.token}) → ${params.recipient} aus Vault ${params.vault}. ${fee}.`;

  return deps.gate.guard(
    {
      tool: 'withdraw',
      sensitive: true,
      summary,
      details: {
        vault: params.vault,
        token: params.token,
        amount: params.amount,
        recipient: params.recipient,
      },
    },
    async () => {
      const txHash = await deps.withdrawOnChain({
        vault: params.vault,
        token: params.token,
        amountBase,
        recipient: params.recipient,
      });
      return { result: { txHash }, txHash };
    },
  );
}

export interface SimulateDeps {
  backend: BackendClient;
  tokenDecimals: Record<string, number>;
  /** estimateGas-Wrapper (viem), ohne zu senden. */
  estimate: (kind: 'deposit' | 'withdraw', vault: string, args: unknown[]) => Promise<string>;
}

/**
 * Dry-Run einer Geldbewegung (nur deposit/withdraw): erwartete Fees + Gas-Schätzung,
 * **ohne zu senden** und **ohne Confirm-Gate** (rein lesend). Für `deploy_automation`
 * gibt es bewusst keine Result-Simulation (das echte Feuern zeigt nur ein Fork).
 */
export async function simulateAction(
  deps: SimulateDeps,
  params: { type: 'deposit' | 'withdraw'; vault: string; token: string; amount: string; recipient?: string },
): Promise<{ type: string; amountBase: string; fee: string; gasEstimate: string }> {
  const decimals = decimalsOf(deps.tokenDecimals, params.token);
  const amountBase = toBaseUnits(params.amount, decimals);
  if (params.type === 'withdraw') {
    if (!params.recipient || !/^0x[0-9a-fA-F]{40}$/.test(params.recipient)) {
      throw new Error('recipient (gültige 0x-Adresse) ist für simulate_action(type=withdraw) erforderlich.');
    }
  }
  const args =
    params.type === 'deposit'
      ? [params.token, amountBase]
      : [params.token, amountBase, params.recipient];
  const gasEstimate = await deps.estimate(params.type, params.vault, args);
  const fee = await feeLine(deps.backend, params.type);
  return { type: params.type, amountBase, fee, gasEstimate };
}
