import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Contract, JsonRpcProvider } from 'ethers';
import { VaultCodeService } from './vault-code.service';

const VAULT_PROTECTION_ABI = [
  'function expertMode() external view returns (bool)',
];

/**
 * How a vault treats step targets right now.
 *
 * - `standard` — the vault checks every step against the curated list.
 * - `expert` — the owner opted out of that check.
 * - `unknown` — nobody could establish either. Never a synonym for `standard`.
 */
export type ProtectionStatus = 'standard' | 'expert' | 'unknown';

export interface VaultProtection {
  status: ProtectionStatus;
  /**
   * ISO time of the read that produced the status, and `null` whenever the
   * status is `unknown` — so a reader can tell "checked, and this is the
   * answer" from "nobody got an answer".
   */
  checkedAt: string | null;
}

/** The only answer allowed when the flag could not be established. */
const UNKNOWN: VaultProtection = { status: 'unknown', checkedAt: null };

/**
 * Reads a vault's protection flag from the chain.
 *
 * Two rules shape this service, both of them about what it refuses to do:
 *
 * 1. **It never guesses in the safe-sounding direction.** A failed read, a
 *    missing RPC endpoint, a vault whose contract is not on this chain, a
 *    contract that has no `expertMode()` at all — every one of them answers
 *    `unknown`, never `standard`. "Protected" is a claim, and a claim needs a
 *    successful read behind it.
 * 2. **It does not cache.** Every other on-chain read here caches because the
 *    answer is stable or cheap to be slightly stale. This one is a safety
 *    statement shown to a user: a cached "protected" would keep asserting
 *    protection that the owner may have switched off seconds ago. One
 *    `eth_call` next to a full vault valuation is the cheaper price.
 */
@Injectable()
export class VaultProtectionService {
  private readonly logger = new Logger(VaultProtectionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly vaultCode: VaultCodeService,
  ) {}

  /**
   * The answer for one vault — and, by construction, never a thrown error.
   *
   * Every read this method reaches for lives inside the guard below: the
   * code check, the RPC call, and the provider teardown alike. The promise of
   * the doc comment above ("every unclear case is `unknown`") is therefore a
   * property of the control flow, not of what the collaborators happen to do
   * today.
   */
  async getProtection(vaultAddress: string): Promise<VaultProtection> {
    try {
      return await this.read(vaultAddress);
    } catch (err) {
      this.logger.warn(
        `Could not read the protection status of ${vaultAddress}: ${err}`,
      );
      return UNKNOWN;
    }
  }

  private async read(vaultAddress: string): Promise<VaultProtection> {
    // A vault that is not on this chain cannot testify about itself.
    if (!(await this.vaultCode.hasCode(vaultAddress))) return UNKNOWN;

    const rpcUrl = this.configService.get<string>('RPC_URL');
    if (!rpcUrl) {
      this.logger.warn(
        `No RPC_URL configured — the protection status of ${vaultAddress} stays unknown.`,
      );
      return UNKNOWN;
    }

    const provider = new JsonRpcProvider(rpcUrl);
    try {
      const vault = new Contract(vaultAddress, VAULT_PROTECTION_ABI, provider);
      const expertMode: unknown = await vault.expertMode();

      // Anything but a real boolean means the read did not answer the
      // question — an older vault without the flag, a decoding surprise.
      if (typeof expertMode !== 'boolean') {
        this.logger.warn(
          `Vault ${vaultAddress} answered expertMode() with a non-boolean — status stays unknown.`,
        );
        return UNKNOWN;
      }

      return {
        status: expertMode ? 'expert' : 'standard',
        checkedAt: new Date().toISOString(),
      };
    } finally {
      try {
        await provider.destroy();
      } catch {
        // Tearing the socket down must not turn a good answer into an error.
      }
    }
  }
}
