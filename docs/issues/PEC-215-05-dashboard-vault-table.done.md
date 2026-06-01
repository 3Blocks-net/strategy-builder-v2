# PEC-215-05: Dashboard Vault Table

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Extend the existing DashboardPage with a vault table that shows all user vaults with USD values. Replace the current minimal dashboard (wallet address display only) with a proper vault overview.

**End-to-end behavior**: After login, the user sees a table of all their vaults. Each row shows the vault label, deposit token, total value in USD, and creation date. Clicking a row navigates to `/vault/:address`. An empty state shows a "Create Vault" CTA linking to `/vault/create`. The dashboard loads within 3 seconds (User Story 6). Data comes from GET /vaults/overview (batched Alchemy calls, 60s cache).

### Components

- **VaultTable** — Table component rendering vault rows. Columns: Label, Deposit Token, Total Value (USD), Created At. Row click navigates to `/vault/:address`.
- **EmptyState** — Shown when user has no vaults. "Create Vault" button links to `/vault/create`.
- **DashboardPage** — Updated to fetch GET /vaults/overview, render VaultTable or EmptyState. Keep existing wallet info + disconnect button.

### Data Fetching

- Uses the existing `api.ts` fetch wrapper with auth headers
- Loading skeleton while data is being fetched
- Error state with retry option

## Acceptance criteria

- [ ] Dashboard shows a table of all user vaults with label, deposit token, total value USD, and created date
- [ ] Clicking a vault row navigates to `/vault/:address`
- [ ] Empty state displays "Create Vault" CTA linking to `/vault/create`
- [ ] Dashboard loads within 3 seconds (data from cached overview endpoint)
- [ ] Loading state shows skeleton/spinner while fetching
- [ ] Error state with retry option on fetch failure
- [ ] Vaults without custom label display "Vault #N"
- [ ] USD values formatted appropriately (e.g., "$1,234.56")
- [ ] Component tests for VaultTable (rendering, empty state, click navigation)

## Blocked by

- Blocked by PEC-215-01 (GET /vaults endpoint)
- Blocked by PEC-215-03 (GET /vaults/overview with totalValueUsd)

## User stories addressed

- User story 5 (dashboard table with name, deposit token, total value, date)
- User story 6 (dashboard loads within 3 seconds)
- User story 21 (vaults without label show "Vault #N")
