## Context

PancakeSwap V3 LP actions (Swap/Mint/Decrease/Collect/Increase) already exist and are
schema-driven; positions are tracked by a `tokenId` flowing through vault context slots
(`Mint` writes it, the others read it). `Mint` rangeMode 1 already reads `pool.slot0().tick` and
centers the range. The vault calls a trigger condition (step 0) via `staticcall`, and — only when it
fired — `IUpdatableCondition.afterExecution` to persist a context diff. The catalog has **no
price/time-weighted condition** (`add-mcp-server §13`), which is the only real gap for this strategy.

The novelty "wait, ignore wicks, rebalance only on a persistent move" maps cleanly to a **TWAP
window**, not to stored dwell state — because `afterExecution` runs only on fire, a condition cannot
record "price first left the range" while deliberately *not* firing. A TWAP over window `W` is
inherently wick-robust and stateless to read.

## Goals / Non-Goals

**Goals:**
- One reusable on-chain condition (`WickWaitRebalanceCondition`) combining TWAP range-breach + cooldown.
- Assemble the full strategy (entry, rebalance, auto-compound) from this condition + existing actions.
- Keep everything deposit-token-centric and schema-driven; all parameters user-set with curated presets.

**Non-Goals (v1):**
- TWAP-centered entry (entry stays slot0-centered via existing `Mint` rangeMode 1).
- Slippage `minOut` enforcement on strategy swaps (user opted out).
- Volatility-adaptive range width; on-chain sizing contract; automated cardinality setup.

## Decisions

### D1 — TWAP window over stored dwell state
The wick filter is `observe([W,0])` → mean tick, compared to the position range. **Why:** the
`afterExecution`-only-on-fire model can't persist "out-since" without firing; a TWAP is stateless,
and `W` *is* the "stays out long enough" period. A short wick barely moves the mean. **Alternative
considered:** a stateful dwell timer armed when price leaves — rejected, doesn't fit the trigger model.

### D2 — Cooldown folded into the same condition (IUpdatableCondition)
`check() = breach AND (now − lastRebalance ≥ cooldown)`; `afterExecution` writes `lastRebalance = now`.
This is exactly what `afterExecution`-on-fire is for. A zero/unset slot means "never rebalanced" →
not blocked. **Why one condition, not two composed steps:** the cooldown state only changes when the
rebalance fires, so it belongs with the trigger; keeps the rebalance automation a single clean trigger.

### D3 — Derive the pool from the position, not a passed address
The condition reads `positions(tokenId).{token0,token1,fee}` and derives the pool via the V3 factory.
**Why:** single source of truth — the range and the pool both come from the live position, so they
can't drift. `tokenId` comes from the same context slot the LP actions use.

### D4 — Deposit-token-centric, with balancing subsumed by `SwapToRangeRatio`
Entry starts from the deposit token (one LP leg). The `SwapToRangeRatio` action (D5) balances from
*whatever* the vault holds toward the target ratio, so the rebalance does **not** need an explicit
"normalize to the deposit token" step — `Decrease(100%) → Collect → SwapToRangeRatio → Mint` balances
the freed two-token holdings directly. **Why:** one action handles both entry (single token) and
rebalance (two tokens), one fewer swap than an explicit normalize, and the deposit-token base is
preserved for entry.

### D5 — On-chain execution-time sizing via a new `SwapToRangeRatio` action
**(Revised — the earlier off-chain approach was wrong for time-deferred automations.)** The
automations fire later, at a keeper-chosen time; the system injects no dynamic params at trigger
time. A swap amount baked in at build time is therefore wrong at execution — especially for
**Rebalance**, which fires at an unknown future price. So the sizing MUST happen on-chain, at
execution, with the current price.

A new action `PancakeSwapV3SwapToRangeRatioAction` (separate from Mint — Decision via review):
reads `slot0().tick`, computes the same range the subsequent Mint will use (`tick ± tickDelta`,
rounded to spacing), computes the target token0/token1 value ratio for that range
(`r0 = A/(A+B)` with `A = sp·(sb−sp)/sb`, `B = sp−sa` — overflow-safe staged math, no FullMath
needed), compares to the vault's current holdings and **swaps the over-represented token** via the
router. The existing `Mint(rangeMode 1, full balance)` then mints whatever is held (dust tolerated).
Works for **Entry** (holdings = deposit token only) and **Rebalance** (holdings = both tokens after
Collect) — one generic action. Single-pass (ignores price impact on the post-swap ratio); the
residual is dust. No `minOut` in v1 (consistent with `SwapAction`; sandwich risk tracked as a
follow-up). **Alternative:** a combined zap-mint action — rejected to keep `Mint` reusable and the
router out of the mint path.

The off-chain `lp-math.depositSwapFraction` helper was **removed** in code review (dead code — never
wired; the frontend can't import backend internals). If an "expected split" preview is wanted later,
build it in `packages/shared` so frontend/MCP can consume it.

### D6 — Three per-automation recipes, not a bundled "strategy" object
The recipe model is per-automation; we ship Entry / Rebalance / Auto-Compound as three curated
few-shot shapes with presets. **Why:** stays within the existing recipe/catalog mechanism (no new
"strategy bundle" abstraction); the user instantiates the three on one vault.

### D7 — Manual observation-cardinality setup
The user (or a pre-activation UI check) ensures the pool's `observationCardinality` covers `W` via
`increaseObservationCardinalityNext`. **Why:** keeps v1 contract surface minimal; cardinality is a
one-time, pool-global concern, not per-automation. The condition reverts (not false-negative) if
history is insufficient, so misconfiguration is visible.

## Risks / Trade-offs

- **[Insufficient pool cardinality → `observe` reverts]** → D7 surfaces it (revert, not silent
  never-fire) + a pre-activation check; documented as a setup prerequisite.
- **[Normalize-on-rebalance adds a swap (cost)]** → accepted for consistency in v1; the cooldown +
  TWAP hysteresis keep rebalances infrequent, bounding the cost. D4 alternative is a later optimization.
- **[No slippage guard on strategy swaps]** → user-accepted for v1; flagged as the top follow-up
  (sandwich risk), to revisit before mainnet sizing up.
- **[Off-chain sizing trust]** → the swap amount is just a sizing input; a wrong value yields dust /
  suboptimal fill, not loss of custody (actions still run through the vault's checks).
- **[TWAP mean-tick sign/rounding]** → round toward −∞ for negative results (per Uniswap
  `OracleLibrary`); covered by a unit/fork test.

## Migration Plan

1. Ship the condition + `observe` interface + fork tests (independent of recipes).
2. Deploy on the fork, write the address to `fork-latest.json`, seed the catalog entry (guard green).
3. Add the three recipes + presets; seed-validate them.
4. No data migration; no change to existing automations or the vault.

## Open Questions

- Pre-activation cardinality check: frontend-only, or also a read surfaced via MCP/backend?
- Preset values for `W`/`tickDelta`/cooldown are initial guesses — confirm against real BSC pool
  fee/volatility before mainnet.
