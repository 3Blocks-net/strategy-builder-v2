# Aave V3 Borrow (simple amount modes)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

An **"Aave Borrow"** node that borrows a token from Aave V3 against the vault's collateral. Reuses the #1 spine.

End-to-end behavior: investor picks an Aave token and an amount mode; on trigger the vault calls `Pool.borrow(asset, amt, 2, 0, vault)` — interest-rate mode is **always `2` (variable)** so the action never hits the deprecated stable-rate path. The borrowed amount is written to a context slot so it can feed a subsequent swap or transfer.

Scope here is the **simple modes only** (FIXED, FROM_SLOT). The oracle-bound `MAX_AVAILABLE` (`availableBorrowsBase` → token, minus haircut) and `TARGET_HF` paths are slice #5. See PRD _The nine new action contracts_ and the amount-mode table.

## Acceptance criteria

- [ ] `AaveV3BorrowAction` calls `Pool.borrow(asset, amt, 2, 0, vault)`; variable rate is hardcoded.
- [ ] Forked-mainnet test (vault with collateral): borrow succeeds across **≥ 3 BSC reserves** for FIXED / FROM_SLOT; vault token balance increases and on-chain debt increases.
- [ ] Borrowed amount is written to the expected context slot.
- [ ] `StepType` seed row added; `paramSchema` encodes to correct calldata (backend test).
- [ ] Borrow node appears in the editor reusing `aave-amount-mode` + per-protocol `token-selector`; borrowed-amount slot configurable.
- [ ] Contract < 24 KB (production profile); deployed in `deploy-fork.ts` + re-seeded.

## Blocked by

- Blocked by #1 (Aave spine)

## User stories addressed

- User story 12
- User story 13
- User story 14
