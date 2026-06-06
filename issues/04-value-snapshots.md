# Value snapshots + cron loop + positions read-model swap

## Parent PRD

vault-cockpit-prd.md

## What to build

Make the cockpit fast and historical. A periodic backend loop snapshots every vault's full
valuation; the `/positions` endpoint stops recomputing live on every load and instead serves
the latest snapshot, with an explicit refresh for an on-demand live recompute.

- **`VaultValueSnapshot` model** (+ migration): `vaultId`, `blockNumber`, `asOf`,
  `totalValueUsd` (decimal string), `breakdown` (Json — **full** valued per-position detail:
  HF, LP range, in/out-of-range, uncollected fees, APY, earnings). Index `(vaultId, asOf)`.
  The snapshot is now the canonical positions read model. See PRD _Data model_.
- **`SnapshotService` + loop**: self-rescheduling `setTimeout` loop (same pattern as
  `IndexerService`: in-flight guard, resilient `onModuleInit`, **dormant when the provider is
  null**). Hourly, iterates all known vaults (`prisma.vault.findMany`), calls
  `ValuationService.valueVault`, persists one row each. **Bounded concurrency** (p-limit
  `SNAPSHOT_CONCURRENCY`) and its **own provider** (`SNAPSHOT_RPC_URL`, **falls back to the
  shared `INDEXER_PROVIDER`** if unset). 90-day retention pruned by the same loop. Interval +
  retention config-driven. See PRD _Modules → SnapshotService_.
- **Read-model swap**: `GET /vaults/:address/positions` (default) serves the latest
  snapshot's breakdown; `refresh=1` performs a **live ephemeral** recompute (short-TTL
  cached, **not** persisted). **Cold start** (no snapshot yet) lazily computes a live
  ephemeral valuation and shows it; the cron persists the first real row within the hour.
- **Freshness**: `FreshnessIndicator` now shows the snapshot `asOf` age for the default view,
  "live / just now" after a refresh. See PRD _Read-model & freshness behavior_.

## Acceptance criteria

- [ ] `VaultValueSnapshot` migration applied; rows store the full per-position breakdown, not
      just a total.
- [ ] `SnapshotService` loop writes one snapshot per known vault per tick; respects the
      concurrency cap; prunes rows older than the retention window; is dormant when no
      provider is configured. Unit-tested with mocked Prisma + `ValuationService`.
- [ ] The loop uses `SNAPSHOT_RPC_URL` when set and falls back to the shared provider when not.
- [ ] `GET /positions` (default) serves the latest snapshot; `refresh=1` returns a live
      recompute without writing a snapshot.
- [ ] Cold start (no snapshot) returns a live ephemeral valuation rather than an empty/error
      response.
- [ ] `FreshnessIndicator` reflects snapshot age by default and "live" after refresh.

## Blocked by

- Blocked by `01-cockpit-spine.md` (slice #1)
- Blocked by `02-aave-positions-adapter.md` (slice #2)
- Blocked by `03-pancakeswap-lp-adapter.md` (slice #3)

## User stories addressed

- User story 19
- User story 20
- User story 27
- User story 28
