/**
 * Pure, deterministic block-range planner for the execution indexer (PEC-219).
 *
 * No I/O, no provider — given the chain head, the durable cursor, the maximum
 * window size and the confirmation depth, it yields the `[from, to]` windows the
 * indexer should scan. Kept pure so the confirmation cap, full-range chunking and
 * the adaptive-halving recomputation can be exercised without a chain.
 */

export interface BlockRange {
  from: number;
  to: number;
}

export class RangePlanner {
  /**
   * Plan the windows to scan.
   *
   * Only blocks `<= head - confirmations` are eligible (reorg safety). Scanning
   * resumes at `cursor + 1` and is chunked into windows of at most `maxRange`
   * blocks (inclusive bounds). Returns `[]` when there is nothing safe to scan
   * yet (e.g. the only new blocks are still inside the confirmation window).
   */
  static plan(
    head: number,
    cursor: number,
    maxRange: number,
    confirmations: number,
  ): BlockRange[] {
    if (maxRange < 1) throw new Error('maxRange must be >= 1');
    if (confirmations < 0) throw new Error('confirmations must be >= 0');

    const safeHead = head - confirmations;
    const from = cursor + 1;
    if (safeHead < from) return [];

    const ranges: BlockRange[] = [];
    let start = from;
    while (start <= safeHead) {
      const end = Math.min(start + maxRange - 1, safeHead);
      ranges.push({ from: start, to: end });
      start = end + 1;
    }
    return ranges;
  }

  /**
   * Adaptive halving: when a `getLogs` over `range` is rejected by the RPC for
   * being too wide (BSC public RPC), split it into two halves to retry. A
   * single-block range cannot be narrowed further and is returned unchanged so
   * the caller can surface the real error instead of looping forever.
   */
  static halve(range: BlockRange): BlockRange[] {
    if (range.to <= range.from) return [range];
    const mid = Math.floor((range.from + range.to) / 2);
    return [
      { from: range.from, to: mid },
      { from: mid + 1, to: range.to },
    ];
  }
}
