import { BackendClient } from './backend-client.js';
import { listVaults } from './tools/read-tools.js';

/**
 * Verifiziert, dass die Ziel-Vault-Adresse zur verbundenen Owner-Adresse gehört —
 * **bevor** signiert wird. Schützt gegen injizierte Fremd-Adressen (z. B. damit
 * kein `approve(maxUint256)` an einen Angreifer-Vault geht). Backend-getragen
 * (owner-gefilterte `GET /vaults`).
 */
export function makeAssertOwnedVault(
  backend: BackendClient,
): (vault: string) => Promise<void> {
  return async (vault: string) => {
    const vaults = await listVaults(backend);
    if (!vaults.some((v) => v.address.toLowerCase() === vault.toLowerCase())) {
      throw new Error(
        `Vault ${vault} gehört nicht zur verbundenen Adresse — Aktion abgelehnt.`,
      );
    }
  };
}
