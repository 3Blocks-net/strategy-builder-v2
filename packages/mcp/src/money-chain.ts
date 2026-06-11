import { createPublicClient, http, parseAbi, getAddress, maxUint256 } from 'viem';
import { WalletSigner } from './wallet-signer.js';
import type { MoneyDeps } from './tools/money-movement.js';

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const VAULT_MONEY_ABI = parseAbi([
  'function deposit(address token, uint256 amount)',
  'function withdraw(address token, uint256 amount, address recipient)',
]);

// USDT (BSC) verlangt approve→0 vor einer Neu-Genehmigung bei nicht-null/nicht-max Allowance.
const USDT_BSC = '0x55d398326f99059ff775485246999027b3197955';

/** Einzahlung: ggf. ERC20-approve, dann vault.deposit(token, amount). */
export function buildDepositOnChain(
  signer: WalletSigner,
  rpcUrl: string,
  ownerAddress: string,
): MoneyDeps['depositOnChain'] {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return async ({ vault, token, amountBase }) => {
    const need = BigInt(amountBase);
    const allowance = (await client.readContract({
      address: getAddress(token),
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [getAddress(ownerAddress), getAddress(vault)],
    })) as bigint;

    if (allowance < need) {
      if (allowance > 0n && allowance < maxUint256 && token.toLowerCase() === USDT_BSC) {
        await signer.sendContractTransaction({
          rpcUrl, address: token, abi: ERC20_ABI as unknown as never,
          functionName: 'approve', args: [vault, 0n], gasLimit: 100_000n,
        });
      }
      await signer.sendContractTransaction({
        rpcUrl, address: token, abi: ERC20_ABI as unknown as never,
        functionName: 'approve', args: [vault, maxUint256], gasLimit: 100_000n,
      });
    }

    const receipt = await signer.sendContractTransaction({
      rpcUrl, address: vault, abi: VAULT_MONEY_ABI as unknown as never,
      functionName: 'deposit', args: [token, amountBase], gasLimit: 300_000n,
    });
    return receipt.hash;
  };
}

/** Auszahlung: vault.withdraw(token, amount, recipient). */
export function buildWithdrawOnChain(
  signer: WalletSigner,
  rpcUrl: string,
): MoneyDeps['withdrawOnChain'] {
  return async ({ vault, token, amountBase, recipient }) => {
    const receipt = await signer.sendContractTransaction({
      rpcUrl, address: vault, abi: VAULT_MONEY_ABI as unknown as never,
      functionName: 'withdraw', args: [token, amountBase, recipient], gasLimit: 300_000n,
    });
    return receipt.hash;
  };
}

/** Dry-Run (estimateGas) für deposit/withdraw — ohne Senden. */
export function buildEstimate(rpcUrl: string, ownerAddress: string) {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return async (kind: 'deposit' | 'withdraw', vault: string, args: unknown[]): Promise<string> => {
    const gas = await client.estimateContractGas({
      address: getAddress(vault),
      abi: VAULT_MONEY_ABI,
      functionName: kind,
      args: args as never,
      account: getAddress(ownerAddress),
    });
    return gas.toString();
  };
}
