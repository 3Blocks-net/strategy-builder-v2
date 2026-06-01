import { useState, useCallback } from 'react';
import { useWriteContract } from 'wagmi';
import { keccak256, encodePacked, type Address, type Log } from 'viem';
import { StrategyBuilderVaultFactoryAbi } from '@/lib/abis';
import { config } from '@/lib/wagmi';
import { apiFetch } from '@/lib/api';

const FACTORY_ADDRESS = import.meta.env
  .VITE_FACTORY_ADDRESS as Address | undefined;

interface CreateVaultParams {
  label?: string;
  depositToken: Address;
  chainId: number;
}

interface CreateVaultResult {
  vaultAddress: Address;
  txHash: string;
}

function generateSalt(): `0x${string}` {
  const timestamp = BigInt(Date.now());
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  const randomHex = Array.from(random)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return keccak256(
    encodePacked(['uint256', 'bytes'], [timestamp, `0x${randomHex}`]),
  );
}

function parseVaultCreatedEvent(logs: Log[]): Address | null {
  const topic = keccak256(
    encodePacked(['string'], ['VaultCreated(address,address,uint256)']),
  );
  for (const log of logs) {
    if (log.topics[0] === topic) {
      return `0x${log.topics[1]?.slice(26)}` as Address;
    }
  }
  return null;
}

async function registerVault(
  params: {
    address: string;
    chainId: number;
    depositToken: string;
    txHash: string;
    createdAtBlock: number;
    label?: string;
  },
  retries = 3,
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await apiFetch('/vaults', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (res.ok) return;
      if (res.status === 409) return;
    } catch {
      // retry
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

export function useCreateVault() {
  const [step, setStep] = useState<
    'idle' | 'simulating' | 'confirming' | 'waiting' | 'registering' | 'done' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateVaultResult | null>(null);

  const { writeContractAsync } = useWriteContract();

  const createVault = useCallback(
    async (params: CreateVaultParams, userAddress: Address) => {
      if (!FACTORY_ADDRESS) {
        setError('Factory address not configured');
        setStep('error');
        return null;
      }

      setStep('simulating');
      setError(null);

      try {
        const salt = generateSalt();

        setStep('confirming');
        const txHash = await writeContractAsync({
          address: FACTORY_ADDRESS,
          abi: StrategyBuilderVaultFactoryAbi,
          functionName: 'createVault',
          args: [userAddress, params.depositToken, salt],
          gas: 500_000n,
        });

        setStep('waiting');

        const receipt = await waitForReceipt(txHash);
        if (!receipt) {
          setError('Transaction failed');
          setStep('error');
          return null;
        }

        const vaultAddress = parseVaultCreatedEvent(receipt.logs);
        if (!vaultAddress) {
          setError('Could not parse vault address from transaction');
          setStep('error');
          return null;
        }

        setStep('registering');
        await registerVault({
          address: vaultAddress,
          chainId: params.chainId,
          depositToken: params.depositToken,
          txHash,
          createdAtBlock: Number(receipt.blockNumber),
          label: params.label,
        });

        const createResult = { vaultAddress, txHash };
        setResult(createResult);
        setStep('done');
        return createResult;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Transaction failed';
        setError(msg);
        setStep('error');
        return null;
      }
    },
    [writeContractAsync],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setResult(null);
  }, []);

  return { createVault, step, error, result, reset };
}

async function waitForReceipt(txHash: string, timeout = 60_000) {
  const start = Date.now();
  const { createPublicClient, http } = await import('viem');
  const chain = config.chains[0];
  const client = createPublicClient({ chain, transport: http() });

  while (Date.now() - start < timeout) {
    try {
      const receipt = await client.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      if (receipt) return receipt;
    } catch {
      // not yet mined
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}
