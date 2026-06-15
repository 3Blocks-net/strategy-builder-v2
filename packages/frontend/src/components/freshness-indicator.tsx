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

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function FreshnessIndicator({ connected, lastProcessedBlockTimestamp }: Props) {
  const age = relativeAge(lastProcessedBlockTimestamp);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={`h-2 w-2 rounded-full ${
          connected ? 'bg-green-500' : 'bg-amber-500'
        }`}
        title={connected ? 'Live' : 'Reconnecting — polling for updates'}
      />
      <span>{connected ? 'Live' : 'Reconnecting'}</span>
      {age && <span>· updated {age}</span>}
    </span>
  );
}
