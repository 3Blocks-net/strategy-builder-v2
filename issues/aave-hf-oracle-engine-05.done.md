# Aave amount-mode engine: MAX_AVAILABLE (oracle-bound) + TARGET_HF across all four Aave actions

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

Completes the **4-mode amount model** by adding the two oracle/health-factor-driven modes to all four Aave actions (Supply, Withdraw, Borrow, Repay): the per-action `MAX_AVAILABLE` that requires the oracle, and `TARGET_HF` (compute the amount that moves the position to a target health factor). This is the heavy `ActionLib` computation work — see PRD _ActionLib_, the amount-mode table, _Aave V3 — amount-mode model_, and _18-decimal normalization_.

**HITL:** the numeric correctness here needs reviewed **hard-fixture** unit tests, the haircut constant must be agreed, and the no-op / best-effort semantics warrant a design/code-review checkpoint.

End-to-end behavior: in the `aave-amount-mode` widget, `TARGET_HF` becomes selectable and shows a friendly target-HF input (e.g. `1.5`); `MAX_AVAILABLE` resolves to its per-action protocol maximum. On trigger the action reads `getUserAccountData` + `getAssetPrice` (oracle resolved at runtime via the AddressesProvider) and computes the amount.

`ActionLib` additions:
- The **4-mode engine** per action: full-balance / `availableBorrowsBase` / full-debt / max-safe-withdraw, and the **inverse target-HF math in four directions** (Supply/Repay raise HF; Withdraw/Borrow lower it).
- **18-decimal normalization** of the Aave path: scale **both** the oracle price **and** all `getUserAccountData` base values ×1e10; base→token conversion `tokenAmount = baseAmount18 × 10^assetDecimals / price18` (decimals read dynamically), flooring on the binding side.
- **Haircut**: fixed conservative constant (~50 bps) applied only to Borrow-MAX and Withdraw-MAX.

Behavioral rules: `TARGET_HF` **wrong-direction → no-op** (amount 0, step proceeds, never revert); holdings cap → **best-effort**; `MAX_AVAILABLE` never reverts from edge rounding. `targetHealthFactor` must be `> 1.05e18`. Oracle is resolved at runtime — never cached. See `AaveV3Registry` decision in PRD _Contract architecture_.

Backend: raw-mode guard rejects `targetHealthFactor <= 1.05e18` (TARGET_HF mode). `IAaveOracle` (`getAssetPrice`) external interface added if not already present.

## Acceptance criteria

- [ ] **Mandatory** `ActionLib` isolated Solidity unit tests with hard numeric fixtures: 18-decimal normalization (price + base values ×1e10), base→token conversion at non-18 decimals, inverse target-HF math in all four directions, the haircut, slot bounds. A 10ⁿ scaling error is caught here.
- [ ] Forked-mainnet tests per action: `MAX_AVAILABLE` per-action semantics hold; `TARGET_HF` reaches the target within tolerance; **wrong-direction no-op** leaves the position unchanged and the step proceeds; **best-effort cap** never reverts.
- [ ] Withdraw `MAX_AVAILABLE` respects HF ≥ 1 minus haircut (and `uint256.max` only when no debt); Borrow `MAX_AVAILABLE` ≈ `availableBorrowsBase` minus haircut.
- [ ] Oracle is resolved at execution via `provider.getPriceOracle()` (not cached); the action reads the same oracle Aave uses for HF.
- [ ] Backend raw-mode guard rejects `targetHealthFactor <= 1.05e18` (HTTP 400); encoding test covers the `mode` → raw enum + `targetHealthFactor` `1.5 → 1.5e18` mapping.
- [ ] Frontend: `aave-amount-mode` exposes `TARGET_HF` with a friendly target-HF input; `encode-boundary` maps it correctly; widget tests pass.
- [ ] All four Aave actions remain < 24 KB after `ActionLib` inlining (production profile).

## Blocked by

- Blocked by #1 (Aave spine + `ActionLib` v1)
- Blocked by #2 (Withdraw action)
- Blocked by #3 (Borrow action)
- Blocked by #4 (Repay action)

## User stories addressed

- User story 14a (complete)
- User story 14b
- User story 14c
