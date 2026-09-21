import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { useFormatters } from '@/i18n';

/** What the backend read from the vault — `unknown` when nobody got an answer. */
export type ProtectionStatus = 'standard' | 'expert' | 'unknown';

export interface VaultProtection {
  status: ProtectionStatus;
  /** ISO time of the read behind the status; null when it is unknown. */
  checkedAt: string | null;
}

/**
 * The protection status of one vault, as a badge (PRD S10).
 *
 * Two rules decide everything this component does:
 *
 * 1. **Silence must mean "checked and fine", never "nobody looked"**
 *    (`docs/produkt.md`, station 8). So the badge always states which of the
 *    two it is: a checked status carries the time it was read, the unknown
 *    status says outright that nothing could be read. The pattern is the one
 *    `freshness-indicator.tsx` uses for the execution history.
 * 2. **An unclear state shows the most conservative thing.** Anything that is
 *    not a successfully read flag — a missing field, an older backend, a
 *    failed request, a status without a read time behind it — renders as
 *    "unknown". "Protected" is only ever shown on evidence.
 */
export function ProtectionBadge({
  protection,
}: {
  protection?: VaultProtection | null;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters();

  // A status is only as good as the read behind it: no read time, no claim.
  const verified =
    protection?.checkedAt != null &&
    (protection.status === 'standard' || protection.status === 'expert')
      ? { status: protection.status, checkedAt: protection.checkedAt }
      : null;

  if (!verified) {
    // The way out of an unknown status is the only actionable thing this
    // component ever says, so it is written on the page rather than hidden in
    // a tooltip a touch or keyboard reader never reaches.
    return (
      <Badge
        className="border-dashed border-border text-muted-foreground"
        icon={<ShieldQuestion className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        label={t('protection.unknown')}
        note={t('protection.notChecked')}
        hint={t('protection.unknownHint')}
      />
    );
  }

  if (verified.status === 'expert') {
    return (
      <Badge
        className="border-warning-border bg-warning-surface text-warning"
        icon={<ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        label={t('protection.expert')}
        note={t('protection.checked', { age: fmt.relativeAge(verified.checkedAt) })}
        title={t('protection.expertHint')}
      />
    );
  }

  return (
    <Badge
      className="border-positive/30 bg-positive/10 text-positive"
      icon={<ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      label={t('protection.protected')}
      note={t('protection.checked', { age: fmt.relativeAge(verified.checkedAt) })}
      title={t('protection.protectedHint')}
    />
  );
}

/**
 * The badge itself, plus — when there is one — the sentence that belongs on
 * the page instead of in a tooltip.
 *
 * `title` carries the background of a status that needs no action from the
 * reader. `hint` carries the next step, and a next step is never a tooltip:
 * it is rendered as text, so a touch screen and a keyboard reach it exactly
 * as a mouse pointer does.
 */
function Badge({
  className,
  icon,
  label,
  note,
  title,
  hint,
}: {
  className: string;
  icon: React.ReactNode;
  label: string;
  note: string;
  title?: string;
  hint?: string;
}) {
  const badge = (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      {icon}
      <span>{label}</span>
      <span className="font-normal opacity-80">· {note}</span>
    </span>
  );

  if (!hint) return badge;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {badge}
      <span className="max-w-prose text-xs font-normal text-muted-foreground">
        {hint}
      </span>
    </span>
  );
}
