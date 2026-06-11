import { randomBytes } from 'node:crypto';
import { id, getAddress } from 'ethers';
import { WalletSigner } from './wallet-signer.js';
import { BackendClient } from './backend-client.js';
import type { SendCreateVault } from './tools/create-vault.js';
import type { DeployOnChain } from './tools/deploy-automation.js';
import type { Draft } from './draft-store.js';

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

const AUTOMATION_CREATED_TOPIC = id('AutomationCreated(uint32,uint256)');

interface EncodeResponse {
  requiresContextTx?: boolean;
  contextCalldata?: string;
  automationCalldata: string;
  ownerOnly: boolean;
  stepCount: number;
}

/**
 * On-Chain-Deploy eines gespeicherten Entwurfs: re-encodet den gespeicherten raw
 * graph über das bestehende `/encode`, sendet optional die Kontext-Setup-TX und
 * die Automation-TX an den Vault, liest die On-Chain-ID aus `AutomationCreated`
 * und registriert sie per PATCH.
 */
export function buildDeployOnChain(
  signer: WalletSigner,
  backend: BackendClient,
  rpcUrl: string,
): DeployOnChain {
  return async (draft: Draft) => {
    const enc = await backend.post<EncodeResponse>(
      `/vaults/${draft.vaultAddress}/automations/${draft.automationId}/encode`,
      { graph: draft.rawGraph, contextOverrides: draft.contextOverrides },
    );

    const txHashes: string[] = [];
    if (enc.requiresContextTx && enc.contextCalldata) {
      const ctx = await signer.sendRawTransaction({
        rpcUrl,
        to: draft.vaultAddress,
        data: enc.contextCalldata,
        gasLimit: 500_000n,
      });
      txHashes.push(ctx.hash);
    }

    const auto = await signer.sendRawTransaction({
      rpcUrl,
      to: draft.vaultAddress,
      data: enc.automationCalldata,
      gasLimit: 2_000_000n,
    });
    txHashes.push(auto.hash);

    let onChainId: number | undefined;
    for (const log of auto.logs) {
      if (log.topics[0] === AUTOMATION_CREATED_TOPIC && log.topics[1]) {
        onChainId = Number(BigInt(log.topics[1]));
        break;
      }
    }
    if (onChainId === undefined) {
      throw new Error('On-Chain-Automation-ID konnte nicht aus der Transaktion gelesen werden.');
    }

    await backend.patch(`/vaults/${draft.vaultAddress}/automations/${draft.automationId}`, {
      onChainId,
      txHash: auto.hash,
      ownerOnly: enc.ownerOnly,
      stepCount: enc.stepCount,
    });

    return { onChainId, txHashes };
  };
}
