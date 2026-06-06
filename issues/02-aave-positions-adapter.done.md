# Aave V3 positions adapter

## Parent PRD

vault-cockpit-prd.md

## What to build

The first real protocol adapter. After this slice the positions panel shows the vault's
**Aave V3** state: per-reserve supplied and borrowed amounts with USD value, supply/borrow
APY, and the aggregate **health factor** — with debt subtracted from net equity, and aTokens/
debt tokens no longer double-counted in the idle list.

- **`AaveV3Adapter`** (implements `ProtocolAdapter` from #1):
  - `getPositions`: reads via `UiPoolDataProviderV3` (`getReservesData` +
    `getUserReservesData`) and `Pool.getUserAccountData` for the aggregate HF / collateral /
    debt. Pool + oracle resolved at runtime from `PoolAddressesProvider` (never hardcoded).
    Supplied = `aToken.balanceOf`, debt = `variableDebtToken.balanceOf`. Borrowed legs carry
    `debtUsd` so `ValuationService` subtracts them from equity. Metrics bag carries health
    factor (∞ when no debt), supply/borrow APY. **No earnings yet** (deferred to #8).
  - `claimedTokens`: the vault's aToken + variableDebtToken addresses → excluded from idle
    (this is where the double-count fix becomes real). See PRD _Resolved decision 1_.
- **`AaveMath`** (pure): RAY→APY (per-second compounding), 8-dec USD base → 18-dec
  normalization (`×1e10`), `healthFactor == uint256.max → ∞`. Hard-fixture unit tests in the
  style of `test/ActionLibHF.ts`.
- The fork integration test (positions created via the existing PEC-218 Supply/Borrow
  actions) **doubles as the on-chain verification** of the `UiPoolDataProviderV3` address;
  if it has drifted, fall back to direct Pool/token reads. See PRD _Further Notes → Address
  verification_.

See PRD _Modules → AaveV3Adapter_ and _Valuation & composition rules_.

## Acceptance criteria

- [ ] `AaveMath` has isolated hard-fixture unit tests: RAY→APY, 8→18-dec normalization, and
      HF `uint256.max → ∞` (catches a 10ⁿ scaling error without a fork).
- [ ] Fork integration test: a whale-funded vault that has supplied/borrowed across ≥2 BSC
      reserves yields correct per-reserve supplied/borrowed amounts, USD, APY, and aggregate
      health factor read back through the adapter.
- [ ] No-debt case renders HF as ∞ / "no liquidation risk", not a giant number.
- [ ] Borrowed legs subtract from the net-equity total (a leveraged position shows true net
      worth).
- [ ] `claimedTokens` returns the vault's aToken/debt-token addresses; an aToken that would
      otherwise appear in the idle list is excluded (no double-count) — asserted in a test.
- [ ] Aave positions appear in `PositionsPanel`, grouped under Aave V3 with their metrics.
- [ ] Pool + oracle are resolved at runtime from `PoolAddressesProvider` (not hardcoded).

## Blocked by

- Blocked by `01-cockpit-spine.md` (slice #1)

## User stories addressed

- User story 1
- User story 2
- User story 3
- User story 4
- User story 5
- User story 11
