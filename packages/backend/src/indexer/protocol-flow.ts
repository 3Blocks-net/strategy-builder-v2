/**
 * Generic protocol-flow ingestion contract (Vault-Cockpit slice #08).
 *
 * The indexer stays protocol-agnostic: it asks each registered source for its
 * `logSubscriptions()` and processes them uniformly. A subscription is fully
 * self-describing — emitting address, event ABI, which indexed topic holds the
 * vault, and a pure `toDraft` mapper — so adding a new protocol's earnings means
 * adding an adapter, never editing the indexer core.
 */
import { Interface, getAddress, zeroPadValue } from 'ethers';
import type { RawLogLike } from './event-mapper';

/** The protocol-specific part a subscription contributes per matching log. */
export interface ProtocolFlowDraft {
  protocol: string;
  kind: string; // e.g. AAVE_SUPPLY | AAVE_WITHDRAW
  token: string; // reserve
  amount: string; // base units
}

export interface LogSubscription {
  /** Contract that emits the event (e.g. the Aave Pool), checksummed. */
  address: string;
  iface: Interface;
  eventName: string;
  topic0: string;
  /** Which indexed topic (1..3) holds the vault address. */
  vaultTopicIndex: number;
  /** Pure: decoded event args → a flow draft, or null to skip. */
  toDraft(args: ReadonlyArray<unknown> & Record<string, unknown>): ProtocolFlowDraft | null;
}

/** Anything that contributes log subscriptions (a protocol adapter). */
export interface ProtocolFlowSource {
  logSubscriptions(): Promise<LogSubscription[]>;
}

/** DI token for the array of flow sources injected into the indexer. */
export const PROTOCOL_FLOW_SOURCES = Symbol('PROTOCOL_FLOW_SOURCES');

export interface ProtocolFlowRow extends ProtocolFlowDraft {
  vaultAddress: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  blockTimestamp: Date;
}

/** The 32-byte topic value for an address (left-padded). */
function addressFromTopic(topic: string): string {
  return getAddress('0x' + topic.slice(topic.length - 40));
}

/**
 * The `topics` array for a `getLogs` call gated server-side to known vaults:
 * `[topic0, …null…, [paddedVaultA, paddedVaultB, …]]` at `vaultTopicIndex`.
 */
export function vaultTopicFilter(
  sub: LogSubscription,
  vaultAddresses: string[],
): (string | string[] | null)[] {
  const padded = vaultAddresses.map((a) => zeroPadValue(getAddress(a), 32));
  const topics: (string | string[] | null)[] = [sub.topic0];
  for (let i = 1; i < sub.vaultTopicIndex; i++) topics.push(null);
  topics.push(padded);
  return topics;
}

/**
 * Pure: raw logs from `sub.address` → flow rows, gated to known vaults. A log is
 * kept only if its topic0 matches and the vault topic resolves to a known vault.
 */
export function buildProtocolFlowRows(
  sub: LogSubscription,
  logs: RawLogLike[],
  vaultByAddress: Map<string, string>,
  blockTimestamps: Map<number, number>,
): ProtocolFlowRow[] {
  const rows: ProtocolFlowRow[] = [];
  for (const log of logs) {
    if ((log.topics[0] ?? '').toLowerCase() !== sub.topic0.toLowerCase()) continue;
    const vaultTopic = log.topics[sub.vaultTopicIndex];
    if (!vaultTopic) continue;

    const vault = addressFromTopic(vaultTopic);
    if (!vaultByAddress.has(vault)) continue;

    const parsed = sub.iface.parseLog({
      topics: Array.from(log.topics),
      data: log.data,
    });
    if (!parsed) continue;

    const draft = sub.toDraft(parsed.args as never);
    if (!draft) continue;

    const ts = blockTimestamps.get(log.blockNumber);
    if (ts === undefined) continue;

    rows.push({
      ...draft,
      vaultAddress: vault,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      logIndex: log.index,
      blockTimestamp: new Date(ts * 1000),
    });
  }
  return rows;
}
