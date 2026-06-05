/**
 * Pure event → row mapping for the execution indexer (PEC-219).
 *
 * No provider, no DB. Given decoded vault logs and a per-block timestamp lookup,
 * it produces the `Execution` rows to persist — including the `GasCompSettled`
 * join (same tx as `AutomationExecuted`) and the timestamp conversion. The USD
 * value is deliberately NOT computed here (it needs a price feed + token
 * decimals, both I/O); the indexer fills `gasCompUsd` after calling the mapper.
 *
 * Slice #01 indexes successes only (`AutomationExecuted` + `GasCompSettled`).
 * `Deposited` / `Withdrawn` are declared in the ABI for the shared topic filter
 * but mapped in a later slice.
 */
import { Interface, Log, getAddress } from 'ethers';

export const VAULT_EVENT_SIGNATURES = [
  'event AutomationExecuted(uint32 indexed automationId, address indexed executor)',
  'event GasCompSettled(uint32 indexed automationId, address indexed executor, address indexed token, uint256 gasCompTokens)',
  'event Deposited(address indexed token, uint256 amount)',
  'event Withdrawn(address indexed token, uint256 amount, uint256 fee, address indexed recipient)',
];

export const vaultEventInterface = new Interface(VAULT_EVENT_SIGNATURES);

/** Topic hashes for the address-less `getLogs` filter (slice #01 = successes). */
export const SUCCESS_TOPICS: string[] = [
  vaultEventInterface.getEvent('AutomationExecuted')!.topicHash,
  vaultEventInterface.getEvent('GasCompSettled')!.topicHash,
];

/**
 * Topic hashes for the unified feed (PEC-219 #04): successes + gas-comp +
 * deposit/withdraw, pulled in a single address-less `getLogs`.
 */
export const ALL_TOPICS: string[] = [
  ...SUCCESS_TOPICS,
  vaultEventInterface.getEvent('Deposited')!.topicHash,
  vaultEventInterface.getEvent('Withdrawn')!.topicHash,
];

/** A minimally-typed log — what `getLogs` returns, or a synthetic test log. */
export interface RawLogLike {
  address: string;
  transactionHash: string;
  blockNumber: number;
  index: number; // log index within the block
  topics: ReadonlyArray<string>;
  data: string;
}

export interface ParsedVaultLog {
  name: string;
  address: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  args: ReadonlyArray<any>;
}

export interface ExecutionRowData {
  vaultAddress: string;
  automationId: number;
  executorAddress: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  blockTimestamp: Date;
  gasCompAmount: string | null;
  gasCompToken: string | null;
}

/** Decode a single log against the vault ABI; returns null for foreign logs. */
export function parseVaultLog(log: RawLogLike | Log): ParsedVaultLog | null {
  const parsed = vaultEventInterface.parseLog({
    topics: Array.from(log.topics),
    data: log.data,
  });
  if (!parsed) return null;
  return {
    name: parsed.name,
    address: getAddress(log.address),
    txHash: (log as RawLogLike).transactionHash,
    blockNumber: log.blockNumber,
    logIndex: (log as RawLogLike).index,
    args: parsed.args,
  };
}

/**
 * Build the `Execution` rows from a batch of already-decoded vault logs.
 *
 * One row per `AutomationExecuted`. The matching `GasCompSettled` (same tx,
 * same `automationId` + `executor`) supplies `gasCompAmount` / `gasCompToken`;
 * absent (owner-executed runs) → both null. `blockTimestamps` maps a block
 * number to its unix-seconds timestamp.
 */
export function buildExecutionRows(
  parsedLogs: ParsedVaultLog[],
  blockTimestamps: Map<number, number>,
): ExecutionRowData[] {
  const rows: ExecutionRowData[] = [];

  for (const log of parsedLogs) {
    if (log.name !== 'AutomationExecuted') continue;

    const automationId = Number(log.args[0]);
    const executor = getAddress(log.args[1] as string);

    const gasComp = parsedLogs.find(
      (l) =>
        l.name === 'GasCompSettled' &&
        l.txHash === log.txHash &&
        Number(l.args[0]) === automationId &&
        getAddress(l.args[1] as string) === executor,
    );

    const tsSeconds = blockTimestamps.get(log.blockNumber);
    if (tsSeconds === undefined) {
      throw new Error(
        `Missing block timestamp for block ${log.blockNumber} (tx ${log.txHash})`,
      );
    }

    rows.push({
      vaultAddress: log.address,
      automationId,
      executorAddress: executor,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      blockTimestamp: new Date(tsSeconds * 1000),
      gasCompAmount: gasComp ? (gasComp.args[3] as bigint).toString() : null,
      gasCompToken: gasComp ? getAddress(gasComp.args[2] as string) : null,
    });
  }

  return rows;
}

export interface VaultEventRowData {
  vaultAddress: string;
  eventType: 'DEPOSIT' | 'WITHDRAW';
  token: string;
  amount: string; // gross (pre-fee), matching the event
  feeAmount: string;
  feeBps: number;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  blockTimestamp: Date;
}

/**
 * Build `VaultEvent` rows from `Deposited` / `Withdrawn` logs (PEC-219 #04).
 *
 * - `Deposited(token, amount)` carries no fee → the deposit fee is **derived**
 *   from the current `depositFeeBps` (`fee = amount * bps / 10_000`). Exact on
 *   the fork; approximate on mainnet only if the rate changed historically.
 * - `Withdrawn(token, amount, fee, recipient)` carries the **exact** fee; the
 *   bps is derived back from `fee / amount` for display.
 */
export function buildVaultEventRows(
  parsedLogs: ParsedVaultLog[],
  blockTimestamps: Map<number, number>,
  depositFeeBps: number,
): VaultEventRowData[] {
  const rows: VaultEventRowData[] = [];

  for (const log of parsedLogs) {
    const isDeposit = log.name === 'Deposited';
    const isWithdraw = log.name === 'Withdrawn';
    if (!isDeposit && !isWithdraw) continue;

    const tsSeconds = blockTimestamps.get(log.blockNumber);
    if (tsSeconds === undefined) {
      throw new Error(
        `Missing block timestamp for block ${log.blockNumber} (tx ${log.txHash})`,
      );
    }

    const token = getAddress(log.args[0] as string);
    const amount = log.args[1] as bigint;

    let feeAmount: bigint;
    let feeBps: number;
    if (isDeposit) {
      feeBps = depositFeeBps;
      feeAmount = (amount * BigInt(depositFeeBps)) / 10_000n;
    } else {
      feeAmount = log.args[2] as bigint; // exact from the event
      feeBps = amount > 0n ? Number((feeAmount * 10_000n) / amount) : 0;
    }

    rows.push({
      vaultAddress: log.address,
      eventType: isDeposit ? 'DEPOSIT' : 'WITHDRAW',
      token,
      amount: amount.toString(),
      feeAmount: feeAmount.toString(),
      feeBps,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      blockTimestamp: new Date(tsSeconds * 1000),
    });
  }

  return rows;
}
