import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAccount, useReadContract } from 'wagmi';
import { type Address, erc20Abi, parseUnits, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-context';
import { useCreateVault } from '@/hooks/use-create-vault';
import { useApproveAndDeposit } from '@/hooks/use-approve-and-deposit';
import { apiFetch } from '@/lib/api';

interface AcceptedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

interface FeeRates {
  depositFeeBps: number;
  withdrawFeeBps: number;
}

type WizardStep = 'label' | 'token' | 'fees' | 'create' | 'deposit' | 'done';

export function CreateVaultPage() {
  const navigate = useNavigate();
  const { address: userAddress } = useAccount();
  useAuth();
  const { chainId } = useAccount();

  const [wizardStep, setWizardStep] = useState<WizardStep>('label');
  const [label, setLabel] = useState('');
  const [selectedToken, setSelectedToken] = useState<AcceptedToken | null>(null);
  const [tokens, setTokens] = useState<AcceptedToken[]>([]);
  const [fees, setFees] = useState<FeeRates | null>(null);
  const [wantDeposit, setWantDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');

  const createVault = useCreateVault();
  const deposit = useApproveAndDeposit();

  useEffect(() => {
    apiFetch('/tokens/accepted')
      .then((r) => r.json())
      .then((d) => setTokens(d.tokens ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch('/fees')
      .then((r) => r.json())
      .then((d) => setFees(d))
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    if (!userAddress || !selectedToken || !chainId) return;

    const result = await createVault.createVault(
      {
        label: label.trim() || undefined,
        depositToken: selectedToken.address as Address,
        chainId,
      },
      userAddress,
    );

    if (result) {
      if (wantDeposit && depositAmount) {
        setWizardStep('deposit');
      } else {
        setWizardStep('done');
      }
    }
  };

  const handleDeposit = async () => {
    if (!createVault.result || !selectedToken) return;

    const amount = parseUnits(depositAmount, selectedToken.decimals);
    const allowance = currentAllowance ?? 0n;

    await deposit.approveAndDeposit({
      vaultAddress: createVault.result.vaultAddress,
      tokenAddress: selectedToken.address as Address,
      amount,
      currentAllowance: allowance,
    });

    if (deposit.step === 'done') {
      setWizardStep('done');
    }
  };

  const { data: walletBalance } = useReadContract({
    address: selectedToken?.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!selectedToken && !!userAddress },
  });

  const { data: currentAllowance } = useReadContract({
    address: selectedToken?.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'allowance',
    args:
      userAddress && createVault.result
        ? [userAddress, createVault.result.vaultAddress]
        : undefined,
    query: {
      enabled: !!selectedToken && !!userAddress && !!createVault.result,
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-6 p-6">
        <h1 className="text-2xl font-bold">Create Vault</h1>

        {wizardStep === 'label' && (
          <StepLabel
            label={label}
            onChange={setLabel}
            onNext={() => setWizardStep('token')}
          />
        )}

        {wizardStep === 'token' && (
          <StepToken
            tokens={tokens}
            selected={selectedToken}
            userAddress={userAddress}
            onSelect={(t) => {
              setSelectedToken(t);
              setWizardStep('fees');
            }}
            onBack={() => setWizardStep('label')}
          />
        )}

        {wizardStep === 'fees' && (
          <StepFees
            fees={fees}
            selectedToken={selectedToken}
            onNext={() => setWizardStep('create')}
            onBack={() => setWizardStep('token')}
          />
        )}

        {wizardStep === 'create' && (
          <StepCreate
            label={label}
            selectedToken={selectedToken}
            createState={createVault}
            wantDeposit={wantDeposit}
            setWantDeposit={setWantDeposit}
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            walletBalance={walletBalance}
            onSubmit={handleCreate}
            onBack={() => setWizardStep('fees')}
          />
        )}

        {wizardStep === 'deposit' && (
          <StepDeposit
            deposit={deposit}
            onSubmit={handleDeposit}
            onSkip={() => setWizardStep('done')}
          />
        )}

        {wizardStep === 'done' && (
          <StepDone
            vaultAddress={createVault.result?.vaultAddress}
            onGoToDashboard={() => navigate('/dashboard')}
          />
        )}
      </div>
    </div>
  );
}

function StepLabel({
  label,
  onChange,
  onNext,
}: {
  label: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">
          Vault Label (optional)
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. My DCA Vault"
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Leave empty for automatic naming (Vault #1, #2, ...)
        </p>
      </div>
      <Button className="w-full" onClick={onNext}>
        Next: Select Token
      </Button>
    </div>
  );
}

function StepToken({
  tokens,
  selected,
  userAddress,
  onSelect,
  onBack,
}: {
  tokens: AcceptedToken[];
  selected: AcceptedToken | null;
  userAddress: Address | undefined;
  onSelect: (t: AcceptedToken) => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Select Deposit Token</p>
      {tokens.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading tokens...</p>
      )}
      <div className="space-y-2">
        {tokens.map((token) => (
          <TokenOption
            key={token.address}
            token={token}
            userAddress={userAddress}
            isSelected={selected?.address === token.address}
            onSelect={() => onSelect(token)}
          />
        ))}
      </div>
      <Button variant="outline" className="w-full" onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

function TokenOption({
  token,
  userAddress,
  isSelected,
  onSelect,
}: {
  token: AcceptedToken;
  userAddress: Address | undefined;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { data: balance } = useReadContract({
    address: token.address as Address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  });

  const formatted = balance != null
    ? formatUnits(balance, token.decimals)
    : '...';

  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-md border p-3 text-left text-sm transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-input hover:bg-accent'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="font-medium">{token.symbol}</span>
          <span className="ml-2 text-muted-foreground">{token.name}</span>
        </div>
        <span className="text-muted-foreground">{formatted}</span>
      </div>
    </button>
  );
}

function StepFees({
  fees,
  selectedToken,
  onNext,
  onBack,
}: {
  fees: FeeRates | null;
  selectedToken: AcceptedToken | null;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Fee Preview</p>
      {selectedToken && (
        <p className="text-sm text-muted-foreground">
          Token: {selectedToken.symbol} ({selectedToken.name})
        </p>
      )}
      {fees ? (
        <div className="space-y-2 rounded-md border border-input p-4">
          <div className="flex justify-between text-sm">
            <span>Deposit Fee</span>
            <span>{(fees.depositFeeBps / 100).toFixed(2)}%</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Withdraw Fee</span>
            <span>{(fees.withdrawFeeBps / 100).toFixed(2)}%</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading fees...</p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onNext}>
          Next: Create Vault
        </Button>
      </div>
    </div>
  );
}

function StepCreate({
  label,
  selectedToken,
  createState,
  wantDeposit,
  setWantDeposit,
  depositAmount,
  setDepositAmount,
  walletBalance,
  onSubmit,
  onBack,
}: {
  label: string;
  selectedToken: AcceptedToken | null;
  createState: ReturnType<typeof useCreateVault>;
  wantDeposit: boolean;
  setWantDeposit: (v: boolean) => void;
  depositAmount: string;
  setDepositAmount: (v: string) => void;
  walletBalance: bigint | undefined;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const isLoading = ['simulating', 'confirming', 'waiting', 'registering'].includes(
    createState.step,
  );

  const maxAmount =
    walletBalance != null && selectedToken
      ? formatUnits(walletBalance, selectedToken.decimals)
      : '0';

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-input p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Label</span>
          <span>{label || 'Auto-assigned'}</span>
        </div>
        <div className="flex justify-between">
          <span>Token</span>
          <span>{selectedToken?.symbol}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={wantDeposit}
            onChange={(e) => setWantDeposit(e.target.checked)}
          />
          Make initial deposit after creation
        </label>

        {wantDeposit && (
          <div className="space-y-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.0"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDepositAmount(maxAmount)}
              >
                Max
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Balance: {maxAmount} {selectedToken?.symbol}
            </p>
          </div>
        )}
      </div>

      {createState.step === 'confirming' && (
        <p className="text-sm text-muted-foreground">
          Please confirm the transaction in your wallet...
        </p>
      )}
      {createState.step === 'waiting' && (
        <p className="text-sm text-muted-foreground">
          Waiting for transaction confirmation...
        </p>
      )}
      {createState.step === 'registering' && (
        <p className="text-sm text-muted-foreground">
          Registering vault...
        </p>
      )}
      {createState.error && (
        <div className="text-sm text-destructive">
          <p>{createState.error}</p>
          {createState.result && (
            <p className="mt-1 text-xs break-all">
              Vault address: {createState.result.vaultAddress}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={isLoading}
        >
          Back
        </Button>
        <Button className="flex-1" onClick={onSubmit} disabled={isLoading}>
          {isLoading ? 'Creating...' : 'Create Vault'}
        </Button>
      </div>
    </div>
  );
}

function StepDeposit({
  deposit,
  onSubmit,
  onSkip,
}: {
  deposit: ReturnType<typeof useApproveAndDeposit>;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  const isLoading = ['checking', 'approving', 'depositing'].includes(deposit.step);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Initial Deposit</p>

      {deposit.totalSteps > 0 && (
        <p className="text-sm text-muted-foreground">
          Step {deposit.currentStep}/{deposit.totalSteps}:{' '}
          {deposit.step === 'approving' ? 'Approving...' : 'Depositing...'}
        </p>
      )}

      {deposit.error && (
        <p className="text-sm text-destructive">{deposit.error}</p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onSkip}
          disabled={isLoading}
        >
          Skip
        </Button>
        <Button
          className="flex-1"
          onClick={onSubmit}
          disabled={isLoading || deposit.step === 'done'}
        >
          {isLoading ? 'Processing...' : 'Deposit'}
        </Button>
      </div>
    </div>
  );
}

function StepDone({
  vaultAddress,
  onGoToDashboard,
}: {
  vaultAddress: string | undefined;
  onGoToDashboard: () => void;
}) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-lg font-medium">Vault Created!</p>
      {vaultAddress && (
        <p className="text-xs text-muted-foreground break-all">
          {vaultAddress}
        </p>
      )}
      <Button className="w-full" onClick={onGoToDashboard}>
        Go to Dashboard
      </Button>
    </div>
  );
}
