# PancakeSwap V3 Swap — PCS spine (amountOutMinimum = 0)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

The tracer bullet for the PancakeSwap path. Builds the PCS-side shared infrastructure (registry, swap-router/factory interfaces, pancakeswap token list, `fee-tier` widget, pool-existence validity check) while delivering a working **"PancakeSwap Swap"** node. Reuses the `ProtocolToken` entity, `/tokens` endpoint, and per-protocol `token-selector` from #1.

**HITL:** this slice carries the **Epic success-criterion conflict** flagged in the PRD (_Swap / LP price protection — removed by design_). The Epic criterion *"Swap erzwingt amountOutMinimum > 0"* is contradicted by the ship-with-`amountOutMinimum = 0` decision and **must be formally renegotiated/rewritten with the Epic owner**, and the corresponding test is **inverted** (prove a zero-min swap executes). This needs human sign-off.

End-to-end behavior: investor drags a **Swap** node, picks input/output tokens from the PCS list, picks a **fee tier** (0.01% / 0.05% / 0.25% / 1%), and an input amount (FIXED / FROM_SLOT / full-balance toggle). At configure time the frontend calls `factory.getPool(t0,t1,fee)` and **blocks deploy** if no pool exists. On trigger the vault calls `SwapRouter.exactInputSingle(...)` with `amountOutMinimum = 0`, `sqrtPriceLimitX96 = 0`, `deadline = block.timestamp`; the **output amount is written to a context slot**. `forceApprove` the router then **reset to 0**.

Infrastructure established here:
- **`PancakeSwapV3Registry`**: stores `SwapRouter`, `NonfungiblePositionManager`, `Factory` as three direct `immutable`s. No oracle. Immutable.
- **External interfaces**: `IPancakeV3SwapRouter` (`exactInputSingle` + `ExactInputSingleParams` incl. `deadline`), `IPancakeV3Factory` (`getPool`). See PRD _New external interfaces_.
- **Forward-compatibility**: the swap struct keeps optional static `amountOutMinimum` (default 0) + `minOutFromSlot` so price protection can be turned on later **without redeploy** (UI field stays hidden).
- **Backend**: `ProtocolToken` seed for the curated PancakeSwap pairs; `GET /tokens?protocol=pancakeswap`; `StepType` seed for the swap action; raw-mode guard rejects fee tier not in `{100, 500, 2500, 10000}`. (The `slippageBps` guard is **not** added — no slippage param exists.)
- **Frontend**: `fee-tier` widget; `encode-boundary` reuses `token-amount` → base-units and slot conventions; pool-existence validity check.
- **Deploy/fork**: `deploy-fork.ts` deploys `PancakeSwapV3Registry` (real BSC `SwapRouter`/`NPM`/`Factory`) + the swap action; ABI extracted.

## Acceptance criteria

- [ ] **Epic-owner sign-off recorded** on the `amountOutMinimum = 0` decision; the Epic success criterion is rewritten accordingly.
- [ ] `PancakeSwapV3Registry` stores the three addresses as immutables; zero-address construction reverts (registry unit test).
- [ ] Forked-mainnet test (inverted): a swap with `amountOutMinimum = 0` **executes** (does not revert on price movement); the **output amount lands in the expected context slot**; the vault receives the output token.
- [ ] After Swap, allowance to the router is back to **0** (approval hygiene assertion).
- [ ] Full-balance input toggle sweeps the input token without a known amount.
- [ ] Backend: `GET /tokens?protocol=pancakeswap` returns the curated pairs with correct `decimals`; raw-mode guard rejects an invalid fee tier (HTTP 400); encoding test passes.
- [ ] Frontend: `fee-tier` widget renders/emits correctly; `factory.getPool` validity check **blocks deploy** on a missing pair+tier; mapper/widget tests pass.
- [ ] Swap action < 24 KB (production profile); deployed + re-seeded.

## Blocked by

- Blocked by #1 (`ProtocolToken` entity, `/tokens` endpoint, per-protocol `token-selector`)

## User stories addressed

- User story 19
- User story 20
- User story 21
- User story 22
- User story 23
- User story 24
- User story 25
