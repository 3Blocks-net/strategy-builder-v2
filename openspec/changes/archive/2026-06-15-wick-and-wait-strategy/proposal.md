## Why

Users want a fee-earning concentrated-liquidity strategy that does **not** rebalance on every
short price spike ("wick"), because reflexive rebalancing burns gas/fees and realizes impermanent
loss. The catalog currently has **no price/time-weighted condition** at all (noted missing as
`add-mcp-server §13`), so the "wait, ignore wicks, only rebalance on a persistent move" trigger
cannot be expressed. The PancakeSwap V3 LP actions (Swap/Mint/Decrease/Collect/Increase) already
exist — the only real gap is the trigger.

## What Changes

- **New on-chain condition `WickWaitRebalanceCondition`** (`IUpdatableCondition`): a single
  building block that fires only on a *persistent* range breach with a cooldown. `check()` reads the
  pool's **TWAP tick** over a window `W` (`pool.observe([W,0])`) and the open position's range
  (`positions(tokenId).tickLower/tickUpper`, pool derived from the position), and returns
  `met = TWAP tick outside range AND (now − lastRebalance ≥ cooldown)`. `afterExecution()` records
  `lastRebalance = now` (runs only when the trigger fired). Wick-robust by construction — a short
  wick barely moves the TWAP. This is the reusable **price/TWAP condition family**.
- **Interface extension `IPancakeV3Pool.observe(uint32[])`** (read-only) to enable the TWAP read.
- **Catalog entry** for the new condition (`paramSchema`/`abiFragment`/`x-ui` roles); the
  `step-catalog-integrity` guard covers it automatically.
- **Three curated per-automation recipes** for the deposit-token-centric strategy:
  - **Entry**: `Swap(part of deposit token → other token)` → `Mint(rangeMode 1)`.
  - **Rebalance**: `WickWaitRebalanceCondition` → `Decrease(100%)` → `Collect` →
    `Swap(normalize to deposit token)` → `Swap(part → other token)` → `Mint`.
  - **Auto-Compound** (Interval): `Collect` → `Increase`.
  With curated **presets**: wait window `W` (Conservative 1h / Balanced 30m / Aggressive 10m),
  range width `tickDelta` (Narrow / Medium / Wide), cooldown (7d / 3d / 1d).
- **Off-chain single-sided sizing**: the swap fraction is computed off-chain via the existing
  `lp-math.ts` and passed as a param/slot (no on-chain sizing contract in v1).
- **No new action contracts** (all LP actions reused); **cardinality setup is manual** (the user
  calls `increaseObservationCardinalityNext` externally — no setup action).
- **Explicitly NOT in v1** (follow-ups): TWAP-centered entry, slippage `minOut` on strategy swaps,
  volatility-adaptive range width.

## Capabilities

### New Capabilities
- `twap-range-condition`: a reusable on-chain `IUpdatableCondition` that triggers on a persistent
  (TWAP-confirmed) breach of the open position's range with a cooldown, plus its catalog entry and
  the `observe()` pool-interface extension. Wick-robust; the price/TWAP condition family.
- `wick-wait-recipes`: the three deposit-token-centric, curated per-automation recipe shapes
  (Entry / Rebalance / Auto-Compound) with curated presets that assemble the Wick-&-Wait strategy
  from the new condition plus the existing LP actions.

### Modified Capabilities
<!-- None. mcp-recipes (MCP serving recipes) and step-catalog-integrity are unchanged at the
     requirement level; the new condition just adds catalog data the guard already covers. -->

## Impact

- **Contracts:** new `WickWaitRebalanceCondition.sol` + `IPancakeV3Pool.observe` extension; fork
  tests; deploy script + `fork-latest.json`. No changes to the vault or existing actions.
- **Backend:** seed catalog entry for the condition; three recipe shapes + presets in
  `recipe-seed-data.ts`; off-chain sizing helper reusing `lp-math.ts` (shared with frontend/MCP).
- **Frontend/MCP:** pick up the new condition + recipes automatically (schema-driven; no per-step code).
- **Risk:** TWAP needs sufficient pool **observation cardinality** (`observe` reverts "OLD" otherwise)
  — handled out-of-band (manual `increaseObservationCardinalityNext` + a pre-activation check).
