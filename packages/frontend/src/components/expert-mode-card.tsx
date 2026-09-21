import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useReadContract } from 'wagmi';
import { type Address } from 'viem';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExpertMode } from '@/hooks/use-expert-mode';
import { useVaultPositions } from '@/hooks/use-vault-positions';
import { StrategyBuilderVaultAbi } from '@/lib/abis';
import { txErrorText } from '@/lib/tx-error';

interface ExpertModeCardProps {
  vaultAddress: string;
}

/**
 * The expert-mode switch of a single vault.
 *
 * Turning the protection *off* is the dangerous direction, so it is the only
 * one behind a warning dialog: the dialog names what actually falls away and
 * only releases its confirm button once the reader has ticked an unticked box.
 * Turning it back on is the safe direction and needs no ceremony.
 *
 * Two boundaries decide what this card does:
 *
 * 1. **It shows, it does not read.** The mode on screen comes from the same
 *    cockpit source as the protection badge above it
 *    (`useVaultPositions`, PRD S10), so the two cannot contradict each other.
 *    This card stays the *writer*: after a successful switch it asks that one
 *    source to read again. When the flag cannot be established it says so
 *    instead of guessing, and never claims "protected" on a failed read.
 * 2. **It only offers what the viewer may actually do.** `setExpertMode` is
 *    `onlyOwner` on chain, so a switch is rendered only for the wallet that
 *    owns this vault. Anyone else — a foreign vault opened by its URL, a
 *    wallet that is not the owner, an ownership read that failed — sees the
 *    mode and a sentence saying why there is no switch, rather than a button
 *    whose transaction is certain to revert after a wallet dialog.
 */
export function ExpertModeCard({ vaultAddress }: ExpertModeCardProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const toggle = useExpertMode();
  const { protection, loading, error, reload } = useVaultPositions();
  const { address: account } = useAccount();

  const { data: owner } = useReadContract({
    address: vaultAddress as Address,
    abi: StrategyBuilderVaultAbi,
    functionName: 'owner',
  });

  const status = protection?.status;
  const known = status === 'standard' || status === 'expert';
  const expertMode = status === 'expert';

  // Ownership is a claim like any other: without a successful read and a
  // connected wallet that matches it, this card offers nothing to press.
  const ownerKnown = typeof owner === 'string' && owner.length > 0;
  const isOwner =
    ownerKnown &&
    typeof account === 'string' &&
    owner.toLowerCase() === account.toLowerCase();

  const busy = toggle.step === 'confirming' || toggle.step === 'waiting';

  const switchTo = async (enabled: boolean) => {
    const ok = await toggle.setExpertMode({
      vaultAddress: vaultAddress as Address,
      enabled,
    });
    if (ok) {
      setDialogOpen(false);
      // The writer tells the one source to read again — it does not keep a
      // second answer of its own.
      await reload();
    }
    return ok;
  };

  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <h3 className="font-semibold">{t('expertMode.heading')}</h3>

      {loading && (
        <p className="text-sm text-muted-foreground">{t('expertMode.reading')}</p>
      )}

      {!loading && !known && (
        <UnknownState reason={error} onRetry={() => reload()} />
      )}

      {!loading && known && (
        <div className="flex items-start gap-3">
          {expertMode ? (
            <ShieldAlert
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              aria-hidden
            />
          ) : (
            <ShieldCheck
              className="mt-0.5 h-5 w-5 shrink-0 text-green-600"
              aria-hidden
            />
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {expertMode
                ? t('expertMode.expert.title')
                : t('expertMode.standard.title')}
            </p>
            <p className="text-sm text-muted-foreground">
              {expertMode
                ? t('expertMode.expert.body')
                : t('expertMode.standard.body')}
            </p>
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t('expertMode.newDeploysOnly')}
      </p>

      {!loading && !isOwner && (
        <p className="text-sm text-muted-foreground">
          {/* Three different reasons, three different sentences. Telling someone
              with no wallet that "your connected wallet is not the owner" names
              a wallet that does not exist. */}
          {!account
            ? t('expertMode.noWalletConnected')
            : ownerKnown
              ? t('expertMode.notOwner')
              : t('expertMode.ownerUnknown')}
        </p>
      )}

      {!loading && isOwner && (
        <div className="flex flex-wrap gap-3">
          {known && !expertMode && (
            <Button
              variant="outline"
              onClick={() => setDialogOpen(true)}
              disabled={busy}
            >
              {t('expertMode.enable')}
            </Button>
          )}
          {(!known || expertMode) && (
            <Button onClick={() => switchTo(false)} disabled={busy}>
              {busy ? t('common.processing') : t('expertMode.disable')}
            </Button>
          )}
        </div>
      )}

      {!dialogOpen && <TxStatus toggle={toggle} />}

      {dialogOpen && (
        <EnableDialog
          busy={busy}
          toggle={toggle}
          onCancel={() => {
            toggle.reset();
            setDialogOpen(false);
          }}
          onConfirm={() => switchTo(true)}
        />
      )}
    </section>
  );
}

/**
 * The honest version of "we don't know": it says what failed, states that
 * nothing changed, and offers a second attempt — a full view, not a dash.
 */
function UnknownState({
  reason,
  onRetry,
}: {
  reason: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3">
      <ShieldQuestion
        className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('expertMode.unknown.title')}</p>
        <p className="text-sm text-muted-foreground">
          {t('expertMode.unknown.body')}
        </p>
        {reason && (
          <p className="text-xs break-words text-muted-foreground">
            {t('expertMode.unknown.detail', { reason })}
          </p>
        )}
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('expertMode.readAgain')}
        </Button>
      </div>
    </div>
  );
}

/** Where the switch currently stands — asking the wallet, failed, or done. */
function TxStatus({ toggle }: { toggle: ReturnType<typeof useExpertMode> }) {
  const { t } = useTranslation();

  if (toggle.step === 'confirming')
    return (
      <p className="text-sm text-muted-foreground">
        {t('expertMode.awaitingWallet')}
      </p>
    );
  if (toggle.step === 'waiting')
    return (
      <p className="text-sm text-muted-foreground">
        {t('expertMode.confirmingOnChain')}
      </p>
    );
  if (toggle.step === 'error') {
    const rejected = toggle.error?.includes('User rejected');
    return (
      <p className="text-sm break-words text-destructive">
        {rejected
          ? t('expertMode.rejected')
          : (txErrorText(t, toggle.errorCode, toggle.error) ??
            t('expertMode.failed'))}
      </p>
    );
  }
  return null;
}

/**
 * The gate in front of the dangerous direction.
 *
 * It exists so that nobody reaches expert mode by clicking on: the confirm
 * button stays disabled until the reader ticks a box that starts unticked
 * every time the dialog opens, and the text says what is actually given up
 * rather than asking whether they are sure.
 */
function EnableDialog({
  busy,
  toggle,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  toggle: ReturnType<typeof useExpertMode>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="expert-mode-dialog-title"
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background shadow-xl"
      >
        <div className="border-b border-border px-6 py-4">
          <h2 id="expert-mode-dialog-title" className="text-lg font-semibold">
            {t('expertMode.dialog.heading')}
          </h2>
        </div>

        <div className="space-y-4 px-6 py-4">
          <p className="text-sm">{t('expertMode.dialog.lead')}</p>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>{t('expertMode.dialog.pointCurated')}</li>
            <li>{t('expertMode.dialog.pointTakeover')}</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            {t('expertMode.dialog.scope')}
          </p>

          <label
            htmlFor="expert-mode-acknowledge"
            className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm"
          >
            <input
              id="expert-mode-acknowledge"
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>{t('expertMode.dialog.acknowledge')}</span>
          </label>

          <p className="text-xs text-muted-foreground">
            {t('expertMode.dialog.signHint')}
          </p>

          <TxStatus toggle={toggle} />
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('expertMode.dialog.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!acknowledged || busy}
          >
            {busy ? t('common.processing') : t('expertMode.dialog.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
