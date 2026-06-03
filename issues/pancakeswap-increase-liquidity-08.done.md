# PancakeSwap V3 Increase Liquidity

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

A **"PancakeSwap Increase Liquidity"** node that adds liquidity to an existing position identified by a token-id read from a context slot, so an investor can automate scaling into a position over time. Reuses the PCS registry, NPM interface, and approval pattern from #7.

End-to-end behavior: investor selects the source amounts (per token, with the usual FIXED / FROM_SLOT / full-balance conventions) and the position's token-id comes from a context slot (written by an earlier Mint). On trigger the vault calls `NPM.increaseLiquidity(...)` with `amount0Min = amount1Min = 0` and `deadline = block.timestamp`. `forceApprove` both tokens then **reset to 0**. No tick centering needed — the position already carries its ticks.

## Acceptance criteria

- [ ] `PancakeSwapV3IncreaseLiquidityAction` reads token-id from a context slot and calls `NPM.increaseLiquidity(...)`.
- [ ] Forked-mainnet test: after a Mint, an Increase grows the position's liquidity; both token amounts are pulled from the vault.
- [ ] After Increase, allowances to NPM are back to **0** (approval hygiene assertion).
- [ ] `StepType` seed row added; `paramSchema` encodes to correct calldata (backend test).
- [ ] Increase node appears in the editor; amounts + tokenId-from-slot configurable; mapper/widget tests pass.
- [ ] Contract < 24 KB (production profile); deployed + re-seeded.

## Blocked by

- Blocked by #7 (LP Mint: NPM interface, position token-id slot, NFT custody, deploy/seed)

## User stories addressed

- User story 30
