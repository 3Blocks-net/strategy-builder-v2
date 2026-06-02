# Vault Gas-Deposit Overview — Design

**Date:** 2026-06-02
**Status:** Approved (design)

## Context

Public automations are run by external executors who are reimbursed for gas via
the vault's pre-funded deposit in `FeeRegistry` (`vaultDeposits[vault][depositToken]`).
If that deposit is empty, executing the automation does **not** revert — it runs
but pays the executor **0** compensation, so in practice no external executor will
bother running it. Owner-executed automations never need this deposit.

Today the vault detail page gives the user no visibility into this. They cannot
see whether a gas reserve is funded, and get no warning when public automations
are effectively stranded for lack of compensation. This was discovered while
verifying external execution: the vault had `vaultDeposit = 0`, execution
succeeded, but `GasCompSettled` was never emitted.

**Goal:** Show the vault's gas-comp deposit, warn precisely when public automations
won't realistically be executed for lack of a reserve, and let the owner top up
the deposit.

## Decisions (agreed with user)

- **Warning condition & wording:** Warn only when there is ≥1 active, non-draft,
  **public** automation AND the deposit is too low. Precise wording (execution is
  not blocked, only uncompensated): *"Zu geringe Gas-Reserve hinterlegt — externe
  Executor werden nicht kompensiert und führen deine public Automations daher
  voraussichtlich nicht aus."*
- **Panel content:** Minimal — deposited amount + the warning. No protocol-level
  "gas comp disabled" (oracle) status. (See Caveat.)
- **Scope:** Include a "Fees einzahlen" (top-up) action.
- **Low threshold:** `deposited < minFeeDeposit`. Because `minFeeDeposit` defaults
  to 0, the effective condition is `deposited == 0 OR deposited < minFeeDeposit`
  — an empty reserve always counts as too low.

## Architecture

### Backend

**`FeeService.getVaultGasDeposit(vaultAddress)`** (new method, `packages/backend/src/blockchain/fee.service.ts`)

Reads on-chain:
- `vault.depositToken()` — `address(0)` means gas comp is disabled for this vault.
- If a deposit token is set: `FeeRegistry.vaultDeposit(vault, depositToken)`,
  `vault.minFeeDeposit()`, and the token's `symbol` / `decimals`.

Returns:
```ts
{
  enabled: boolean;                 // false when depositToken == address(0)
  token: { address: string; symbol: string; decimals: number } | null;
  deposited: string;                // base units (wei), "0" when none
  minFeeDeposit: string;            // base units (wei), "0" when unset
}
```

**`GET /vaults/:address/gas-deposit`** (new endpoint, `VaultOwnerGuard`)

Placed in a vaults-scoped controller alongside the existing `:address/context-slots`
route (same guard/pattern). Returns the `getVaultGasDeposit` result.

### Frontend

**`GasDepositCard`** (new component, `packages/frontend/src/components/gas-deposit-card.tsx`),
rendered in `pages/vault/detail.tsx` near the `ContextView`.

- Fetches `/vaults/:address/gas-deposit` and the existing `/vaults/:address/automations`.
- Displays the deposited amount (formatted with the token's decimals + symbol) and
  the `minFeeDeposit` target.
- Renders the warning banner when `shouldWarnGasDeposit(...)` is true (see helper).
- "Fees einzahlen" button → inline amount input → `useWriteContract` calling the
  vault's `depositFees(depositToken, parseUnits(amount, decimals))`. No ERC-20
  approval is needed — `depositFees` is `onlyOwner` and moves tokens from the
  **vault's own balance** (`forceApprove` + `depositFor` inside the vault). A short
  note states funds come from the vault balance. On success, refetch the deposit.
- When `enabled === false` (no deposit token): show "Gas-Kompensation für diesen
  Vault deaktiviert" and no top-up button.

**Pure helper `shouldWarnGasDeposit(deposited, minFeeDeposit, automations)`**
(extracted so it is unit-testable without wagmi):
```ts
// warn when there is an active public automation AND the reserve is too low
const hasActivePublic = automations.some(
  (a) => !a.ownerOnly && a.active === true && !a.isDraft,
);
const tooLow = deposited === 0n || deposited < minFeeDeposit;
return hasActivePublic && tooLow;
```
(`deposited` / `minFeeDeposit` compared as bigint.)

## Data flow

1. Detail page mounts `GasDepositCard` with the vault address.
2. Card fetches gas-deposit info + automations list in parallel.
3. Card renders balance, target, and conditional warning.
4. On top-up: owner signs `depositFees` tx → vault transfers from its balance to
   FeeRegistry → card refetches and the warning clears once `deposited >= minFeeDeposit`
   (and `> 0`).

## Error handling

- Backend read failures: endpoint returns a normal error; card shows a load error
  with retry (consistent with `ContextView`).
- Top-up tx revert (e.g. vault holds insufficient `depositToken`): catch and show
  an inline error; balance unchanged.
- `enabled === false`: no fetch of deposit/minFeeDeposit; show disabled state.

## Testing

- **Backend:** unit test for `getVaultGasDeposit` in `fee.service.spec.ts` with a
  mocked provider/contracts — verifies the shape and the `enabled === false` path
  when `depositToken == address(0)`.
- **Frontend:** unit-test the pure `shouldWarnGasDeposit` helper across the matrix
  (no public automation, public+empty, public+below-target, public+sufficient,
  owner-only only). The wagmi-dependent rendering is not unit-tested (existing
  wagmi test-mock limitation); verified manually instead.

## Caveat (accepted)

Per the "minimal panel" decision, the card does **not** surface protocol-level gas
compensation status (`FeeRegistry.priceOracle`). On the current local fork gas comp
is disabled protocol-wide (`priceOracle == 0`), so the card will advise topping up
even though a deposit cannot be compensated there. In production (oracle configured)
the behavior is correct. Revisit if this fork-only mismatch causes confusion.

## Out of scope

- No protocol-wide gas-config (oracle/native token) display or setup.
- No "runway"/executions-remaining estimate.
- No changes to the execution or gas-compensation contracts.
