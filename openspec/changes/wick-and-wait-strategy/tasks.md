# Tasks — wick-and-wait-strategy

TDD per slice (RED → GREEN → REFACTOR). Contracts first (the only real gap), then catalog, then
recipes. Everything else reuses existing actions.

## 1. Pool TWAP interface + TWAP math helper

- [x] 1.1 Extend `IPancakeV3Pool` with `observe(uint32[] secondsAgos) → (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)`.
- [x] 1.2 Add a small internal TWAP helper (lib or in-condition): mean tick over `W` =
      `(tickCumulatives[1] − tickCumulatives[0]) / W`, rounded toward −∞ for negative results
      (mirror Uniswap `OracleLibrary.consult`). Unit-test the rounding/sign edge cases.

## 2. WickWaitRebalanceCondition (contract, TDD fork tests)

- [x] 2.1 RED: fork test scaffold against a live BSC PCS-V3 pool with sufficient observation
      cardinality — fixtures for in-range, persistent-out-of-range, brief-wick, and cooldown.
- [x] 2.2 GREEN: `check()` reads `tokenId` from a context slot → `positions(tokenId)` for
      `tickLower/tickUpper` + `token0/token1/fee`; derives the pool via the V3 factory (D3);
      computes the TWAP tick over `W`; `met = TWAP outside [tickLower, tickUpper)`.
- [x] 2.3 GREEN: fold in the cooldown — `met = breach AND (now − lastRebalance ≥ cooldown)`;
      unset/zero last-rebalance slot ⇒ not blocked (first run fires).
- [x] 2.4 GREEN: `afterExecution()` returns the slot diff setting `lastRebalance = block.timestamp`.
- [x] 2.5 GREEN: insufficient cardinality ⇒ `observe` reverts and the revert propagates (no
      false-negative "in range"); test it.
- [x] 2.6 Wick-robustness fork test: a brief spike out and back within `W` keeps the TWAP in range ⇒ no fire.
- [x] 2.7 REFACTOR: params struct (`tokenIdSlot`, `twapWindow W`, `cooldown`, `lastRebalanceSlot`),
      custom errors, NatSpec; no state variables (delegatecall/staticcall-safe).

## 3. Deploy + catalog entry

- [x] 3.1 Add `WickWaitRebalanceCondition` to the fork deploy script; write its address to
      `deployments/fork-latest.json` + `loadContractAddresses()`.
- [x] 3.2 Seed catalog entry under `prisma/seed/catalog/` (new `conditions`/extend `core`): `name`,
      `category: CONDITION`, `selector`, `abiFragment`, `paramSchema` with `x-ui` widgets/roles
      (token-id context-slot field, duration widget for `W`, duration for cooldown, etc.).
- [x] 3.3 Confirm `checkCatalogIntegrity` passes for the new entry (ABI↔schema lockstep, role
      resolution, no stale phrases); reseed (`pnpm db:seed`) and verify it serves.

## 4. Sizing (REVISED — on-chain at execution; off-chain helper = preview only)

- [x] 4.1 `lp-math.depositSwapFraction` — kept as the **frontend preview** ("expected split"), NOT the
      execution sizer. Unit-tested.
- [x] 4.2 ~~Off-chain sizing in the recipe builder~~ — superseded by on-chain sizing (Task 4b): a
      build-time amount is stale at a keeper-chosen firing time.

## 4b. On-chain SwapToRangeRatio action (TDD)

- [x] 4b.1 `PancakeSwapV3SwapToRangeRatioAction.sol` (delegatecall, `IAction`): params
      (tokenA/tokenB/fee, tickDelta, optional minOut=0 forward-compat). At execution: read `slot0().tick`,
      compute range (`tick ± tickDelta`, rounded to spacing — same as Mint rangeMode 1), compute target
      value ratio `r0 = A/(A+B)` (`A = sp·(sb−sp)/sb`, `B = sp−sa`; overflow-safe staged math), compare to
      the vault's current `token0`/`token1` balances, and swap the over-represented token via the router.
- [x] 4b.2 Unit tests (mock router/pool): single-token-in (entry) → ~target ratio; two-token-in
      (rebalance) → balanced; price below/above range → all-one-token (no/!full swap); no-op when already
      balanced. Dust-tolerant assertions.
- [x] 4b.3 Fork test against a live BSC pool: entry from the deposit token then `Mint(full balance)`
      lands a position. Validated via `scripts/wick-wait-price-driver.ts`. Note: minimal dust requires
      the **same** `tickDelta` in `SwapToRangeRatio` and the following `Mint` — a frontend `tick-range`
      default-commit bug (Mint shipping `tickDelta 0` while the displayed ±% was never written) was found
      here and fixed; with matching widths the leftover is dust.
- [x] 4b.4 Deploy wiring (`deploy-defi-actions.ts`) + `loadContractAddresses` + catalog entry
      (`paramSchema`/`abiFragment`/roles; integrity guard green).

## 5. Three curated recipes + presets

- [x] 5.1 **Entry** recipe shape: `SwapToRangeRatio` → `Mint(rangeMode 1, full balance)`; `tokenId` → slot.
- [x] 5.2 **Rebalance** recipe shape: `WickWaitRebalanceCondition` → `Collect` → `Decrease(100%)` →
      `SwapToRangeRatio` → `Mint(rangeMode 1, full balance)`; new `tokenId` overwrites the slot.
      (Collect before Decrease: `Decrease` already bundles `collect(max,max)`, so the leading `Collect`
      harvests fees first, then `Decrease` withdraws the principal.)
- [x] 5.3 **Auto-Compound** recipe shape: `IntervalCondition(interval)` → `Collect` → `Fee Deposit` →
      `Increase`. The `Fee Deposit` step refills the gas-comp reserve to `minFeeDeposit` so the public
      automations stay executable without a separate maintenance automation.
- [x] 5.4 Curated presets: `W` (1h/30m/10m), `tickDelta` (Narrow/Medium/Wide), cooldown (7d/3d/1d) —
      all overridable; nothing hard-coded in recipe logic.
- [x] 5.5 Seed-validate the three recipes (`validateRecipeShape` against the deployed catalog).

## 6. Definition of Done

- [x] 6.1 `hardhat test` green (condition fork tests incl. in/out/wick/cooldown/cardinality-revert).
- [x] 6.2 `pnpm backend:test` green (catalog integrity + recipe seed validation); reseed identical
      except the intended new entries.
- [x] 6.3 `openspec validate wick-and-wait-strategy --strict` passes.
- [x] 6.4 Manual fork run: validated end-to-end via `scripts/wick-wait-price-driver.ts` — a persistent
      out-of-range move flips the TWAP-breach trigger to fire, a brief wick (snap back within `W`) does
      NOT; the three automations were instantiated on a vault and exercised. This run surfaced (and we
      fixed) the Mint `tickDelta` wiring bug and the gas-reserve top-up gap; re-deploy the automations
      after the frontend fix for a clean two-sided position.
- [x] 6.5 Code-review without open hard blockers — APPROVE; recommended fixes applied
      (see `code-review-feat-wick-and-wait-2026-06-12.md`).
