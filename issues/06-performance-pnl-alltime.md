# Performance card — all-time PnL + costs line

## Parent PRD

vault-cockpit-prd.md

## What to build

The first performance view: the owner sees whether they're up or down versus the capital
they put in, with their costs (fees + gas) shown as a distinct line. All-time only here;
range scoping is #7.

- **`PerformanceService`**:
  - `netDeposits = Σ depositUsd − Σ withdrawUsd` from **`VaultEvent` only** (boundary,
    write-time-frozen gross USD). `ProtocolFlow` is never read here. See PRD _Resolved
    decision 3 & 9_ (the PnL/earnings firewall).
  - `pnlAbs = currentValueUsd − netDeposits`; `pnlPct = pnlAbs / netDeposits` with a guard
    for `netDeposits ≤ 0` → render "—".
  - **Costs line** = fees (`amountUsd × feeBps / 10_000` from `VaultEvent`) + gas
    (`Execution.gasCompUsd`, already frozen). Lifetime here; ranged in #7.
  - `PriceService` historical/backfill only to value any legacy events lacking frozen USD.
- **API**: `GET /vaults/:address/performance` → `{ currentValueUsd, netDepositsUsd,
  pnlAbsUsd, pnlPct, costsUsd }`.
- **Frontend**: `PerformanceCard` showing PnL (USD + %) and the costs line.

See PRD _Modules → PerformanceService_, _API contracts_.

## Acceptance criteria

- [ ] `PerformanceService` computes all-time PnL from `currentValue` and `VaultEvent`-only
      net deposits; `netDeposits ≤ 0` renders "—" rather than dividing by zero.
- [ ] **Firewall test**: with a (mocked) `ProtocolFlow` row present, `netDeposits` is
      unchanged — protocol flows never reach PnL.
- [ ] Costs line = deposit/withdraw fees (USD) + gas comp paid (USD), unit-tested against
      frozen `VaultEvent.feeBps`/`amountUsd` + `Execution.gasCompUsd`.
- [ ] `GET /performance` returns the documented shape; `PerformanceCard` renders PnL + costs.
- [ ] Empty/fresh-vault case is handled (no NaN/∞).

## Blocked by

- Blocked by `01-cockpit-spine.md` (slice #1)

## User stories addressed

- User story 22
- User story 23
- User story 24
- User story 26
