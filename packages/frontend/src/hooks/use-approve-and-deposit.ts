import { useState, useCallback } from 'react';
import { useWriteContract } from 'wagmi';
import { type Address, erc20Abi, maxUint256 } from 'viem';
import { StrategyBuilderVaultAbi } from '@/lib/abis';

type DepositStep = 'idle' | 'checking' | 'approving' | 'depositing' | 'done' | 'error';

const USDT_ADDRESSES = new Set([
  '0x55d398326f99059ff775485246999027b3197955', // BSC USDT
]);

export function useApproveAndDeposit() {
  const [step, setStep] = useState<DepositStep>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const approveAndDeposit = useCallback(
    async (params: {
      vaultAddress: Address;
      tokenAddress: Address;
      amount: bigint;
      currentAllowance: bigint;
    }) => {
      setError(null);
      setStep('checking');

      try {
        const needsApproval = params.currentAllowance < params.amount;
        const needsResetToZero =
          needsApproval &&
          params.currentAllowance > 0n &&
          params.currentAllowance < maxUint256 &&
          USDT_ADDRESSES.has(params.tokenAddress.toLowerCase());

        const steps = (needsResetToZero ? 1 : 0) + (needsApproval ? 1 : 0) + 1;
        setTotalSteps(steps);
        let stepIdx = 1;

        if (needsResetToZero) {
          setStep('approving');
          setCurrentStep(stepIdx++);
          await writeContractAsync({
            address: params.tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [params.vaultAddress, 0n],
          });
        }

        if (needsApproval) {
          setStep('approving');
          setCurrentStep(stepIdx++);
          await writeContractAsync({
            address: params.tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [params.vaultAddress, maxUint256],
          });
        }

        setStep('depositing');
        setCurrentStep(stepIdx);
        await writeContractAsync({
          address: params.vaultAddress,
          abi: StrategyBuilderVaultAbi,
          functionName: 'deposit',
          args: [params.tokenAddress, params.amount],
        });

        setStep('done');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Transaction failed';
        setError(msg);
        setStep('error');
      }
    },
    [writeContractAsync],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setCurrentStep(0);
    setTotalSteps(0);
    setError(null);
  }, []);

  return { approveAndDeposit, step, currentStep, totalSteps, error, reset };
}
