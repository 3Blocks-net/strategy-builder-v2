/**
 * Bounded-concurrency async map (PRD: snapshot loop must not starve the indexer).
 * No dependency (p-limit isn't installed). Runs at most `limit` `fn`s at once.
 */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const n = Math.max(1, limit);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, () => worker()),
  );
}
