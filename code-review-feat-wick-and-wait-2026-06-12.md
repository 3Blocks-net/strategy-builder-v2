## 🔍 Code Review — feat/wick-and-wait → develop
**2026-06-12 | large PR | Solidity (Hardhat) + NestJS/Prisma (Jest) + React/Vite (Vitest)**

**Diff:** 18 code files (+1460/−22), 6 OpenSpec docs excluded | **Fallow:** ✗ not installed
**Pipeline:** 1× code-explorer → 5× reviewer (contract · code · architecture · completeness · test-coverage) → 0× extended-reasoner (no criticals)

Base is `develop` (the branch fork point). Advisory contract review — on-chain changes warrant human/audit sign-off before scaling TVL.

---

### 🔴 Critical (PR-specific)
None.

### 🟡 Warnings (PR-specific)

**1. `SwapToRangeRatio` omits Mint's degenerate-range guard → the two diverge**
- **File:** `actions/PancakeSwapV3SwapToRangeRatioAction.sol:79-80` (vs `MintAction.sol:139`)
- **Verified:** Mint has `if (tickLower == tickUpper) tickUpper += spacing;`, SwapToRangeRatio does **not**. For a tiny `tickDelta` (or price on a spacing boundary), the sizing action sees `sa==sb` → `A=B=0` → no-op (no swap), but the following Mint adds a spacing and opens a 1-spacing position → entry is mis-sized (dust). Same `tickDelta` input, different effective range.
- **Fix:** add the same guard line after line 80. (Ideally extract Mint+Swap's `_roundDown/_roundUp`+guard into a shared `TickMath`/`TickRangeLib` so they can't diverge again.)

**2. Cooldown overflow → permanent DoS after first fire (max input)**
- **File:** `WickWaitRebalanceCondition.sol:103` — `met = block.timestamp >= last + p.cooldown;`
- A user/tool setting `cooldown` near `type(uint256).max` → after the first rebalance (`last≈1.8e9`), `last + cooldown` overflows → 0.8 checked-math reverts → `check()` bricks forever; the position can never rebalance again.
- **Fix:** saturating add or an upper bound: `if (p.cooldown > 365 days) revert CooldownTooLarge();` (or `unlockAt = last > max - cooldown ? max : last + cooldown`).

**3. Q96 sizing math overflows for extreme-price pools (sp > 2^128)** *(dormant for BSC)*
- **File:** `SwapToRangeRatioAction.sol:91` (and the staged `_mulSpDivQ96`/`_divSpMulQ96`)
- The comment `sp,sb ≈ 2^96` is wrong — `sqrtPriceX96` is `uint160` (max ≈ 2^160). For a very cheap token0 vs token1 (memecoin/stable), `sp` exceeds 2^128 and `sp*(sb−sp)` can reach 2^256 → revert/DoS for that pair. Dormant for the BNB/stable/CAKE pairs v1 targets (sp < 2^128). *Flagged by contract + code reviewers (merged).*
- **Fix now:** correct the comment + add `require(sp <= type(uint128).max)` to fail fast. **Before non-BSC pairs:** `FullMath.mulDiv` in the three staged spots.

**4. `tickDelta` sync is prose-only (footgun)**
- **Files:** `recipe-seed-data.ts` (`tickDelta:'RANGE'` on both `size` & `mint`), `catalog/pancakeswap.ts` ("MUST match the following Mint")
- SwapToRangeRatio and the following Mint must use the **same** `tickDelta`; enforced only by the shared recipe placeholder + a prose warning. Manual graph construction (or a future per-node override) that sets them differently → systematically unbalanced position, silently. *Flagged by code + architecture (merged); dormant given the shared placeholder.*
- **Fix:** add a recipe/encode cross-node check (`SwapToRangeRatio.tickDelta === next Mint.tickDelta`), or an `x-ui-linked-field` annotation.

**5. `depositSwapFraction` is dead code**
- **File:** `lp-math.ts` (the new helper) — **verified no consumer** outside its own spec. Documented as a "frontend preview" but the frontend can't import backend, there's no endpoint, no UI uses it. *Flagged by code + architecture (merged).*
- **Fix:** move to `packages/shared` (then frontend/MCP can consume it as the intended preview — matches CLAUDE.md's shared-math rule), or remove it.

<details><summary>Deferred-by-design / lower-confidence (3)</summary>

- **`amountOutMinimum=0` sandwich on the sizing swap** (`SwapToRangeRatioAction.sol:_swap`) — the team deferred `minOut` to a v1 follow-up (you opted out). Per-rebalance MEV loss bounded by the cooldown but per-event uncapped; **must close before scaling vault TVL**. Tracked, not a v1 blocker.
- **`slot0` spot read for sizing** (`:77`) — the trigger uses TWAP, but the action sizes off the live `slot0().tick`; a same-block manipulator can mis-center the range (amplifies #minOut). Consistent with the existing Mint pattern; could use `observe([0,0])`.
- **`tickDelta=0` → Mint reverts** — add `require(p.tickDelta > 0)` (subsumed by fix #1's guard).
</details>

### 🔵 Info / Minor (PR-specific)
- `tickDeltaToPct` shows symmetric `±X%` but the lower bound is geometrically smaller (at ±20%: +20% / −16.7%) — negligible ≤±10%, mildly misleading at ±20%. Consider `+X% / −Y%`.
- `excess1` naming in SwapToRangeRatio is misleading (it's a token1-unit value, not a token1 amount).
- `range-percent` adds one more arm to the `dynamic-form` if-chain (11 widgets) — within the established pattern; a `WIDGET_REGISTRY` map is the longer-term cleanup.

### ✅ Completeness
Clean. (`console.log` in `deploy-defi-actions.ts` is intentional deploy-script logging, not debug cruft.)

### 🧪 Missing Tests
- **`TickMath.sol` has no direct test** — only exercised indirectly at tick 0. Add anchor tests (tick 0 → 2^96, ±MAX_TICK, negative-tick rounding).
- **No cross-layer consistency test** — the strategy's correctness depends on Solidity `TickMath`, backend `lp-math.ts`, and frontend `ticks.ts` agreeing. Add a test asserting `TickMath.getSqrtRatioAtTick(tick)` (Solidity) == the TS port across representative/boundary ticks. **High value.**
- **SwapToRangeRatio only tested at tick 0 / price 1 / symmetric range** — add skewed-range + non-zero-tick cases (the value math only matters off price 1); cover the `amountIn > bal` clamp + `denom==0`.
- **`RangePercentField` has no component test** (every other widget does) — preset click, custom input, preset-active highlight, 0/negative ignored.
- **Fork test 4b.3** (SwapToRangeRatio on a live pool, dust check) — already tracked open.

---

### 📐 Architectural Observations (systemic / placement)

- **`WickWaitRebalanceCondition` lives in `contracts/examples/conditions/`.** The architecture-reviewer flags this as "production code in examples/." **Note:** the *existing* deployed conditions (Interval/Timer/TokenBalance) also live there — so the placement is **consistent with the current convention**, not a new violation. If the team wants a real `contracts/conditions/` split, that's a systemic refactor (move all four), not specific to this PR.
- **Tick/range math spans 4 runtimes** (Solidity TickMath, Solidity `_roundDown/_roundUp` ×2, backend `lp-math`, frontend `ticks`) — an inherent on-chain/off-chain split, but with no consistency test (see Missing Tests). The DRY duplication of `_roundDown/_roundUp` between Mint and Swap is the in-Solidity part (extract to a lib).

---

## Merge-Verdict

**APPROVE (with recommended fixes)** — 0 Critical. The strategy is correct and tested for its v1 BSC target pairs; the warnings are real but cheap, dormant-for-BSC, or deferred-by-design.

### Strongly Recommended before merge (cheap, real)
1. **Degenerate-range guard** in SwapToRangeRatio (#1) — closes a real Mint/Swap divergence. *(contract change → redeploy)*
2. **Cooldown overflow guard** (#2) — prevents a permanent-DoS footgun. *(redeploy)*
3. **`depositSwapFraction`**: move to `shared` (wire the preview) or remove the dead export (#5).
4. **TickMath anchor + cross-layer consistency tests** — the whole strategy leans on this math agreeing.

### Acceptable to Defer (follow-up tickets)
- `minOut` slippage guard (user-deferred; **close before scaling TVL**).
- `FullMath.mulDiv` for extreme-price (non-BSC) pools — for now correct the comment + add a `require(sp ≤ 2^128)`.
- DRY-extract `_roundDown/_roundUp`(+guard) into a shared lib; `tickDelta` cross-node enforcement; `RangePercentField` test; widget-registry refactor; the ±% asymmetry display.

### Fix order (dev)
1. SwapToRangeRatio degenerate guard + `require(tickDelta>0)` + comment/`require(sp≤2^128)`.
2. Cooldown saturating/bound in the condition.
3. Recompile, retest, **redeploy** (`deploy-defi-actions`) + reseed.
4. TickMath anchor + cross-layer test; move `depositSwapFraction` to `shared`.
5. Open follow-up tickets: minOut, FullMath, DRY lib, widget test.
