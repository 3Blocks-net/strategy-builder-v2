import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface IndexerStatus {
  lastProcessedBlock: number | null;
  lastProcessedBlockTimestamp: string | null;
}

/**
 * Polls the server-truth indexer freshness (PEC-219 #07).
 *
 * `GET /indexer/status` returns the cursor head + its block timestamp. Polled on
 * a fixed interval **regardless of socket state** (it's cheap), so the freshness
 * indicator reflects real indexer lag — not just when the client last fetched.
 */
export function useIndexerStatus(intervalMs = 10_000): IndexerStatus | null {
  const [status, setStatus] = useState<IndexerStatus | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await apiFetch('/indexer/status');
        if (!res.ok) return;
        const data = await res.json();
        if (active) setStatus(data);
      } catch {
        /* transient — keep the last known value */
      }
    };
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}
