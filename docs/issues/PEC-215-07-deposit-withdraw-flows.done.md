# PEC-215-07: Deposit & Withdraw Flows

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Add Deposit and Withdraw forms to the vault detail page with full transaction flows, fee display, and event recording. Both forms live on the `/vault/:address` page as sections or tabs.

**End-to-end behavior**:

**Deposit**: User selects a token from accepted tokens (showing name, symbol, wallet balance), enters amount (or clicks Max), sees the deposit fee preview. On confirm: allowance check → approve if needed (infinite, USDT reset-to-zero) → deposit TX. Inline stepper shows "Step 1/2: Approving..." / "Step 2/2: Depositing...". After TX confirmation, POST /vaults/:address/events records the deposit event with retry+backoff.

**Withdraw**: User selects a token from vault positions (from portfolio data), enters gross amount (or clicks Max for full vault balance), sees fee breakdown ("You receive: X, Fee: Y"). On confirm: simulate → write → wait. Toast notification for success/error. After TX confirmation, POST /vaults/:address/events records the withdrawal with retry+backoff.

### Deposit Form

- **Token Selection**: From GET /tokens/accepted. Shows token name, symbol, user wallet balance.
- **Amount Input**: Numeric input with Max button (sets full wallet balance).
- **Fee Preview**: "Deposit fee: {depositFeeBps/100}% — Fee: {feeAmount} {symbol}".
- **TX Flow**: Check allowance (`useReadContract`) → If insufficient: approve with `type(uint256).max` (USDT reset-to-zero pattern if current allowance > 0 and not infinite) → Deposit TX.
- **Status**: Inline stepper for multi-TX flow. Disable form during TX.

### Withdraw Form

- **Token Selection**: From portfolio positions (all tokens in vault, not just accepted ones).
- **Amount Input**: Numeric input with Max button (sets full vault balance for selected token, gross amount).
- **Fee Breakdown**: Below input: "You receive: {netAmount} {symbol} (Fee: {feeAmount} {symbol}, {withdrawFeeBps/100}%)".
- **TX Flow**: `useSimulateContract` (catch errors before wallet popup) → `useWriteContract` → `useWaitForTransactionReceipt`.
- **Status**: Toast notifications. Disable form during TX.

### Error Handling

- Simulation failures show decoded error message (from contract error map cached at app start via GET /errors/contract-errors)
- User wallet rejection handled gracefully (reset form state)
- Insufficient balance, CallerNotOwner etc. shown as clear messages

### Event Recording

Both flows POST to `/vaults/:address/events` after TX confirmation:
```
{ eventType, token, amount, feeAmount, feeBps, txHash, blockNumber, blockTimestamp }
```
With exponential backoff retry on network failure. Non-blocking — UI shows success even if event recording fails (best-effort until Subgraph).

## Acceptance criteria

- [ ] Deposit form shows accepted tokens with name, symbol, and user wallet balance
- [ ] Deposit amount input with Max button (full wallet balance)
- [ ] Deposit fee preview shows fee percentage and calculated fee amount
- [ ] Deposit flow: allowance check → approve (infinite, USDT reset-to-zero) → deposit
- [ ] Existing sufficient allowance skips the approve step
- [ ] Inline stepper shows "Step 1/2: Approving..." / "Step 2/2: Depositing..."
- [ ] Withdraw form shows vault positions (all tokens from portfolio)
- [ ] Withdraw amount input with Max button (full vault balance for selected token)
- [ ] Withdraw fee breakdown: "You receive: X (Fee: Y)" below input
- [ ] Withdraw uses simulate → write → wait pattern
- [ ] Contract errors decoded to human-readable messages via error map
- [ ] User wallet rejection resets form state gracefully
- [ ] Both flows record events via POST /vaults/:address/events with retry+backoff
- [ ] Forms disabled during active transactions
- [ ] Hook tests for useApproveAndDeposit, useWithdraw
- [ ] Component tests for DepositForm, WithdrawForm (amount input, Max button, fee display, button states)

## Blocked by

- Blocked by PEC-215-02 (GET /fees, GET /tokens/accepted, GET /errors/contract-errors)
- Blocked by PEC-215-04 (ABI extraction for contract interactions)
- Blocked by PEC-215-06 (vault detail page shell)

## User stories addressed

- User story 3 (deposit into vault)
- User story 4 (TX status feedback)
- User story 10 (deposit on detail page with token selection, amount, fee preview)
- User story 11 (withdraw to connected wallet with fee transparency)
- User story 13 (explain approve step — two confirmations)
- User story 14 (clear error messages for failed deposit/withdraw)
- User story 15 (detect existing approvals)
- User story 17 (token name, symbol, wallet balance in selection)
- User story 18 (Max button for deposit)
- User story 19 (Max button for withdraw with fee breakdown)
