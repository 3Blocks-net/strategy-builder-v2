# PancakeSwap V3 Decrease Liquidity (decrease + collect bundled)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

A **"PancakeSwap Decrease Liquidity"** node that removes liquidity from a position **and delivers the freed tokens to the vault in one step** — bundling the two on-chain calls (`decreaseLiquidity` then `collect(max,max)`) so the user sees a single node. Reuses the PCS registry + NPM interface from #7.

End-to-end behavior: the position token-id comes from a context slot; the investor specifies a **percentage** of liquidity to remove (100% = all, reading the live `positions().liquidity`). On trigger the vault calls `NPM.decreaseLiquidity(...)` with `amountMin = 0` and `deadline = block.timestamp`, **then** `NPM.collect(amount0Max = amount1Max = type(uint128).max)` to actually pull the freed tokens (plus accrued fees) into the vault. No approval needed.

This addresses the single most common LP integration bug (PRD _Further Notes_): `decreaseLiquidity` alone only accrues to the position — the bundled `collect` is what delivers tokens.

## Acceptance criteria

- [ ] `PancakeSwapV3DecreaseLiquidityAction` reads token-id from a slot, computes liquidity from a **percentage** of the live `positions().liquidity`, calls `decreaseLiquidity` then `collect(max,max)`.
- [ ] Forked-mainnet test: tokens **actually arrive in the vault** (the bundled `collect` ran), not merely accrued to the position — explicitly asserted.
- [ ] 100% removes all liquidity; a partial percentage removes the proportional amount.
- [ ] `StepType` seed row added; `paramSchema` encodes to correct calldata (backend test).
- [ ] Decrease node appears in the editor; percentage + tokenId-from-slot configurable; mapper/widget tests pass.
- [ ] Contract < 24 KB (production profile); deployed + re-seeded.

## Blocked by

- Blocked by #7 (LP Mint: NPM interface, position token-id slot, deploy/seed)

## User stories addressed

- User story 31
- User story 32
