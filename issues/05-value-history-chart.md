# Value-history chart + /value-history endpoint

## Parent PRD

vault-cockpit-prd.md

## What to build

The USD value-over-time view. The owner sees a chart of their vault's total value with
selectable ranges and markers for their own deposits/withdrawals, served from the snapshots
written in #4.

- **API**: `GET /vaults/:address/value-history?range=24h|7d|30d|all` under `VaultOwnerGuard`
  → the snapshot series (downsampled per range to bound point count) + deposit/withdraw
  markers (from `VaultEvent`) + `historyStartsAt` (first snapshot timestamp, for the label).
  See PRD _API contracts_.
- **Frontend**: `ValueHistoryChart` with a 24h / 7d / 30d / since-creation range toggle,
  deposit/withdraw markers overlaid, a "history from <date>" label for vaults that predate
  the cockpit (so an early flat segment is explained), and a "not enough history yet" state
  for young vaults. The chart reflects deployed DeFi capital (Aave + LP + gas reserve), since
  the snapshot total is net equity. See PRD _Frontend_ and _Resolved decision 10_.

## Acceptance criteria

- [ ] `GET /value-history` returns a downsampled snapshot series whose point count is bounded
      per range, plus deposit/withdraw markers and `historyStartsAt`.
- [ ] `ValueHistoryChart` renders the curve for each range and overlays deposit/withdraw
      markers.
- [ ] A vault with snapshots starting after creation shows the "history from <date>" label;
      a young vault with too few points shows the "not enough history yet" state.
- [ ] The charted total matches the snapshot net-equity total (includes Aave + LP + gas
      reserve, debt subtracted).

## Blocked by

- Blocked by `04-value-snapshots.md` (slice #4)

## User stories addressed

- User story 16
- User story 17
- User story 18
- User story 21
