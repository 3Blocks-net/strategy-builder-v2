# PEC-215-08: Transaction History

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Add the transaction history backend endpoints and UI section to the vault detail page. Events are recorded by the Deposit/Withdraw flows (PEC-215-07) via POST and displayed as a paginated table.

**End-to-end behavior**: On the vault detail page, a "Transaction History" section shows a paginated table of all deposit and withdrawal events for the vault. Each row shows event type (Deposit/Withdrawal), token symbol, amount, fee amount, fee BPS, TX hash (linked to block explorer), and timestamp. A disclaimer informs the user that history may be incomplete (e.g., direct on-chain interactions) until the Subgraph integration is active. The backend provides POST /vaults/:address/events (for recording) and GET /vaults/:address/history (paginated reads).

### Backend Endpoints

- **POST /vaults/:address/events** — Record a vault event. Protected by VaultOwnerGuard. Body: `{ eventType, token, amount, feeAmount, feeBps, txHash, blockNumber, blockTimestamp }`. Validates eventType is DEPOSIT or WITHDRAWAL.
- **GET /vaults/:address/history** — Paginated event list. Protected by VaultOwnerGuard. Query: `?page=1&limit=20`. Returns `{ events: [...], total, page, limit }`. Ordered by blockTimestamp descending.

### Frontend

- **HistoryTable** — Paginated table on vault detail page. Columns: Type (badge), Token, Amount, Fee, TX Hash (truncated, links to BscScan), Date.
- **Disclaimer** — Info banner: "Transaction history may be incomplete. Direct on-chain interactions and automation executions are not tracked until Subgraph integration is active."
- **Pagination** — Simple prev/next with page indicator.
- **Empty State** — "No transactions yet" when no events exist.

## Acceptance criteria

- [ ] POST /vaults/:address/events creates a VaultEvent in DB, protected by VaultOwnerGuard
- [ ] POST validates eventType (DEPOSIT or WITHDRAWAL), required fields
- [ ] GET /vaults/:address/history returns paginated events, ordered by blockTimestamp desc
- [ ] GET respects page and limit query params with sensible defaults (page=1, limit=20)
- [ ] GET protected by VaultOwnerGuard (403 for non-owner)
- [ ] History table renders on vault detail page with type, token, amount, fee, TX hash, date
- [ ] TX hash links to BscScan (mainnet or testnet based on chainId)
- [ ] Disclaimer banner displayed above or below the history table
- [ ] Pagination controls (prev/next) work correctly
- [ ] Empty state shown when no events exist
- [ ] Backend E2E tests for POST and GET endpoints (auth, pagination, VaultOwnerGuard)
- [ ] Frontend component tests for HistoryTable (rendering, pagination, empty state, disclaimer)

## Blocked by

- Blocked by PEC-215-01 (VaultEvent model, VaultOwnerGuard)
- Blocked by PEC-215-06 (vault detail page shell)

## User stories addressed

- User story 12 (transaction history with timestamp, amount, fees, and incompleteness disclaimer)
