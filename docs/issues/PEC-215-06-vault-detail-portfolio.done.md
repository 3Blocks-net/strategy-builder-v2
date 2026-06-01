# PEC-215-06: Vault Detail Page — Portfolio View

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Create the vault detail page at `/vault/:address` showing all ERC-20 token balances with USD values. This is the shell page that subsequent slices (Deposit/Withdraw, History) extend with additional sections.

**End-to-end behavior**: User clicks a vault row on the dashboard and navigates to `/vault/:address`. The page displays the vault label (editable inline), deposit token, and a table of all ERC-20 positions in the vault. Each position shows token symbol, name, balance (formatted with correct decimals), USD value, and price source indicator. A total USD value is shown at the top. Data comes from GET /vaults/:address/portfolio.

### Components

- **VaultDetailPage** — Page shell at `/vault/:address`. Fetches portfolio data. Shows vault header (label, address, deposit token) and positions table.
- **VaultHeader** — Vault label (editable inline via PATCH /vaults/:address), truncated vault address with copy button, deposit token badge.
- **PositionsTable** — Table of token positions. Columns: Token (icon + symbol + name), Balance, Price (USD), Value (USD). Sorted by value descending.
- **TotalValue** — Prominent total USD value display.

### Routing

- Add `/vault/:address` route to the app router
- Navigation from dashboard table (PEC-215-05) links here

### Inline Label Edit

Click on vault label → text input → save on blur/enter via PATCH /vaults/:address. Show validation error on duplicate label.

## Acceptance criteria

- [ ] `/vault/:address` route is registered and renders VaultDetailPage
- [ ] Page fetches GET /vaults/:address/portfolio and displays all token positions
- [ ] Each position shows token symbol, name, formatted balance, USD price, and USD value
- [ ] Positions are sorted by value descending
- [ ] Total USD value is prominently displayed
- [ ] `priceSource` indicator shown per position (e.g., subtle badge for "defi-llama" or "unavailable")
- [ ] Vault label is editable inline via PATCH /vaults/:address
- [ ] Label edit shows validation error on duplicate
- [ ] Vault address displayed truncated with copy-to-clipboard button
- [ ] Loading and error states handled
- [ ] Returns 403 / redirect when accessing a vault the user doesn't own
- [ ] Component tests for PositionsTable, VaultHeader, inline label edit

## Blocked by

- Blocked by PEC-215-03 (GET /vaults/:address/portfolio endpoint)
- Blocked by PEC-215-05 (dashboard provides navigation to detail page)

## User stories addressed

- User story 7 (navigate to vault detail page)
- User story 8 (see all ERC-20 token balances)
- User story 9 (see USD values alongside balances)
