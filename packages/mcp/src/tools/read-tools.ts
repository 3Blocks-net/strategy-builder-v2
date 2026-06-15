import { BackendClient, ForbiddenVaultError } from '../backend-client.js';

export interface VaultSummary {
  address: string;
  label: string;
  depositToken: string;
  chainId: number;
}

export interface GasDeposit {
  enabled: boolean;
  token: string | null;
  deposited: string;
  minFeeDeposit: string;
}

export interface VaultDetail extends VaultSummary {
  gasDeposit: GasDeposit;
}

export interface AutomationSummary {
  id: string;
  onChainId: number | null;
  label: string | null;
  description: string | null;
  scope: 'owner' | 'public';
  stepCount: number;
  active: boolean | null;
  triggerStatus: string | null;
}

export interface ExecutionRun {
  id: string;
  txHash: string | null;
  automationId: number | null;
  timestamp: string;
  gasComp: { amount: string | null; token: string | null; usd: string | null };
}

export interface ExecutionTransfer {
  id: string;
  txHash: string | null;
  type: string | null;
  token: string | null;
  amount: string | null;
  amountUsd: string | null;
  fee: { amount: string | null; bps: number | null };
  timestamp: string;
}

export interface ExecutionFailure {
  id: string;
  txHash: string | null;
  automationId: number | null;
  reason: string | null;
  status: string | null;
  attemptCount: number | null;
  timestamp: string;
}

export interface ExecutionsView {
  total: number;
  page: number;
  pageSize: number;
  runs: ExecutionRun[];
  transfers: ExecutionTransfer[];
  failures: ExecutionFailure[];
}

// --- Loose backend-response shapes (only the fields we project) ------------

interface RawVault {
  address: string;
  label: string;
  depositToken: string;
  chainId: number;
}

interface RawAutomation {
  id: string;
  onChainId: number | null;
  label: string | null;
  description: string | null;
  ownerOnly: boolean;
  stepCount: number;
  active: boolean | null;
  triggerStatus: string | null;
}

interface RawHistoryRow {
  kind: 'execution' | 'vault_event' | 'failure';
  id: string;
  txHash: string | null;
  automationId: number | null;
  blockTimestamp: string;
  gasCompAmount: string | null;
  gasCompToken: string | null;
  gasCompUsd: string | null;
  eventType: string | null;
  token: string | null;
  amount: string | null;
  amountUsd: string | null;
  feeAmount: string | null;
  feeBps: number | null;
  failureStatus: string | null;
  errorMessage: string | null;
  attemptCount: number | null;
}

interface RawExecutionPage {
  total: number;
  page: number;
  pageSize: number;
  rows: RawHistoryRow[];
}

// --- Tools -----------------------------------------------------------------

/** Alle Vaults der verbundenen Owner-Adresse (backend-seitig JWT-gefiltert). */
export async function listVaults(bc: BackendClient): Promise<VaultSummary[]> {
  const raw = await bc.get<RawVault[]>('/vaults');
  return raw.map((v) => ({
    address: v.address,
    label: v.label,
    depositToken: v.depositToken,
    chainId: v.chainId,
  }));
}

/** Ein Vault des Owners inkl. Gas-Deposit-Stand. Fremd/unbekannt → Ablehnung. */
export async function getVault(bc: BackendClient, address: string): Promise<VaultDetail> {
  const vaults = await listVaults(bc);
  const vault = vaults.find((v) => v.address.toLowerCase() === address.toLowerCase());
  if (!vault) {
    // Nicht in der Owner-Liste → kein Zugriff (Owner-Isolation).
    throw new ForbiddenVaultError(address);
  }
  const gasDeposit = await bc.get<GasDeposit>(`/vaults/${address}/gas-deposit`);
  return { ...vault, gasDeposit };
}

/** Portfolio/Bestände eines Vaults (owner-guarded; 403 → klare Ablehnung). */
export async function getPortfolio(bc: BackendClient, address: string): Promise<unknown> {
  return bc.get(`/vaults/${address}/portfolio`);
}

/** Automations eines Vaults (aktiv/pausiert, owner-only/public, Kurzinfo). */
export async function listAutomations(
  bc: BackendClient,
  address: string,
): Promise<AutomationSummary[]> {
  const raw = await bc.get<RawAutomation[]>(`/vaults/${address}/automations`);
  return raw.map((a) => ({
    id: a.id,
    onChainId: a.onChainId,
    label: a.label,
    description: a.description,
    scope: a.ownerOnly ? 'owner' : 'public',
    stepCount: a.stepCount,
    active: a.active,
    triggerStatus: a.triggerStatus,
  }));
}

export interface ExecutionsQuery {
  automationId?: number;
  page?: number;
  pageSize?: number;
}

/**
 * Ausführungsverlauf eines Vaults, in LLM-freundliche Buckets sortiert:
 * erfolgreiche Runs, Deposits/Withdraws und dekodierte Fehlschläge
 * (`reason` = `Step N: <reason>` aus dem Indexer).
 */
export async function getExecutions(
  bc: BackendClient,
  address: string,
  query: ExecutionsQuery = {},
): Promise<ExecutionsView> {
  const params = new URLSearchParams();
  if (query.automationId !== undefined) params.set('automationId', String(query.automationId));
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  const qs = params.toString();
  const path = `/vaults/${address}/executions${qs ? `?${qs}` : ''}`;

  const page = await bc.get<RawExecutionPage>(path);
  const runs: ExecutionRun[] = [];
  const transfers: ExecutionTransfer[] = [];
  const failures: ExecutionFailure[] = [];

  for (const r of page.rows) {
    if (r.kind === 'execution') {
      runs.push({
        id: r.id,
        txHash: r.txHash,
        automationId: r.automationId,
        timestamp: r.blockTimestamp,
        gasComp: { amount: r.gasCompAmount, token: r.gasCompToken, usd: r.gasCompUsd },
      });
    } else if (r.kind === 'vault_event') {
      transfers.push({
        id: r.id,
        txHash: r.txHash,
        type: r.eventType,
        token: r.token,
        amount: r.amount,
        amountUsd: r.amountUsd,
        fee: { amount: r.feeAmount, bps: r.feeBps },
        timestamp: r.blockTimestamp,
      });
    } else {
      failures.push({
        id: r.id,
        txHash: r.txHash,
        automationId: r.automationId,
        reason: r.errorMessage,
        status: r.failureStatus,
        attemptCount: r.attemptCount,
        timestamp: r.blockTimestamp,
      });
    }
  }

  return { total: page.total, page: page.page, pageSize: page.pageSize, runs, transfers, failures };
}

/** Zeitbereich für Performance/Wertverlauf (vom Cockpit-Backend akzeptiert). */
export type HistoryRange = '24h' | '7d' | '30d' | 'all';

/**
 * Vereinheitlichte, USD-bewertete DeFi-Positionssicht eines Vaults (idle Token,
 * Gas-Reserve, Protokoll-Adapter-Positionen wie Aave/PancakeSwap, Netto-Equity).
 * Passthrough der bereits strukturierten Cockpit-View. `refresh` rechnet live neu.
 */
export async function getPositions(
  bc: BackendClient,
  address: string,
  opts: { refresh?: boolean } = {},
): Promise<unknown> {
  const qs = opts.refresh ? '?refresh=1' : '';
  return bc.get(`/vaults/${address}/positions${qs}`);
}

/** PnL vs. Netto-Einzahlungen + Kosten (Fees + Gas) über einen Zeitbereich. */
export async function getPerformance(
  bc: BackendClient,
  address: string,
  opts: { range?: HistoryRange } = {},
): Promise<unknown> {
  const qs = opts.range ? `?range=${opts.range}` : '';
  return bc.get(`/vaults/${address}/performance${qs}`);
}

/** USD-Wertverlauf über die Zeit + Deposit/Withdraw-Marker. */
export async function getValueHistory(
  bc: BackendClient,
  address: string,
  opts: { range?: HistoryRange } = {},
): Promise<unknown> {
  const qs = opts.range ? `?range=${opts.range}` : '';
  return bc.get(`/vaults/${address}/value-history${qs}`);
}
