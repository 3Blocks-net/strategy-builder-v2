# PRD: Vault-Cockpit — DeFi Positions, Value History & Performance

> Source epic: `vault-cockpit-epic.md` · Research: `research.md` §17 (and §11 for DeFiLlama, §6 for protocol addresses).
> Read-only cockpit on the existing Vault Detail page for the logged-in owner.
> Design decisions below were stress-tested in a grilling pass against the actual code; the
> "Resolved design decisions" section records the non-obvious calls and *why*.

## Problem Statement

I'm a vault owner. I've created a vault and deployed automations that run real DeFi
on Aave V3 and PancakeSwap V3 — supplying, borrowing, swapping, providing liquidity.
But when I open my vault I only see raw idle token balances and a list of past
executions. I cannot answer the three questions that actually matter to me:

- **What do I hold right now?** What's supplied/borrowed on Aave (and am I close to
  liquidation?), what LP positions do I have (in range? how much in unclaimed fees?),
  and what is each worth in USD.
- **How has my vault's value moved over time?** A USD value curve over the last day,
  week, month, and since I created the vault.
- **Am I actually making money?** My profit/loss versus the capital I put in —
  in dollars and as a percentage, with my costs (fees + gas) made visible.

Today I have to leave the app and stitch this together from BscScan, Aave's UI, and
PancakeSwap's UI. It's tedious, error-prone, and it erodes my trust in the platform —
especially because this is my money.

## Solution

A read-only **cockpit** added to the existing Vault Detail page, visible only to the
authenticated owner, with three coordinated views — all driven by **one shared
valuation** of the vault so every number agrees:

1. **Positions** — a unified, protocol-grouped breakdown:
   - **Idle / unallocated** ERC-20 balances — *excluding* any token a protocol adapter
     claims (aTokens, debt tokens, LP NFTs), so nothing is double-counted.
   - **Aave V3**: per-reserve supplied/borrowed amounts + USD, supply/borrow APY, aggregate
     **health factor** (∞ when no debt), liquidation-risk indication, and **exact accrued
     earnings** per reserve.
   - **PancakeSwap V3**: per-LP-position token0/token1 amounts, price range with
     **in-range/out-of-range**, **live uncollected fees**, USD value, pool/fee-tier context.
   - **Gas reserve**: the vault's `FeeRegistry` gas-comp pre-funding, counted as a position.

2. **Value history** — a USD value-over-time chart for the whole vault, ranges
   **24h / 7d / 30d / since creation**, deposit/withdraw markers, backed by periodic
   server-side snapshots.

3. **Performance / PnL** — absolute (USD) and percentage profit/loss versus **net deposited
   capital**, with **costs (fees + gas) broken out as their own line**; both PnL and the
   costs line honor the selected time range.

The valuation is **net equity** — Aave debt is subtracted — so a leveraged position shows
its true net worth. New protocols plug in through a single **protocol-adapter** interface,
so they appear in all three views without re-designing them.

## User Stories

### Positions (Story 1)

1. As a vault owner, I want to see all my Aave V3 supplied reserves with token amount and
   USD value, so that I know what collateral I have deployed.
2. As a vault owner, I want to see all my Aave V3 borrowed reserves with amount and USD
   value, so that I know what I owe.
3. As a vault owner, I want my vault's aggregate Aave health factor, so that I can judge
   how close I am to liquidation.
4. As a vault owner, I want a health factor of "∞"/"no liquidation risk" when I have no
   borrowings, so that I'm not confused by a `uint256.max` number.
5. As a vault owner, I want the current supply and borrow APY for each Aave reserve I'm in,
   so that I understand the rate I'm earning or paying.
6. As a vault owner, I want my **exact** accrued Aave earnings per supplied reserve, so that
   I can tell how much interest I've actually earned.
7. As a vault owner, I want each PancakeSwap V3 LP position's two token amounts and combined
   USD value, so that I know what's in the position.
8. As a vault owner, I want each LP position's price range and in-range/out-of-range status,
   so that I know if it's earning fees.
9. As a vault owner, I want each LP position's uncollected fees from the **live** on-chain
   value (not stale `tokensOwed`), so that I see what I could actually collect.
10. As a vault owner, I want the pool's fee-tier/APY context per LP position, so that I
    understand its earning potential.
11. As a vault owner, I want my idle (unallocated) ERC-20 balances shown alongside DeFi
    positions under one total with **no double-counting of aTokens/debt tokens**, so that
    the total is trustworthy.
12. As a vault owner, I want my gas-comp reserve shown as part of my vault's worth, so that
    topping it up doesn't look like losing money.
13. As a vault owner, I want each position priced via a reliable source with fallback, so
    that one missing price doesn't blank the whole cockpit.
14. As a vault owner, I want a broken single position isolated (error row), not a crashed
    view, so that I still see the rest of my vault.
15. As a vault owner with a brand-new empty vault, I want a clean empty state instead of
    `$0`/`∞`/`NaN`, so that I'm not alarmed by garbage numbers.

### Value history (Story 2)

16. As a vault owner, I want a chart of my vault's total USD value over time, so that I can
    see how my capital has developed.
17. As a vault owner, I want to switch the chart between 24h, 7d, 30d, and "since creation",
    so that I can look at the timeframe I care about.
18. As a vault owner, I want deposit/withdrawal markers on the chart, so that I can tell my
    own money movements apart from strategy performance.
19. As a vault owner, I want the chart to reflect deployed DeFi capital (Aave + LP + gas
    reserve), not just idle tokens, so that the curve is my real worth.
20. As a vault owner, I want the chart to load fast from pre-computed snapshots, so that the
    page stays responsive.
21. As a vault owner with a vault that predates the cockpit, I want "since creation" to be
    clearly labeled as history from the first snapshot date, so that an early flat segment
    is explained, not perceived as broken.

### Performance / PnL (Story 3)

22. As a vault owner, I want my PnL in USD versus net deposited capital, so that I know if
    I'm up or down absolutely.
23. As a vault owner, I want PnL as a percentage of net deposits, so that I can judge
    performance independent of size.
24. As a vault owner, I want my costs (deposit/withdraw fees + gas compensation paid) shown
    as a distinct line, so that I can see performance and costs separately.
25. As a vault owner, I want PnL and the costs line for the selected timeframe (24h/7d/30d/
    all) to be **flow-adjusted** — excluding deposits/withdrawals I made within the window —
    so that the number reflects strategy performance, not my cash movements.
26. As a vault owner with zero net deposits, I want PnL% to degrade gracefully (e.g. "—")
    rather than divide-by-zero, so that the number is never nonsensical.

### Reliability / freshness (cross-cutting)

27. As a vault owner, I want a visible "updated N seconds/minutes ago" freshness indicator,
    so that I can tell whether I'm looking at current data.
28. As a vault owner, I want a "refresh" action that recomputes my positions live on demand,
    so that I can force-fetch the current state when I need it.
29. As a vault owner, I want clear error/stale states when a price source or RPC read fails,
    so that I'm never silently shown frozen or wrong numbers.

### Protocol extensibility (Story 4 — adapter only)

30. As a developer adding a new protocol, I want to implement one protocol-adapter interface
    (positions + claimed tokens + optional log subscriptions) and have that protocol appear
    in positions, value-history snapshots, and PnL automatically, so that I don't touch the
    three views, the chart/PnL pipeline, or the indexer's core.
31. As a developer, I want a conformance test suite every adapter must pass, so that I'm
    guided into the protocol-agnostic shape the cockpit expects.
32. As a maintainer, I want Aave V3 and PancakeSwap V3 to be two implementations of that same
    interface, so that the extension path is proven, not theoretical.

## Implementation Decisions

### Scope

- **All four stories in scope.** Story 4 ships as the **adapter interface + two concrete
  adapters (Aave V3, PancakeSwap V3)** — no speculative 3rd-protocol scaffolding.
- **Earnings at exact-accrual depth** (Aave: `scaledBalance × liquidityIndex / RAY` minus
  per-reserve net principal). May still be split in delivery (positions+metrics, then
  earnings) without changing this PRD.

### Read path: RPC-first (no subgraph)

- Current-state reads go through the **existing `INDEXER_PROVIDER`** (ethers v6). No new
  external dependency, no subgraph, no GRT billing (research §17.0). History comes from our
  **own snapshots**, not archive reads.

### Modules (deep modules, narrow interfaces)

- **`ValuationService` (deep, central — single source of truth).** Turns a vault address
  into a fully-valued result: idle ERC-20s (minus adapter-claimed tokens) + each adapter's
  positions + the gas reserve, each priced in USD, composed into a **net-equity total**.
  Both the snapshot cron and the on-demand live path call this one service, so the header,
  chart, and PnL can never disagree. Conceptual: `valueVault(address) → ValuedVault
  { positions: ValuedPosition[], totalValueUsd, asOfBlock, asOf }`.
- **`ProtocolAdapter` (the Story-4 seam).** A narrow interface every protocol implements:
  - `getPositions(vault) → ValuedPosition[]` — protocol-agnostic positions: `protocol`,
    `kind`, `label`, token legs (amount + USD), optional `metrics` bag (health factor / LP
    range / in-range / APY), optional `debtUsd` (borrowed legs subtract from equity),
    `earningsUsd`.
  - `claimedTokens(vault) → address[]` — token addresses the adapter "owns" (aTokens,
    variableDebtTokens, LP NFT manager). `ValuationService` subtracts these from the idle
    list **before** summing → fixes the aToken double-count (Finding 1).
  - `logSubscriptions() → { address, topics, vaultTopicIndex }[]` (optional) — events the
    adapter needs indexed for exact earnings. The indexer iterates these generically; a new
    protocol with earnings = add an adapter incl. its subscription, **no indexer surgery**.
  - **`AaveV3Adapter`** — positions via `UiPoolDataProviderV3` (`getReservesData` +
    `getUserReservesData`) + `Pool.getUserAccountData` for aggregate HF/collateral/debt.
    Pool + oracle resolved at runtime from `PoolAddressesProvider`. Supplied =
    `aToken.balanceOf`, debt = `variableDebtToken.balanceOf`. APY from RAY rates (per-second
    compounding). Earnings exact via `scaledBalance × liquidityIndex / RAY` − net principal
    (from `ProtocolFlow`). `claimedTokens` = the vault's aToken + variableDebtToken addrs.
    `logSubscriptions` = Aave Pool `Supply`(`onBehalfOf` indexed) + `Withdraw`(`user`
    indexed). ⚠️ Verify `UiPoolDataProviderV3` address on-chain before use; fall back to
    direct Pool/token reads if drifted.
  - **`PancakeV3Adapter`** — enumerates LP NFTs (NPM `ERC721Enumerable`), reads
    `positions(tokenId)`, derives amounts from `liquidity` + `pool.slot0()` via `LpMath`,
    and gets **uncollected fees via a `collect` static-call** (`from: vault`,
    `amount*Max = uint128.max`) — never `tokensOwed`. In-range = `tickLower ≤ tick <
    tickUpper`. `claimedTokens` = the NPM (NFT) address. No earnings flows in MVP (uncollected
    fees stand in as the LP earnings signal).
- **`GasReserveAdapter` (thin) / reuse `FeeService`.** `FeeService.getVaultGasDeposit()` +
  `vaultDeposit(vault, token)` already exist → the gas reserve is read via existing code and
  surfaced as a position. Counting it makes top-ups value-neutral (Finding 4).
- **`LpMath` (deep, pure).** Hand-rolled BigInt `LiquidityAmounts`/`TickMath` (Q96/Q128,
  never `number`) so the **backend** snapshot cron can value LP. No `@uniswap/v3-sdk`/JSBI in
  the backend. Same hard-fixture discipline as `ActionLib`.
- **`AaveMath` (pure).** RAY→APY, 8-dec USD base → 18-dec (`×1e10`), `uint256.max → ∞` HF.
- **`SnapshotService` + snapshot loop.** Self-rescheduling `setTimeout` loop (same pattern
  as `IndexerService`, in-flight-guarded, resilient `onModuleInit`, **dormant when the
  provider is null**). **Hourly**, iterates **all known vaults** (`prisma.vault.findMany` —
  same set the indexer uses), calls `ValuationService.valueVault`, persists one
  `VaultValueSnapshot` each. **Bounded concurrency** (p-limit N) and its **own provider
  instance / RPC key** so it can't starve the live indexer's freshness; N, interval, and
  retention (**90 days**, pruned by the loop) are config-driven (`SNAPSHOT_INTERVAL_MS`,
  `SNAPSHOT_CONCURRENCY`, `SNAPSHOT_RETENTION_DAYS`, `SNAPSHOT_RPC_URL` → falls back to the
  shared `INDEXER_PROVIDER` if unset).
- **Indexer extension (adapter-driven).** The PEC-219 indexer additionally subscribes to
  each adapter's `logSubscriptions()`. The existing address-less, vault-gated `getLogs`
  stays for vault-boundary events; adapter subscriptions add address-filtered topic queries
  whose hits are gated on the declared `vaultTopicIndex ∈ knownVaults`. **One block cursor**
  advances all feeds together (single durable resume). Adapter flows are frozen in USD at
  write time (same `PriceService` path as deposits) and written to **`ProtocolFlow`**.
- **`PerformanceService` (PnL + costs).**
  - `netDeposits = Σ depositUsd − Σ withdrawUsd` from **`VaultEvent` only** (boundary,
    write-time-frozen gross USD). `ProtocolFlow` is **never** read here (Finding 2/trap).
  - All-time: `pnlAbs = currentValueUsd − netDeposits`; `pnlPct = pnlAbs / netDeposits`
    (guard `netDeposits ≤ 0` → "—").
  - **Range (flow-adjusted):** `rangePnL = (currentValue − valueAtRangeStart) − (netDeposits
    within range)`, with `valueAtRangeStart` = the snapshot at/just before the range start.
  - **Costs line:** `fees (deposit/withdraw, USD = amountUsd × feeBps/10_000) + gas
    (Execution.gasCompUsd, already frozen)`, **range-scoped** to match PnL.
- **`PriceService` (extend).** Keep the current Alchemy→DeFiLlama fallback for live pricing;
  add the historical/backfill endpoint (research §11) only for valuing legacy events lacking
  frozen USD. A missing single price degrades one position, never the page.
- **Frontend (`features/vault-cockpit/`).** New sections on `VaultDetailPage`:
  `PositionsPanel` (protocol-grouped, idle + gas-reserve folded in), `ValueHistoryChart`
  (range toggle + deposit/withdraw markers), `PerformanceCard` (PnL abs/% + costs line,
  range-aware), `FreshnessIndicator` + a `Refresh` control. Lazy/separate load paths for
  positions, chart, PnL.

### Read-model & freshness behavior

- **Positions endpoint serves the latest snapshot's full breakdown** (fast, cheap). The
  snapshot is therefore the canonical positions read model and persists full per-position
  detail (HF, LP range, in/out-of-range, uncollected fees, APY, earnings) — not just a total.
- **Refresh = live ephemeral recompute** via `ValuationService` (short-TTL cached). It does
  **not** write a snapshot, so the chart stays on its clean hourly cadence.
- **Cold start (no snapshot yet):** first page load lazily computes a live (ephemeral)
  valuation — same path as refresh — and shows it; the hourly cron persists the first real
  row within the hour.
- **Freshness indicator** shows the age of the data being displayed: snapshot `asOf` for the
  default view, "live / just now" after a refresh.

### Data model

- **New `VaultValueSnapshot`:** `vaultId`, `blockNumber`, `asOf`, `totalValueUsd` (decimal
  string), `breakdown` (Json — full valued per-position detail). Index `(vaultId, asOf)`.
- **New `ProtocolFlow`:** adapter-indexed protocol flows — `vaultId`, `protocol`, `reserve/
  token`, `kind` (e.g. AAVE_SUPPLY/AAVE_WITHDRAW), `amount`, `amountUsd` (frozen), `txHash`,
  `blockNumber`, `logIndex`, `blockTimestamp`; `@@unique([txHash, logIndex])` for idempotency.
  **Wholly separate from `VaultEvent`** so PnL's `netDeposits` (boundary-only) can never be
  contaminated by protocol flows.
- **No change** to `VaultEvent` (PnL reuses its frozen `amountUsd` + `feeBps`).
- All addresses checksummed; all USD/token amounts as decimal strings (project convention).

### API contracts (REST, all under `VaultOwnerGuard`)

- `GET /vaults/:address/positions?refresh=0|1` → valued positions + net-equity total +
  freshness. `refresh=0` (default) serves the latest snapshot; `refresh=1` recomputes live
  (ephemeral, short-TTL cached).
- `GET /vaults/:address/value-history?range=24h|7d|30d|all` → snapshot series (downsampled
  per range) + deposit/withdraw markers + `historyStartsAt` (for the "since first snapshot"
  label).
- `GET /vaults/:address/performance?range=24h|7d|30d|all` → `{ currentValueUsd,
  netDepositsUsd, pnlAbsUsd, pnlPct, costsUsd }`, flow-adjusted for the range.

## Testing Decisions

A good test asserts **observable behavior at the module boundary** — given on-chain
reads/fixtures in, assert valued output / composed total / PnL / rendered state — never
private helpers or call counts. Prior art noted per item.

- **`ValuationService` + `LpMath` + `AaveMath` (highest priority):** hard-fixture unit tests
  in the style of **`test/ActionLibHF.ts`** — known liquidity/tick/sqrtPrice + RAY inputs →
  exact token amounts, APY, HF, net-equity total. Explicit cases: HF = ∞ (no debt); debt
  subtracted; **adapter-claimed tokens excluded from idle** (the double-count fix); gas
  reserve included; one missing price degrades a single leg only.
- **Position read adapters (Aave/PCS):** **integration against the BSC fork** (post
  `deploy-fork.ts`) — create positions via the existing PEC-218 actions (Supply/Borrow,
  LP-Mint), then assert the adapter reads them back. Assert the **`collect` static-call**:
  reverts without `from: vault`, returns **accrued** fees (not `tokensOwed`) with it. Unit:
  existing mocks (`MockAaveV3`, `MockNonfungiblePositionManager.accrue`); note
  `UiPoolDataProviderV3` is not yet mocked → fork test or a thin mock.
- **`ProtocolAdapter` conformance suite:** shared test both Aave + PCS adapters must pass —
  asserts the `ValuedPosition` contract, `claimedTokens` non-empty, debt sign convention,
  and `logSubscriptions` shape. **This is the Story-4 guard rail** for a future protocol.
- **Indexer adapter-subscription path:** Aave `Supply`/`Withdraw` for `onBehalfOf/user ∈
  knownVaults` produce frozen-USD `ProtocolFlow` rows; foreign vaults ignored; idempotent on
  re-scan. Prior art: PEC-219 indexer/event-mapper specs.
- **`SnapshotService`:** snapshot write/full-breakdown persistence, retention pruning,
  range downsampling, bounded concurrency, dormant-when-no-provider. Mocked Prisma +
  `ValuationService`. Prior art: indexer integration spec.
- **`PerformanceService` (the correctness trap):** PnL reads **only** `VaultEvent`; an Aave
  supply (a `ProtocolFlow` row) must **not** move `netDeposits`. Flow-adjusted range PnL,
  range-scoped costs line, empty-vault and `netDeposits ≤ 0` edges.
- **`PriceService` historical:** mock `fetch` (as in `price.service.spec.ts`); historical/
  chart shapes, low-confidence, missing-coin.
- **Frontend:** empty / young-vault / "since first snapshot" / error / freshness / refresh
  states (stories 14/15/21/26/27/28/29).

## Out of Scope

- **No write actions** — read-only; no closing/adjusting positions from the cockpit.
- **No multi-vault aggregation** — strictly per single vault.
- **No tax/accounting/CSV export.**
- **No public/shared view** — owner-only, behind auth.
- **No subgraph / The Graph** — RPC-first + own snapshots only.
- **No speculative 3rd-protocol adapter** — only Aave V3 + PancakeSwap V3 ship.
- **No archive-node historical reconstruction** — history begins at first snapshot;
  "since creation" for pre-existing vaults = since first snapshot (labeled), no backfill.
- **No LP realized-fee history** beyond live uncollected fees (MVP earnings boundary).
- **No on-chain gating on health factor** — HF is display-only here.

## Resolved design decisions (from the grilling pass)

1. **Idle double-count (Finding 1):** adapters declare `claimedTokens`; `ValuationService`
   subtracts them from the Alchemy idle list. *Why:* aTokens/debt tokens are ERC-20s that
   Alchemy returns, so without this the supplied amount is counted twice (invisible on the
   fork, which only scans the curated allowlist).
2. **Exact earnings data (Finding 2):** indexer captures Aave `Supply`/`Withdraw` per reserve
   into a separate **`ProtocolFlow`** store. *Why:* exact accrual needs per-reserve net
   principal, which no existing table holds.
3. **PnL basis (Finding 3):** `currentValue − netDeposits` with **costs (fees + gas) broken
   out** as a separate, range-scoped line. *Why:* honest performance picture; fees/gas are
   real costs and the owner should see them distinctly, not buried in PnL.
4. **Gas reserve in value (Finding 4):** counted as a position via existing `FeeService`.
   *Why:* otherwise funding the reserve looks like a value drop and the chart dips on every
   top-up.
5. **Story-4 vs indexer:** adapters declare `logSubscriptions`; the indexer iterates them
   generically. *Why:* keeps "add one adapter → appears everywhere (incl. exact earnings)"
   true, without protocol-specific surgery in the indexer core.
6. **Snapshot budget:** bounded concurrency + own provider/RPC key, config-driven.
   *Why:* hourly × all vaults × many reads each must not starve the live indexer; addresses
   the epic's explicit scalability risk.
7. **Positions read model:** serve the latest snapshot's full breakdown; refresh = live
   **ephemeral** recompute (not persisted). *Why:* fast cheap default page; refresh keeps the
   chart on a clean cadence rather than injecting irregular points.
8. **Range PnL:** flow-adjusted `(current − rangeStart) − netDeposits-in-range`. *Why:* a
   deposit/withdraw inside the window must not masquerade as profit/loss.
9. **Flow storage:** separate `ProtocolFlow` table; PnL reads `VaultEvent` only. *Why:*
   structural guarantee that protocol flows can't corrupt boundary-based netDeposits.
10. **Old vaults' "since creation":** since first snapshot, labeled. *Why:* no archive
    reads; honest about when history starts.

## Further Notes

- **Single-valuation invariant** is the backbone: live header, every snapshot, and PnL's
  "current value" all call `ValuationService.valueVault`. Any future panel must reuse it.
- **PnL/earnings firewall:** `VaultEvent` = boundary (drives netDeposits); `ProtocolFlow` =
  protocol (drives earnings). They must never be unioned for PnL.
- **Fork clock lag** (CLAUDE.md): an idle BSC fork doesn't advance `block.timestamp`; for
  local UI/integration use a short `SNAPSHOT_INTERVAL_MS` + create positions via actions +
  mine blocks. Snapshot/indexer freshness will look stale on an idle fork (same family as
  the PEC-219 confirmation lag).
- **Address verification:** `UiPoolDataProviderV3` (`0xc0179321f0825c3e0F59Fe7Ca4E40557b97797a3`)
  and PCS NPM/Factory must be confirmed on-chain before relying on them (research §17.4 #8);
  Aave Pool/oracle are runtime-resolved from `PoolAddressesProvider` and self-heal across
  governance re-points.
- **Earnings depth caveat:** "exact accrual" (Aave) over the lightweight research-MVP option;
  PCS uses live uncollected fees, with full LP fee-history accrual deferred. Story 1 may be
  split into "positions + metrics" then "earnings" without a PRD change.
- **Research expiry:** delete `research.md` §17 once this epic ships — addresses and
  DeFiLlama/Aave/PCS API shapes drift.
