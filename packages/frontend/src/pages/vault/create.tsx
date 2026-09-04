import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAccount, useReadContract } from 'wagmi';
import { type Address, erc20Abi, parseUnits, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/providers/auth-context';
import { useCreateVault } from '@/hooks/use-create-vault';
import { useApproveAndDeposit } from '@/hooks/use-approve-and-deposit';
import { useFormatters } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { txErrorText } from '@/lib/tx-error';

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
  const { t } = useTranslation();
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

    // Use the returned success flag, not deposit.step — the latter is captured
    // from this render's closure and won't reflect the hook's post-await state.
    const ok = await deposit.approveAndDeposit({
      vaultAddress: createVault.result.vaultAddress,
      tokenAddress: selectedToken.address as Address,
      amount,
      currentAllowance: allowance,
    });

    if (ok) {
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
    <AppShell>
      <div className="mx-auto w-full max-w-md space-y-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            {t('vaultCreate.heading')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('vaultCreate.intro')}
          </p>
        </div>

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
            onSelect={(token) => {
              setSelectedToken(token);
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
    </AppShell>
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
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="vault-create-label" className="text-sm font-medium">
          {t('vaultCreate.labelStep.label')}
        </label>
        <input
          id="vault-create-label"
          type="text"
          value={label}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('vaultCreate.labelStep.placeholder')}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t('vaultCreate.labelStep.hint')}
        </p>
      </div>
      <Button className="w-full" onClick={onNext}>
        {t('vaultCreate.labelStep.next')}
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
  onSelect: (token: AcceptedToken) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{t('vaultCreate.tokenStep.heading')}</p>
      {tokens.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('vaultCreate.tokenStep.loading')}
        </p>
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
        {t('common.back')}
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
      type="button"
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
  const { t } = useTranslation();
  const fmt = useFormatters();

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{t('vaultCreate.feeStep.heading')}</p>
      {selectedToken && (
        <p className="text-sm text-muted-foreground">
          {t('vaultCreate.feeStep.token', {
            symbol: selectedToken.symbol,
            name: selectedToken.name,
          })}
        </p>
      )}
      {fees ? (
        <div className="space-y-2 rounded-md border border-input p-4">
          <div className="flex justify-between gap-4 text-sm">
            <span>{t('vaultCreate.feeStep.depositFee')}</span>
            <span>{fmt.percent(fees.depositFeeBps / 10_000)}</span>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <span>{t('vaultCreate.feeStep.withdrawFee')}</span>
            <span>{fmt.percent(fees.withdrawFeeBps / 10_000)}</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('vaultCreate.feeStep.loading')}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          {t('common.back')}
        </Button>
        <Button className="flex-1" onClick={onNext}>
          {t('vaultCreate.feeStep.next')}
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
  const { t } = useTranslation();
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
        <div className="flex justify-between gap-4">
          <span>{t('vaultCreate.createStep.label')}</span>
          <span className="text-right">
            {label || t('vaultCreate.createStep.autoAssigned')}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span>{t('vaultCreate.createStep.token')}</span>
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
          {t('vaultCreate.createStep.wantDeposit')}
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
                {t('common.max')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('vaultCreate.createStep.balance', {
                amount: maxAmount,
                symbol: selectedToken?.symbol ?? '',
              })}
            </p>
          </div>
        )}
      </div>

      {createState.step === 'confirming' && (
        <p className="text-sm text-muted-foreground">
          {t('vaultCreate.createStep.confirming')}
        </p>
      )}
      {createState.step === 'waiting' && (
        <p className="text-sm text-muted-foreground">
          {t('vaultCreate.createStep.waiting')}
        </p>
      )}
      {createState.step === 'registering' && (
        <p className="text-sm text-muted-foreground">
          {t('vaultCreate.createStep.registering')}
        </p>
      )}
      {(createState.error || createState.errorCode) && (
        <div className="text-sm text-destructive">
          <p className="break-words">
            {txErrorText(t, createState.errorCode, createState.error)}
          </p>
          {createState.result && (
            <p className="mt-1 text-xs break-all">
              {t('vaultCreate.createStep.vaultAddress', {
                address: createState.result.vaultAddress,
              })}
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
          {t('common.back')}
        </Button>
        <Button className="flex-1" onClick={onSubmit} disabled={isLoading}>
          {isLoading
            ? t('vaultCreate.createStep.submitting')
            : t('vaultCreate.createStep.submit')}
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
  const { t } = useTranslation();
  const isLoading = ['checking', 'approving', 'depositing'].includes(deposit.step);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">{t('vaultCreate.depositStep.heading')}</p>

      {deposit.totalSteps > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('deposit.step', {
            current: deposit.currentStep,
            total: deposit.totalSteps,
            action:
              deposit.step === 'approving'
                ? t('deposit.approving')
                : t('deposit.depositing'),
          })}
        </p>
      )}

      {(deposit.error || deposit.errorCode) && (
        <p className="text-sm break-words text-destructive">
          {txErrorText(t, deposit.errorCode, deposit.error)}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onSkip}
          disabled={isLoading}
        >
          {t('common.skip')}
        </Button>
        <Button
          className="flex-1"
          onClick={onSubmit}
          disabled={isLoading || deposit.step === 'done'}
        >
          {isLoading
            ? t('common.processing')
            : t('vaultCreate.depositStep.submit')}
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
  const { t } = useTranslation();

  return (
    <div className="space-y-4 text-center">
      <p className="text-lg font-medium">{t('vaultCreate.doneStep.heading')}</p>
      {vaultAddress && (
        <p className="text-xs text-muted-foreground break-all">
          {vaultAddress}
        </p>
      )}
      <Button className="w-full" onClick={onGoToDashboard}>
        {t('vaultCreate.doneStep.goToDashboard')}
      </Button>
    </div>
  );
}
