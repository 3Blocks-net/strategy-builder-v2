# PEC-215-01: Prisma Schema + Vault CRUD Backend

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Add Vault and VaultEvent models to the Prisma schema and implement the core vault CRUD layer in the backend. This slice delivers the VaultModule with VaultService, VaultController, and VaultOwnerGuard — the foundation every subsequent slice builds on.

**End-to-end behavior**: An authenticated user can register a vault (POST /vaults) by providing the on-chain address, TX hash, block number, chain ID, deposit token, and optional label. The backend validates the vault on-chain (`factory.isRegisteredVault(address)` AND `vault.owner() == authenticated wallet`) before persisting. The user can list their vaults (GET /vaults), and update a vault's label (PATCH /vaults/:address). Labels are unique per user; vaults without a label get "Vault #N" (per-user sequential counter). The VaultOwnerGuard protects per-vault endpoints by checking `ownerAddress == JWT wallet`.

### Prisma Schema

Add to existing schema (User, Nonce, RefreshToken already exist):

- **Vault**: id, address (unique), chainId, ownerAddress (FK -> User.walletAddress), depositToken, label, createdAtBlock, txHash, createdAt, updatedAt. Unique constraint: `@@unique([ownerAddress, label])`.
- **VaultEvent**: id, vaultId (FK -> Vault), eventType (DEPOSIT/WITHDRAWAL), token, amount (String for BigInt), feeAmount (String), feeBps (Int), txHash, blockNumber, blockTimestamp (DateTime), createdAt.

### API Endpoints

- **POST /vaults** — Register vault in DB after on-chain creation. Validates `isRegisteredVault` + `owner()`. Assigns default label "Vault #N" if none provided.
- **GET /vaults** — List all vaults for the authenticated user.
- **PATCH /vaults/:address** — Update vault label. Protected by VaultOwnerGuard. Enforces label uniqueness per user.

### VaultOwnerGuard

A NestJS guard (analogous to WalletAuthGuard) that loads the Vault by `:address` route param, checks `ownerAddress == JWT wallet`, returns 403 on mismatch. Reference: `wallet-auth.guard.ts`.

### On-Chain Validation

VaultService calls `factory.isRegisteredVault(address)` and `vault.owner()` using ethers. Requires factory contract address in env config. Only needed for POST /vaults (registration).

## Acceptance criteria

- [ ] Prisma migration adds Vault and VaultEvent models with all fields and constraints
- [ ] POST /vaults validates on-chain (isRegisteredVault + owner check) before persisting
- [ ] POST /vaults assigns "Vault #N" default label (per-user counter) when no label provided
- [ ] POST /vaults returns 401 for unauthenticated requests
- [ ] POST /vaults returns 400/409 for duplicate vault address or duplicate label per user
- [ ] GET /vaults returns only vaults belonging to the authenticated user
- [ ] PATCH /vaults/:address updates label, returns 403 via VaultOwnerGuard for non-owner
- [ ] PATCH /vaults/:address returns 409 for duplicate label per user
- [ ] VaultOwnerGuard returns 403 when JWT wallet does not match vault owner
- [ ] Unit tests for VaultService (CRUD, validation, default label logic)
- [ ] E2E tests for POST/GET/PATCH endpoints (auth, ownership, validation)

## Blocked by

None — can start immediately.

## User stories addressed

- User story 1 (create vault with label + deposit token)
- User story 16 (rename vault label)
- User story 21 (default "Vault #N" label)
