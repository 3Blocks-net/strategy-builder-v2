import { randomBytes } from 'node:crypto';
import { id, getAddress } from 'ethers';
import { WalletSigner } from './wallet-signer.js';
import type { SendCreateVault } from './tools/create-vault.js';

/** Minimale Factory-ABI (nur was create_vault braucht). */
export const VAULT_FACTORY_ABI = [
  'function createVault(address owner, address depositToken, bytes32 salt) returns (address vault)',
  'event VaultCreated(address indexed vault, address indexed owner, uint256 salt)',
];

const VAULT_CREATED_TOPIC = id('VaultCreated(address,address,uint256)');

function generateSalt(): string {
  return '0x' + randomBytes(32).toString('hex');
}

/**
 * Baut den On-Chain-Executor für `create_vault`: signiert+sendet
 * `factory.createVault(owner, depositToken, salt)` und liest die neue Vault-
 * Adresse aus dem `VaultCreated`-Event.
 */
export function buildSendCreateVault(
  signer: WalletSigner,
  config: { rpcUrl: string; factoryAddress: string },
): SendCreateVault {
  return async ({ owner, depositToken }) => {
    const receipt = await signer.sendContractTransaction({
      rpcUrl: config.rpcUrl,
      address: config.factoryAddress,
      abi: VAULT_FACTORY_ABI,
      functionName: 'createVault',
      args: [owner, depositToken, generateSalt()],
      gasLimit: 500_000n,
    });

    let vaultAddress: string | undefined;
    for (const log of receipt.logs) {
      if (log.topics[0] === VAULT_CREATED_TOPIC && log.topics[1]) {
        vaultAddress = getAddress('0x' + log.topics[1].slice(26));
        break;
      }
    }
    if (!vaultAddress) {
      throw new Error('Vault-Adresse konnte nicht aus der Transaktion gelesen werden.');
    }
    return { vaultAddress, txHash: receipt.hash, blockNumber: receipt.blockNumber };
  };
}
