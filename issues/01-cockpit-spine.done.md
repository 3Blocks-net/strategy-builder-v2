# Cockpit spine — ValuationService + ProtocolAdapter interface + idle & gas-reserve valuation

## Parent PRD

vault-cockpit-prd.md

## What to build

The first tracer bullet for the whole Epic. It stands up the **single source of truth**
every later slice plugs into, and delivers a thin but complete vertical path: the owner
opens the vault detail page and sees a unified, USD-valued positions panel — for now just
**idle (unallocated) ERC-20 balances + the gas-comp reserve** — under one **net-equity
total**, with a freshness indicator and a refresh control.

Shared infrastructure established here (reused by every later slice):

- **`ValuationService`** (deep, central): `valueVault(address) → ValuedVault
  { positions, totalValueUsd, asOfBlock, asOf }`. Composes idle ERC-20s (minus any
  adapter-claimed token) + every registered adapter's positions + the gas reserve into the
  net-equity total. See PRD _Modules → ValuationService_ and _Valuation & composition rules_.
- **`ProtocolAdapter` interface** (the Story-4 seam): `getPositions(vault) →
  ValuedPosition[]`, `claimedTokens(vault) → address[]`, optional `logSubscriptions()`.
  The `ValuedPosition` shape (`protocol`, `kind`, `label`, token legs with amount+USD,
  optional `metrics`, optional `debtUsd`, `earningsUsd`) is defined here. An adapter
  **registry** that `ValuationService` iterates. See PRD _Modules → ProtocolAdapter_.
- **Idle valuation**: reuse the existing portfolio/Alchemy/`PriceService` path, but route it
  through `ValuationService` and **subtract adapter-claimed tokens** before summing (no
  claimed tokens yet → trivially a no-op, but the wiring is in place for #2/#3).
- **Gas-reserve position**: reuse `FeeService.getVaultGasDeposit()` / `vaultDeposit(vault,
  token)` to surface the FeeRegistry pre-funding as a `ValuedPosition` counted in the total.
- **API**: `GET /vaults/:address/positions?refresh=0|1` under `VaultOwnerGuard`. At this
  stage both values recompute live (snapshots arrive in #4); `refresh` just bypasses the
  short-TTL cache. See PRD _API contracts_.
- **Frontend** (`features/vault-cockpit/`): `PositionsPanel` (protocol-grouped, idle + gas
  reserve), net-equity total header, a basic `FreshnessIndicator` ("live / just now") and a
  `Refresh` control, clean **empty state** (fresh/empty vault — no `$0`/`∞`/`NaN`), and
  **per-position error isolation** (a broken read renders an error row, never crashes the
  panel). See PRD _Frontend_.

## Acceptance criteria

- [ ] `ValuationService.valueVault` returns idle ERC-20 positions + the gas reserve, each
      USD-valued, summed into a net-equity total; unit-tested with mocked adapters/price.
- [ ] The adapter registry is iterated generically; an empty/trivial adapter set yields just
      idle + gas reserve (no hardcoded protocol logic in the service).
- [ ] Adapter-claimed tokens are excluded from the idle list before summing (verified with a
      stub adapter that claims a token the idle list contains → it disappears from idle).
- [ ] A single missing price degrades only that one position (null USD), never the total/page.
- [ ] `GET /vaults/:address/positions` returns positions + net-equity total + freshness;
      `refresh=1` bypasses the cache; guarded by `VaultOwnerGuard`.
- [ ] `PositionsPanel` renders idle + gas-reserve positions and the total; an empty vault
      shows the empty state; a forced read error renders an isolated error row.
- [ ] Freshness indicator + refresh control are present and functional.

## Blocked by

None — can start immediately.

## User stories addressed

- User story 11
- User story 12
- User story 13
- User story 14
- User story 15
- User story 29
