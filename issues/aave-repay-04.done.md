# Aave V3 Repay (simple amount modes)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

An **"Aave Repay"** node that repays an Aave V3 loan from the vault. Reuses the #1 spine.

End-to-end behavior: investor picks the borrowed token and an amount mode; on trigger the vault calls `Pool.repay(asset, amt, 2, vault)` (variable rate). A **"repay full debt"** option maps to `MAX_AVAILABLE` = `min(debt, balance)` (revert-free; uses `type(uint256).max` when balance ≥ debt). Partial FIXED / FROM_SLOT repayments are also supported. The **actual** repaid amount is written to a context slot so downstream steps see the true figure. Approval to the Pool is set with `forceApprove` and **reset to 0** afterward (Repay-MAX approves more than is consumed).

Scope here is the **simple modes** (FIXED, FROM_SLOT, MAX_AVAILABLE = `min(debt, balance)`). The `TARGET_HF` path is slice #5. See PRD _The nine new action contracts_ and the amount-mode table.

## Acceptance criteria

- [ ] `AaveV3RepayAction` calls `Pool.repay(asset, amt, 2, vault)`; `forceApprove` then resets allowance to **0**.
- [ ] "Repay full debt" is revert-free: caps at `min(debt, balance)`; forked-mainnet test asserts debt is cleared (or reduced by balance) across **≥ 3 BSC reserves**.
- [ ] Partial FIXED / FROM_SLOT repay reduces debt by the requested amount.
- [ ] The **actual** repaid amount is written to the expected context slot (assert it differs from the sentinel on the max path).
- [ ] After Repay, allowance to the Pool is back to **0** (approval hygiene assertion).
- [ ] `StepType` seed row added; `paramSchema` encodes to correct calldata (backend test).
- [ ] Repay node appears in the editor reusing `aave-amount-mode` + per-protocol `token-selector`.
- [ ] Contract < 24 KB (production profile); deployed in `deploy-fork.ts` + re-seeded.

## Blocked by

- Blocked by #1 (Aave spine)

## User stories addressed

- User story 15
- User story 16
- User story 17
- User story 18
