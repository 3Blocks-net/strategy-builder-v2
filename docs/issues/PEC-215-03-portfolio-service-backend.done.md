# PEC-215-03: Portfolio Service Backend (Alchemy + DeFiLlama)

## Parent PRD

PEC-215 (Vault-Verwaltung)

## What to build

Implement AlchemyService, PriceService, and VaultPortfolioService to fetch token balances, metadata, and USD prices for vaults. This powers the dashboard overview (batched multi-vault) and the vault detail portfolio view (single vault).

**End-to-end behavior**: GET /vaults/:address/portfolio returns all ERC-20 positions in a vault with balances, metadata, USD prices, and a `priceSource` field. GET /vaults/overview returns all user vaults with `totalValueUsd` per vault. Prices come from Alchemy Portfolio API primarily, with DeFiLlama as fallback. All data is cached for 60 seconds.

### Services

- **AlchemyService**: Calls Alchemy Portfolio REST API (`POST /data/v1/{apiKey}/assets/tokens/by-address`) with `withMetadata: true, withPrices: true`. Uses native `fetch` (no alchemy-sdk). In dev mode (`NODE_ENV=development`), falls back to direct RPC balance reads against the local Hardhat node. Batches max 2 addresses per Alchemy request for the overview endpoint.
- **PriceService**: Calls DeFiLlama (`coins.llama.fi/prices/current/bsc:0x...`) as fallback when Alchemy returns no price or a stale price. Uses native `fetch`.
- **VaultPortfolioService**: Combines AlchemyService + PriceService. For each position: if Alchemy provides a price, use it (`priceSource: "alchemy"`); if not, try DeFiLlama (`priceSource: "defi-llama"`); if neither, mark `priceSource: "unavailable"`. Computes `totalValueUsd`. Caches combined result with 60s TTL.

### API Endpoints

- **GET /vaults/:address/portfolio** — Single vault portfolio. Protected by VaultOwnerGuard. Returns `{ vaultAddress, positions: [...], totalValueUsd }`.
- **GET /vaults/overview** — All user vaults with `totalValueUsd`. Batches Alchemy calls. Returns `{ vaults: [{ address, label, depositToken, chainId, totalValueUsd, createdAt }] }`.

### Architecture for extensibility (User Story 20)

VaultPortfolioService is designed so that later DeFi protocol adapters (Aave, PancakeSwap) can inject additional positions into the same response shape. No protocol adapters are built now — only the extension point.

## Acceptance criteria

- [ ] AlchemyService calls Alchemy Portfolio REST API with correct parameters and parses response
- [ ] AlchemyService dev mode reads balances via RPC from local Hardhat node
- [ ] PriceService fetches from DeFiLlama and parses response correctly
- [ ] VaultPortfolioService applies DeFiLlama fallback when Alchemy price is missing
- [ ] Each position has correct `priceSource` field ("alchemy" | "defi-llama" | "unavailable")
- [ ] Portfolio data is cached with 60s TTL
- [ ] GET /vaults/:address/portfolio returns correct response shape with positions and totalValueUsd
- [ ] GET /vaults/:address/portfolio returns 403 via VaultOwnerGuard for non-owner
- [ ] GET /vaults/overview batches Alchemy calls (max 2 addresses per request) and returns totalValueUsd per vault
- [ ] Unit tests for AlchemyService (fetch mock, response parsing, dev-mode fallback, error handling)
- [ ] Unit tests for PriceService (fetch mock, missing tokens, confidence handling)
- [ ] Unit tests for VaultPortfolioService (combination logic, fallback, cache, partial failure)
- [ ] E2E tests for both endpoints (response shape, auth, VaultOwnerGuard)

## Blocked by

- Blocked by PEC-215-01 (needs Vault model and VaultOwnerGuard)

## User stories addressed

- User story 8 (see all ERC-20 token balances in vault)
- User story 9 (see USD values)
- User story 20 (extensible portfolio architecture)
