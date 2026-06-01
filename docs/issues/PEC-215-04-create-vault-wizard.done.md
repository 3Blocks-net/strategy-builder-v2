# PEC-215-04: Create Vault Wizard (incl. ABI Extraction + Wagmi Config)

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Build the full Create Vault Wizard as a multi-step frontend flow, plus the supporting infrastructure: an ABI extraction build script and wagmi config update. This is the first frontend slice that interacts with smart contracts.

**End-to-end behavior**: User navigates to `/vault/create`, enters an optional label, selects a deposit token from the accepted tokens list (showing name, symbol, wallet balance), sees a fee preview (deposit/withdraw BPS), confirms the on-chain transaction, and optionally makes an initial deposit (Approve + Deposit). After TX confirmation, the frontend parses the VaultCreated event, sends POST /vaults to register it, and redirects to the dashboard. TX status feedback via toast notifications. On network failure during POST /vaults, retry with exponential backoff; show vault address as fallback.

### Infrastructure (prerequisite for all frontend contract work)

- **ABI Extraction Script**: Post-compile build script that extracts ABIs from Hardhat artifacts (`packages/contracts/artifacts/`) and writes them as `as const` TypeScript files to `packages/frontend/src/lib/abis/`. Must include custom error definitions (CallerNotOwner, TriggerNotMet, FeeTokenNotAccepted). Script wired into the contracts compile step.
- **Wagmi Config Update**: Update `packages/frontend/src/lib/wagmi.ts` to use `client` factory with `batch.multicall: true` and `pollingInterval: 2000` (BSC ~0.75s blocks).

### Wizard Steps

1. **Label** — Optional text input. Validated: unique per user (soft check against GET /vaults).
2. **Token Selection** — Dropdown/list from GET /tokens/accepted. Shows token name, symbol, decimals, and user's wallet balance (via `useBalance` or `useReadContract`).
3. **Fee Preview** — Display depositFeeBps and withdrawFeeBps from GET /fees.
4. **Create TX** — `useSimulateContract` + `useWriteContract` + `useWaitForTransactionReceipt` against StrategyBuilderVaultFactory. Salt: `keccak256(timestamp + crypto.getRandomValues())` per TX submit. Parse VaultCreated event from receipt. POST /vaults to backend with retry.
5. **Optional Initial Deposit** — If user opts in: Allowance check → Infinite Approve (with USDT reset-to-zero if needed) → Deposit. Inline stepper ("Step 1/2: Approving...", "Step 2/2: Depositing...").

### Contract Interactions (wagmi v2)

- `useSimulateContract` for pre-flight validation (catches errors before wallet popup)
- `useWriteContract` / `writeContractAsync` for TX submission
- `useWaitForTransactionReceipt` for confirmation
- `useReadContract` for allowance checks and wallet balances
- Infinite approval: `type(uint256).max`. Check existing allowance; if > 0 but not infinite and token is USDT-style, reset to zero first.

## Acceptance criteria

- [ ] ABI extraction script generates typed `as const` ABI files from Hardhat artifacts
- [ ] ABI files include custom error definitions
- [ ] Script is wired into contracts compile pipeline
- [ ] Wagmi config uses `client` factory with `batch.multicall` and `pollingInterval: 2000`
- [ ] Wizard step 1: Label input (optional), step 2: Token selection with wallet balances, step 3: Fee preview
- [ ] Token selection shows name, symbol, and user wallet balance for each accepted token
- [ ] Fee preview displays deposit and withdraw BPS rates
- [ ] Create TX uses simulate → write → wait pattern with correct salt generation
- [ ] VaultCreated event is parsed from TX receipt to extract vault address
- [ ] POST /vaults is called after TX confirmation with retry + exponential backoff
- [ ] On POST failure, vault address is displayed to user as fallback
- [ ] Optional initial deposit: allowance check → approve (infinite, USDT reset-to-zero) → deposit
- [ ] Inline stepper shows progress for multi-TX approve+deposit flow
- [ ] Toast notifications for single-TX flows (create vault success/error)
- [ ] Existing allowance is detected and approve step is skipped when sufficient
- [ ] Frontend hook tests (useCreateVault, useApproveAndDeposit)
- [ ] Frontend component tests (wizard step navigation, validation, fee display)

## Blocked by

- Blocked by PEC-215-01 (POST /vaults endpoint)
- Blocked by PEC-215-02 (GET /fees, GET /tokens/accepted)

## User stories addressed

- User story 1 (create vault with label + deposit token)
- User story 2 (fee preview before creation)
- User story 3 (optional initial deposit after creation)
- User story 4 (TX status feedback)
- User story 13 (explain approve step)
- User story 15 (detect existing approvals)
- User story 17 (token name, symbol, wallet balance in selection)
- User story 18 (Max button for deposit)
