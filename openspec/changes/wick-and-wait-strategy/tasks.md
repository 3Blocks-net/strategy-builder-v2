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

## 4. Off-chain single-sided sizing

- [ ] 4.1 Add/extend a shared `lp-math` helper that, given pool price + chosen range, returns the
      fraction of the deposit token to swap into the other token for a balanced fill. Unit-test it
      against known range/price cases.
- [ ] 4.2 Expose the computed fraction as the Swap action's amount input (param/slot) in the recipe
      builders (frontend/MCP consume the helper). No on-chain sizing contract.

## 5. Three curated recipes + presets

- [ ] 5.1 **Entry** recipe shape: `Swap(part of deposit → other)` → `Mint(rangeMode 1)`; `tokenId` → slot.
- [ ] 5.2 **Rebalance** recipe shape: `WickWaitRebalanceCondition` → `Decrease(100%)` → `Collect` →
      `Swap(other → deposit)` → `Swap(part → other)` → `Mint`; new `tokenId` overwrites the slot.
- [ ] 5.3 **Auto-Compound** recipe shape: `IntervalCondition(interval)` → `Collect` → `Increase`.
- [ ] 5.4 Curated presets: `W` (1h/30m/10m), `tickDelta` (Narrow/Medium/Wide), cooldown (7d/3d/1d) —
      all overridable; nothing hard-coded in recipe logic.
- [ ] 5.5 Seed-validate the three recipes (`validateRecipeShape` against the deployed catalog).

## 6. Definition of Done

- [ ] 6.1 `hardhat test` green (condition fork tests incl. in/out/wick/cooldown/cardinality-revert).
- [ ] 6.2 `pnpm backend:test` green (catalog integrity + recipe seed validation); reseed identical
      except the intended new entries.
- [ ] 6.3 `openspec validate wick-and-wait-strategy --strict` passes.
- [ ] 6.4 Manual fork run: instantiate the three automations on a vault, exercise a real rebalance
      (persistent move) and confirm a wick does NOT trigger; auto-compound increases the position.
- [ ] 6.5 Code-review without open hard blockers.
