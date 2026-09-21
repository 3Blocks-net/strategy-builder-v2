/**
 * The one place the cockpit's view of a vault is read from.
 *
 * Two things on the vault detail page talk about the same flag: the protection
 * badge next to the positions, and the expert-mode card further down. Reading
 * that flag twice — once from the backend snapshot path, once straight from
 * the chain — is how a page ends up contradicting itself, so the *display*
 * side of both has exactly one source: this provider. The card stays the
 * writer; after a successful switch it asks this source to read again.
 *
 * The other rule lives in `protection` below: a status the latest attempt
 * could not confirm is not handed out at all. Stale data whose refresh just
 * failed is an unclear state, and an unclear state is never a claim.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiFetch } from '@/lib/api';
import type { VaultProtection } from '@/components/protection-badge';

export interface PositionLeg {
  token: string;
  symbol: string;
  decimals: number;
  amount: string;
  amountUsd: number | null;
  isDebt?: boolean;
}

export interface ValuedPosition {
  protocol: string;
  kind: string;
  label: string;
  legs: PositionLeg[];
  valueUsd: number | null;
  debtUsd?: number;
  earningsUsd?: number | null;
  metrics?: Record<string, unknown>;
  error?: string;
}

export interface ValuedVault {
  vaultAddress: string;
  positions: ValuedPosition[];
  totalValueUsd: number;
  asOfBlock: number | null;
  asOf: string;
  source?: 'snapshot' | 'live';
  /** Absent whenever the answer did not carry one — that reads as unknown. */
  protection?: VaultProtection;
}

export interface VaultPositionsSource {
  /** The last view that actually arrived; it stays put while a reload runs. */
  data: ValuedVault | null;
  /** True until the first attempt for this vault has finished, either way. */
  loading: boolean;
  /** True while a later attempt is on its way, with data already on screen. */
  refreshing: boolean;
  /** True when the most recent attempt did not produce an answer. */
  failed: boolean;
  /** Why the most recent attempt failed, when it said so. */
  error: string | null;
  /**
   * The vault's protection status — `undefined` whenever the latest attempt
   * failed, because a flag that could not be confirmed just now must not be
   * shown as one, however recently it was read.
   */
  protection: VaultProtection | undefined;
  /** Ask again. `refresh` recomputes the valuation live instead of serving a snapshot. */
  reload: (refresh?: boolean) => Promise<void>;
}

const VaultPositionsContext = createContext<VaultPositionsSource | null>(null);

/** Exposed so a test can stand in for the network with a fixed source. */
export const VaultPositionsSourceContext = VaultPositionsContext;

export function useVaultPositions(): VaultPositionsSource {
  const source = useContext(VaultPositionsContext);
  if (!source) {
    throw new Error(
      'useVaultPositions needs a <VaultPositionsProvider> above it — the cockpit view has exactly one source.',
    );
  }
  return source;
}

export function VaultPositionsProvider({
  address,
  children,
}: {
  address: string;
  children: React.ReactNode;
}) {
  const [data, setData] = useState<ValuedVault | null>(null);
  const [pending, setPending] = useState(true);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (refresh = false) => {
      setPending(true);
      setFailed(false);
      setError(null);
      try {
        const res = await apiFetch(
          `/vaults/${address}/positions${refresh ? '?refresh=1' : ''}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData((await res.json()) as ValuedVault);
      } catch (e) {
        setFailed(true);
        setError(e instanceof Error ? e.message : null);
      } finally {
        setPending(false);
        setSettled(true);
      }
    },
    [address],
  );

  useEffect(() => {
    setData(null);
    setSettled(false);
    reload();
  }, [reload]);

  const value = useMemo<VaultPositionsSource>(
    () => ({
      data,
      loading: pending && !settled,
      refreshing: pending && settled,
      failed,
      error,
      protection: failed ? undefined : data?.protection,
      reload,
    }),
    [data, pending, settled, failed, error, reload],
  );

  return (
    <VaultPositionsContext.Provider value={value}>
      {children}
    </VaultPositionsContext.Provider>
  );
}
