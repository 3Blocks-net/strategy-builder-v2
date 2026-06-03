# Aave V3 Withdraw (simple amount modes)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

An **"Aave Withdraw"** node that pulls a supplied token (collateral) from Aave V3 back into the vault. Reuses the spine from #1 (`AaveV3Registry`, `ActionLib`, `ProtocolToken`/`token-selector`, `aave-amount-mode` widget, deploy/seed pipeline).

End-to-end behavior: investor picks an Aave token and an amount mode; on trigger the vault calls `Pool.withdraw(asset, amt, vault)`. A **"withdraw everything"** option maps to the `type(uint256).max` sentinel. Because the actual withdrawn amount differs from the sentinel (and from a requested amount when capped), the **actual** returned amount is written to an optional context slot for downstream steps.

Scope here is the **simple modes only** (FIXED, FROM_SLOT, and MAX_AVAILABLE = `uint256.max` "all" when there is no debt). The debt-aware max-safe-withdraw and `TARGET_HF` paths are slice #5. See PRD _The nine new action contracts_ and the amount-mode table.

## Acceptance criteria

- [ ] `AaveV3WithdrawAction` calls `Pool.withdraw(asset, amt, vault)`; no approval needed.
- [ ] "Withdraw everything" maps to `type(uint256).max`; forked-mainnet test asserts the **actual** withdrawn amount is written to the expected context slot and **differs from the sentinel**.
- [ ] Withdraw exercised against **≥ 3 BSC reserves** across FIXED / FROM_SLOT / max-all modes; vault token balance increases by the withdrawn amount.
- [ ] `StepType` seed row added; `paramSchema` encodes to correct calldata (backend test).
- [ ] Withdraw node appears in the editor reusing `aave-amount-mode` + per-protocol `token-selector`; actual-amount-out slot configurable.
- [ ] Contract < 24 KB (production profile); deployed in `deploy-fork.ts` + re-seeded.

## Blocked by

- Blocked by #1 (Aave spine: registry, `ActionLib`, `ProtocolToken`, widgets, deploy/seed pipeline)

## User stories addressed

- User story 9
- User story 10
- User story 11
