# Strategy Builder V2

On-chain automation protocol for BNB Smart Chain. Users deploy personal **vaults** (ERC1967 proxies) and configure **automations** — composable graphs of Conditions and Actions that execute trustlessly when their trigger fires.

Full-stack monorepo: Solidity smart contracts, NestJS backend, React frontend.

---

## Quick Start

### Prerequisites

- **Node.js** 22+
- **pnpm** 9+
- **Docker** (for PostgreSQL)
- **MetaMask** browser extension (for frontend)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Everything (Quick)

```bash
pnpm dev
```

This single command:
- Starts PostgreSQL via Docker Compose
- Runs Prisma migrations
- Starts the backend (http://localhost:3001)
- Starts the frontend (http://localhost:5173)

### 3. Start the BSC Fork (for on-chain features)

In a separate terminal:

```bash
pnpm contracts:fork:bsc
```

Then deploy all contracts to the fork:

```bash
pnpm contracts:deploy:fork
```

This outputs all contract addresses. Copy them into your env files:

```bash
# packages/backend/.env
RPC_URL=http://localhost:8545
FACTORY_ADDRESS=0x...    # from deploy output
FEE_REGISTRY_ADDRESS=0x... # from deploy output

# packages/frontend/.env
VITE_API_URL=http://localhost:3001
VITE_FACTORY_ADDRESS=0x...  # from deploy output
```

The deploy script also saves all addresses to `packages/contracts/deployments/fork-latest.json`.

### 4. Connect MetaMask

Add a custom network in MetaMask:
- **RPC URL**: `http://localhost:8545`
- **Chain ID**: `31337` (Hardhat)
- **Currency**: ETH

The frontend automatically switches MetaMask to the Hardhat chain (31337) on connect in development mode. In production, it uses BSC Mainnet (56).

Import a test account with pre-seeded tokens (the deploy script funds `0xBcd4042DE499D14e55001CcbB24a551F3b954096` with 150 USDT + 1 WBNB):
```
Private Key (Hardhat account #5): 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
```

Navigate to http://localhost:5173 and connect your wallet.

---

## Monorepo Structure

```
strategy-builder-v2/
├── packages/
│   ├── contracts/     # Hardhat 3 — Solidity smart contracts
│   ├── backend/       # NestJS — REST API + Prisma + PostgreSQL
│   └── frontend/      # Vite + React + wagmi — SPA
├── docker-compose.yml # PostgreSQL
└── scripts/dev.mjs    # Unified dev startup
```

| Package | Port | Tech |
|---------|------|------|
| `contracts` | 8545 (fork node) | Hardhat 3, Solidity 0.8.28, ethers v6 |
| `backend` | 3001 | NestJS 11, Prisma 6, PostgreSQL 16 |
| `frontend` | 5173 | Vite 6, React 19, wagmi 2, Tailwind 4 |

---

## Commands

### Root (workspace scripts)

```bash
# Development
pnpm dev                        # Start DB + backend + frontend
pnpm db:up                      # Start PostgreSQL only
pnpm db:down                    # Stop PostgreSQL
pnpm db:migrate                 # Run Prisma migrations

# Contracts
pnpm contracts:compile          # Compile contracts + extract ABIs to frontend
pnpm contracts:test             # Run contract tests
pnpm contracts:clean            # Clean artifacts
pnpm contracts:fork:bsc         # Start BSC mainnet fork on localhost:8545
pnpm contracts:deploy:fork      # Deploy all contracts to the fork
pnpm contracts:deploy:testnet   # Deploy to BSC Testnet (Ignition)
pnpm contracts:deploy:mainnet   # Deploy to BSC Mainnet (Ignition)

# Backend
pnpm backend:dev                # Start in watch mode
pnpm backend:build              # Production build
pnpm backend:test               # Unit + integration tests (Jest)
pnpm backend:test:e2e           # E2E tests

# Frontend
pnpm frontend:dev               # Vite dev server
pnpm frontend:build             # Production build (tsc + vite)
pnpm frontend:test              # Unit tests (Vitest)
```

### From `packages/contracts/`

```bash
npx hardhat compile                               # Compile all
npx hardhat test                                   # Run all tests
npx hardhat test test/StrategyBuilderVault.ts      # Single file
npx hardhat test --grep "deposit"                  # Pattern match
npx hardhat node --network bscFork                 # Start fork node (Chain ID 31337)
npx hardhat run --network localhost scripts/deploy-fork.ts  # Deploy to running fork
```

---

## Environment Variables

### `packages/backend/.env`

```bash
# Environment (must be 'development' for local fork RPC balance reads)
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://pecunity:pecunity@localhost:5432/pecunity

# JWT (SIWE auth)
JWT_SECRET=change-me-to-a-random-256-bit-hex-value
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY_DAYS=7

# Frontend (CORS + SIWE domain)
FRONTEND_URL=http://localhost:5173

# SIWE nonce TTL
NONCE_EXPIRY_SECONDS=300

# Server
PORT=3001

# On-chain (set after deploying to fork)
RPC_URL=http://localhost:8545
FACTORY_ADDRESS=
FEE_REGISTRY_ADDRESS=

# Portfolio (optional — not needed for local fork, only production)
ALCHEMY_API_KEY=
```

### `packages/frontend/.env`

```bash
VITE_API_URL=http://localhost:3001
VITE_FACTORY_ADDRESS=
```

### `packages/contracts/.env`

```bash
# BSC RPC (needs archive node support for forking)
BSC_MAINNET_RPC_URL=https://bsc-mainnet.public.blastapi.io
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# Default Hardhat account #0 — only for local testing!
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BSCSCAN_API_KEY=
```

> **Note:** The BSC fork requires an archive-capable RPC. Public RPCs like `bsc-dataseed.binance.org` will fail with "missing trie node". Use BlastAPI, Alchemy, or QuickNode.

---

## Local Development Workflow

### Full-stack with BSC Fork

```bash
# Terminal 1: Database + Backend + Frontend
pnpm dev

# Terminal 2: BSC Fork
pnpm contracts:fork:bsc

# Terminal 3: Deploy contracts (once, after fork starts)
pnpm contracts:deploy:fork
# → Copy addresses to packages/backend/.env and packages/frontend/.env
# → Restart backend to pick up new env vars
```

### Backend-only (no chain)

```bash
pnpm db:up
pnpm db:migrate
pnpm backend:dev
```

### Contracts-only

```bash
pnpm contracts:compile
pnpm contracts:test
```

### After Modifying Contracts

```bash
pnpm contracts:compile   # Recompile + auto-extract ABIs to frontend
```

The compile step runs `scripts/extract-abis.js` which generates typed `as const` ABI files in `packages/frontend/src/lib/abis/`.

---

## Architecture Overview

### Smart Contracts

```
StrategyBuilderVaultFactory → deploys ERC1967Proxy vaults via CREATE2
    ↓
StrategyBuilderVault (impl) → automations, context, deposit/withdraw
    ↓
FeeRegistry → deposit/withdraw fees (flat BPS) + executor gas compensation
```

Vault automations are directed graphs of **Conditions** (staticcall, read-only) and **Actions** (delegatecall, stateless). Example contracts: `TokenBalanceCondition`, `IntervalCondition`, `TimerCondition`, `ERC20TransferAction`, `FeeDepositAction`.

### Backend API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /auth/nonce` | Public | SIWE nonce |
| `POST /auth/verify` | Public | SIWE signature verification → JWT |
| `POST /auth/refresh` | Public | Refresh access token |
| `GET /me` | JWT | Current user |
| `POST /vaults` | JWT | Register vault (on-chain validated) |
| `GET /vaults` | JWT | List user's vaults |
| `PATCH /vaults/:address` | JWT + Owner | Update label |
| `GET /vaults/overview` | JWT | All vaults with totalValueUsd |
| `GET /vaults/:address/portfolio` | JWT + Owner | Token positions + USD values |
| `POST /vaults/:address/events` | JWT + Owner | Record deposit/withdraw event |
| `GET /vaults/:address/history` | JWT + Owner | Paginated event history |
| `GET /fees` | Public | depositFeeBps + withdrawFeeBps |
| `GET /tokens/accepted` | Public | Accepted tokens with metadata |
| `GET /errors/contract-errors` | Public | Solidity error → message map |
| `GET /health` | Public | Health check |

### Frontend Pages

| Route | Description |
|-------|-------------|
| `/connect` | Wallet connection + SIWE sign-in |
| `/dashboard` | Vault table with USD values, create vault CTA |
| `/vault/create` | Multi-step wizard (label → token → fees → TX → deposit) |
| `/vault/:address` | Portfolio, deposit/withdraw forms, transaction history |

---

## Testing

```bash
# All tests
pnpm contracts:test && pnpm backend:test && pnpm frontend:test

# Individual
pnpm contracts:test                    # Hardhat/Mocha (Solidity)
pnpm backend:test                      # Jest (NestJS)
pnpm frontend:test                     # Vitest (React)
```

---

## Deploy Script Parameters

The fork deploy script (`pnpm contracts:deploy:fork`) accepts optional env vars:

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPOSIT_FEE_BPS` | `100` | Deposit fee in basis points (1%) |
| `WITHDRAW_FEE_BPS` | `50` | Withdraw fee in basis points (0.5%) |

Example:
```bash
DEPOSIT_FEE_BPS=200 WITHDRAW_FEE_BPS=100 pnpm contracts:deploy:fork
```

The deploy script also seeds test wallet `0xBcd4042DE499D14e55001CcbB24a551F3b954096` with 150 USDT + 1 WBNB via whale impersonation.

Accepted tokens configured on the fork:
- **USDT**: `0x55d398326f99059fF775485246999027B3197955` (18 decimals)
- **WBNB**: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` (18 decimals)

### Important Notes

- **Production build profile required**: The deploy script compiles with `--build-profile production` (optimizer enabled). Without the optimizer, vault proxy deployment fails with StackOverflow.
- **Multicall disabled on Hardhat**: The frontend disables viem's multicall batching on chain 31337 to avoid StackOverflow from multicall3 contract simulation.
- **`NODE_ENV=development`**: Must be set in `packages/backend/.env` for the portfolio service to read balances via local RPC instead of Alchemy API.
