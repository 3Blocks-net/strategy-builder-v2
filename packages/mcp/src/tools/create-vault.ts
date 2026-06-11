import { BackendClient } from '../backend-client.js';
import { PolicyGate } from '../policy-gate.js';

export interface CreateVaultParams {
  depositToken: string;
  label?: string;
}

export interface CreateVaultResult {
  vaultAddress: string;
  txHash: string;
}

/** Signiert + sendet `factory.createVault` und liefert Adresse + TX-Infos. */
export type SendCreateVault = (args: {
  owner: `0x${string}`;
  depositToken: string;
}) => Promise<{ vaultAddress: string; txHash: string; blockNumber: number }>;

export interface CreateVaultDeps {
  backend: BackendClient;
  gate: PolicyGate;
  ownerAddress: `0x${string}`;
  chainId: number;
  sendCreateVault: SendCreateVault;
}

/**
 * Erste signierende Aktion. Validiert den Deposit-Token gegen die akzeptierten
 * Tokens **vor** jeder TX, läuft als sensible Aktion durch das PolicyGate
 * (Confirm-Gate erzwungen), signiert+sendet, registriert den Vault und gibt
 * Adresse + TX-Hash zurück. Reverts werden vom Aufrufer-Executor dekodiert.
 */
export async function createVault(
  deps: CreateVaultDeps,
  params: CreateVaultParams,
): Promise<CreateVaultResult> {
  // 1. Deposit-Token muss von der FeeRegistry akzeptiert sein — sonst keine TX.
  const { tokens } = await deps.backend.get<{ tokens: { address: string }[] }>(
    '/tokens/accepted',
  );
  const accepted = tokens.some(
    (t) => t.address.toLowerCase() === params.depositToken.toLowerCase(),
  );
  if (!accepted) {
    throw new Error(
      `Deposit-Token ${params.depositToken} wird nicht von der FeeRegistry akzeptiert. Bitte einen akzeptierten Token wählen.`,
    );
  }

  const summary =
    `Vault erstellen — Deposit-Token ${params.depositToken}` +
    (params.label ? `, Label "${params.label}"` : '') +
    '.';

  // 2. Durch das Confirm-Gate (sensibel), dann signieren + senden + registrieren.
  return deps.gate.guard(
    {
      tool: 'create_vault',
      sensitive: true,
      summary,
      details: { depositToken: params.depositToken, label: params.label ?? null },
    },
    async () => {
      const { vaultAddress, txHash, blockNumber } = await deps.sendCreateVault({
        owner: deps.ownerAddress,
        depositToken: params.depositToken,
      });
      await deps.backend.post('/vaults', {
        address: vaultAddress,
        chainId: deps.chainId,
        depositToken: params.depositToken,
        txHash,
        createdAtBlock: blockNumber,
        label: params.label,
      });
      return { result: { vaultAddress, txHash }, txHash };
    },
  );
}
