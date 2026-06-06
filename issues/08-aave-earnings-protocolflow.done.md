# Exact Aave earnings — ProtocolFlow + adapter-driven indexer extension

## Parent PRD

vault-cockpit-prd.md

## What to build

> **HITL** — this modifies the PEC-219 indexer's clean single-feed design. Hold an
> architecture review of the adapter-subscription integration before merging.

Exact Aave earnings per supplied reserve. This requires per-reserve net principal, which no
existing table holds — so the indexer is extended (generically, via adapter-declared log
subscriptions) to capture Aave Supply/Withdraw flows into a new, **separate** store, kept
strictly apart from the boundary `VaultEvent`s that drive PnL.

- **`ProtocolFlow` model** (+ migration): `vaultId`, `protocol`, `reserve/token`, `kind`
  (e.g. `AAVE_SUPPLY` / `AAVE_WITHDRAW`), `amount`, `amountUsd` (frozen), `txHash`,
  `blockNumber`, `logIndex`, `blockTimestamp`; `@@unique([txHash, logIndex])`. **Wholly
  separate from `VaultEvent`.** See PRD _Data model_, _Resolved decision 2 & 9_.
- **Indexer extension (adapter-driven)**: the indexer additionally subscribes to each
  adapter's `logSubscriptions()` (`{address, topics, vaultTopicIndex}`). For Aave that's the
  Pool `Supply` (`onBehalfOf` indexed) + `Withdraw` (`user` indexed); hits are gated on the
  declared topic ∈ known vaults, frozen in USD via `PriceService`, written to `ProtocolFlow`.
  **One block cursor** still advances all feeds together. The integration stays generic so a
  future protocol's adapter wires its own earnings without indexer surgery. See PRD _Modules
  → Indexer extension_, _Resolved decision 5_.
- **`AaveV3Adapter` earnings**: `earningsUsd = (scaledATokenBalance × liquidityIndex / RAY)
  USD − net principal USD` (net principal from `ProtocolFlow`). Surface per-reserve earnings
  in the positions breakdown/panel.

## Acceptance criteria

- [ ] `ProtocolFlow` migration applied; rows are idempotent on `(txHash, logIndex)`.
- [ ] The indexer iterates adapter `logSubscriptions()` generically (no Aave-specific branch
      in the indexer core); Aave Supply/Withdraw for `onBehalfOf/user ∈ knownVaults` produce
      frozen-USD `ProtocolFlow` rows; foreign vaults are ignored; re-scan is idempotent.
- [ ] The single block cursor still advances all feeds together (durable resume preserved).
- [ ] `AaveV3Adapter` computes exact per-reserve earnings via `scaledBalance × index −
      ProtocolFlow` net principal; shown in the panel.
- [ ] **PnL firewall test**: an Aave supply (a `ProtocolFlow` row) does NOT change
      `PerformanceService.netDeposits` (which reads `VaultEvent` only).
- [ ] Earnings math has hard-fixture unit coverage (RAY/index scaling).

## Blocked by

- Blocked by `02-aave-positions-adapter.md` (slice #2)

## User stories addressed

- User story 6
