import { useTranslation } from 'react-i18next';
import { useFormatters } from '@/i18n';

/**
 * Connection + freshness indicator for the execution history (PEC-219 #07).
 *
 * The dot reflects the live socket state; the label shows how fresh the data is,
 * derived from the indexer's real cursor head timestamp (server truth) rather
 * than a client-side last-fetch guess.
 */
interface Props {
  connected: boolean;
  lastProcessedBlockTimestamp: string | null;
}

export function FreshnessIndicator({ connected, lastProcessedBlockTimestamp }: Props) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const age = lastProcessedBlockTimestamp
    ? fmt.relativeAge(lastProcessedBlockTimestamp)
    : null;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`h-2 w-2 rounded-full ${
          connected ? 'bg-positive' : 'bg-amber-500'
        }`}
        title={connected ? t('freshness.live') : t('freshness.reconnectingHint')}
      />
      <span>{connected ? t('freshness.live') : t('freshness.reconnecting')}</span>
      {age && <span>{t('freshness.updated', { age })}</span>}
    </span>
  );
}
