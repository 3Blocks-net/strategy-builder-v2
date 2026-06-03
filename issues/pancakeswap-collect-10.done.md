# PancakeSwap V3 Collect (harvest fees)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

A **"PancakeSwap Collect"** node that collects accrued fees (and any owed tokens) from a position into the vault, so an investor can automate harvesting LP rewards. Reuses the PCS registry + NPM interface from #7.

End-to-end behavior: the position token-id comes from a context slot; on trigger the vault calls `NPM.collect(amount0Max = amount1Max = type(uint128).max)`, sweeping all collectable tokens to the vault. No approval needed.

## Acceptance criteria

- [ ] `PancakeSwapV3CollectAction` reads token-id from a slot and calls `NPM.collect(max, max)`.
- [ ] Forked-mainnet test: after fees accrue on a position, Collect delivers the accrued tokens to the vault (balances increase).
- [ ] `StepType` seed row added; `paramSchema` encodes to correct calldata (backend test).
- [ ] Collect node appears in the editor; tokenId-from-slot configurable; mapper/widget tests pass.
- [ ] Contract < 24 KB (production profile); deployed + re-seeded.

## Blocked by

- Blocked by #7 (LP Mint: NPM interface, position token-id slot, deploy/seed)

## User stories addressed

- User story 33
