# Range-scoped flow-adjusted PnL + costs

## Parent PRD

vault-cockpit-prd.md

## What to build

Make the performance card honor the timeframe selector. PnL and the costs line are computed
for 24h / 7d / 30d / all, **flow-adjusted** so deposits/withdrawals made inside the window
don't masquerade as profit or loss.

- **`PerformanceService` (extend)**: `rangePnL = (currentValue − valueAtRangeStart) −
  (netDeposits within range)`, where `valueAtRangeStart` is the snapshot at/just before the
  range start (from #4). Costs line **range-scoped** to match (fees + gas incurred within the
  window; data already timestamped). See PRD _Modules → PerformanceService_, _Resolved
  decision 8_.
- **API**: `GET /vaults/:address/performance?range=24h|7d|30d|all` — same shape as #6, now
  range-aware.
- **Frontend**: wire the range selector to the `PerformanceCard` (ideally shared with the
  chart's range control) so PnL + costs update with the selected timeframe.

## Acceptance criteria

- [ ] Range PnL = `(currentValue − valueAtRangeStart) − netDeposits-in-range`, using the
      snapshot at/just before the range start; unit-tested incl. a deposit inside the window
      (which must NOT show as profit).
- [ ] Costs line is range-scoped and consistent with the selected range.
- [ ] `GET /performance?range=…` returns the range-adjusted figures for all four ranges.
- [ ] The range selector updates both the chart (#5) and the performance card consistently.
- [ ] "all" range matches the all-time figures from #6.

## Blocked by

- Blocked by `04-value-snapshots.md` (slice #4)
- Blocked by `06-performance-pnl-alltime.md` (slice #6)

## User stories addressed

- User story 25
