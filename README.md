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

> **Order matters.** The on-chain deployment produces the contract addresses that
> the backend and frontend read from their `.env` files. So the flow is:
> **fork → deploy → fill in the `.env`s → start the services.** Starting the
> services before the addresses exist leaves them misconfigured.

### 2. Start the BSC Fork

On-chain features run against a local BSC mainnet fork. In a dedicated terminal:

```bash
pnpm contracts:fork:bsc
```

This runs a Hardhat node forked from BSC mainnet on `http://localhost:8545`
(Chain ID 31337). Leave it running.

> The fork requires an archive-capable RPC (BlastAPI, Alchemy, QuickNode) set as
> `BSC_MAINNET_RPC_URL` in `packages/contracts/.env`. Public RPCs like
> `bsc-dataseed.binance.org` fail with "missing trie node".

### 3. Deploy Contracts to the Fork

Once the fork node is up, deploy the full system:

```bash
pnpm contracts:deploy:fork
```

This deploys the FeeRegistry, vault factory + implementation, a MockPriceOracle,
the example conditions/actions, **and the two DeFi registries + nine DeFi action
contracts** (Aave V3 + PancakeSwap V3); configures fees and gas compensation; and
seeds the test wallet. It prints every address and also saves them to
`packages/contracts/deployments/fork-latest.json`.

> Already have the base system deployed and only need to add the DeFi actions?
> Run `npx hardhat run --network localhost scripts/deploy-defi-actions.ts` — it
> deploys just the registries + nine actions and **merges** their addresses into
> `fork-latest.json` (leaving the factory and existing vaults untouched), then
> re-seed with `pnpm --filter backend prisma:seed`.

Copy the printed addresses into your env files **before** starting the services:

```bash
# packages/backend/.env
RPC_URL=http://localhost:8545
FACTORY_ADDRESS=0x...        # from deploy output
FEE_REGISTRY_ADDRESS=0x...   # from deploy output

# packages/frontend/.env
VITE_API_URL=http://localhost:3001
VITE_FACTORY_ADDRESS=0x...   # from deploy output
```

### 4. Start the Services

With the `.env` files filled in, start DB + backend + frontend:

```bash
pnpm dev
```

This single command:
- Starts PostgreSQL via Docker Compose
- Runs Prisma migrations
- Starts the backend (http://localhost:3001)
- Starts the frontend (http://localhost:5173)

> Start the services **after** the deploy so they pick up the contract addresses.
> If you change the `.env` files later, restart `pnpm dev`.

### 5. Connect MetaMask

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
│   ├── frontend/      # Vite + React + wagmi — SPA
│   ├── shared/        # Framework-free helpers (encode-boundary, validation, step-roles)
│   └── mcp/           # MCP server (stdio) — control your vaults via an AI assistant
├── docker-compose.yml # PostgreSQL
└── scripts/dev.mjs    # Unified dev startup
```

| Package | Port | Tech |
|---------|------|------|
| `contracts` | 8545 (fork node) | Hardhat 3, Solidity 0.8.28, ethers v6 |
| `backend` | 3001 | NestJS 11, Prisma 6, PostgreSQL 16 |
| `frontend` | 5173 | Vite 6, React 19, wagmi 2, Tailwind 4 |
| `shared` | — | TypeScript (pure helpers), Vitest |
| `mcp` | stdio | MCP SDK, viem/ethers/siwe/keytar, Vitest |

---

## Commands

### Root (workspace scripts)

```bash
# Development
pnpm dev                        # Start DB + backend + frontend
pnpm db:up                      # Start PostgreSQL only
pnpm db:down                    # Stop PostgreSQL
pnpm db:migrate                 # Run Prisma migrations
pnpm --filter backend prisma:seed  # (Re)seed StepTypes from fork-latest.json

# Contracts
pnpm contracts:compile          # Compile contracts + extract ABIs to frontend
pnpm contracts:test             # Run contract tests
pnpm contracts:clean            # Clean artifacts
pnpm contracts:fork:bsc         # Start BSC mainnet fork on localhost:8545
pnpm contracts:deploy:fork      # Deploy all contracts to the fork (+ MockPriceOracle + gas config)
pnpm contracts:execute:fork     # Keeper: run all externally-executable automations
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

# Shared
pnpm shared:build               # Build framework-free helpers (encode-boundary, validation, step-roles)

# MCP server (local, stdio)
pnpm --filter mcp build         # Build the server
pnpm --filter mcp test          # Unit tests (Vitest)
pnpm --filter mcp run init      # Onboarding: store the keystore password in the OS keychain
pnpm --filter mcp inspect       # Launch the MCP Inspector against the built server
```

### From `packages/contracts/`

```bash
npx hardhat compile                               # Compile all
npx hardhat test                                   # Run all tests
npx hardhat test test/StrategyBuilderVault.ts      # Single file
npx hardhat test --grep "deposit"                  # Pattern match
npx hardhat node --network bscFork                 # Start fork node (Chain ID 31337)
npx hardhat run --network localhost scripts/deploy-fork.ts          # Deploy the full system to a running fork
npx hardhat run --network localhost scripts/deploy-defi-actions.ts  # Incremental: deploy only the DeFi registries + 9 actions
npx hardhat run --network localhost scripts/execute-automations.ts  # Keeper: execute due automations
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

# On-chain (set after deploying to fork). RPC_URL + FEE_REGISTRY_ADDRESS are
# also used by the execution indexer.
RPC_URL=http://localhost:8545
FACTORY_ADDRESS=
FEE_REGISTRY_ADDRESS=

# Execution indexer (PEC-219) — all optional, code defaults shown.
# Set INDEXER_CONFIRMATIONS=0 on the local fork (no reorgs, idle clock).
INDEXER_CONFIRMATIONS=0          # mainnet: ~5 for reorg safety
# INDEXER_ENABLED=true           # "false" keeps the loop dormant (e.g. tests)
# INDEXER_MAX_RANGE=2000         # max getLogs window (adaptive-halved on RPC limit)
# INDEXER_POLL_INTERVAL_MS=6000  # poll cadence
# INDEXER_START_BLOCK=           # backfill from (defaults to min vault block, else head)

# Keeper failure ingest (PEC-219) — shared secret for POST /internal/executions/failures.
# Must match the keeper's KEEPER_INGEST_SECRET. Unset = endpoint rejects all calls.
KEEPER_INGEST_SECRET=

# Portfolio (optional — not needed for local fork, only production)
ALCHEMY_API_KEY=
```

### `packages/frontend/.env`

```bash
VITE_API_URL=http://localhost:3001
VITE_FACTORY_ADDRESS=
# Optional — PancakeSwap V3 factory for the Swap node's pool-existence check.
# Defaults to the live BSC factory; only override for a non-BSC fork.
VITE_PCS_FACTORY_ADDRESS=
```

### `packages/contracts/.env`

```bash
# BSC RPC (needs archive node support for forking)
BSC_MAINNET_RPC_URL=https://bsc-mainnet.public.blastapi.io
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

# Default Hardhat account #0 — only for local testing!
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BSCSCAN_API_KEY=

# Keeper (scripts/execute-automations.ts)
FACTORY_ADDRESS=            # defaults to deployments/fork-latest.json
EXECUTOR_PRIVATE_KEY=       # external (non-owner) executor; defaults to signer #0
SKIP_TIME_SYNC=            # 1 = don't advance the fork clock to wall-clock
# Failure reporting (PEC-219) — must match the backend's KEEPER_INGEST_SECRET;
# empty secret disables reporting.
KEEPER_INGEST_URL=http://localhost:3001
KEEPER_INGEST_SECRET=
```

> **Note:** The BSC fork requires an archive-capable RPC. Public RPCs like `bsc-dataseed.binance.org` will fail with "missing trie node". Use BlastAPI, Alchemy, or QuickNode.

---

## Local Development Workflow

### Full-stack with BSC Fork

Run in order — the services need the addresses produced by the deploy:

```bash
# Terminal 1: BSC Fork
pnpm contracts:fork:bsc

# Terminal 2: Deploy contracts (once the fork is up)
pnpm contracts:deploy:fork
# → Copy addresses into packages/backend/.env and packages/frontend/.env

# Terminal 3: Database + Backend + Frontend (after the .env files are filled)
pnpm dev
```

> If the fork is already running and you only changed env vars, restart `pnpm dev`
> so the backend/frontend re-read them.

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

Vault automations are directed graphs of **Conditions** (staticcall, read-only) and **Actions** (delegatecall, stateless). Example steps: `TokenBalanceCondition`, `IntervalCondition`, `TimerCondition`, `ERC20TransferAction`, `FeeDepositAction`.

#### DeFi Actions

The vault also runs real on-chain DeFi via nine stateless action contracts (PEC-218), wired through per-protocol address registries and a shared `ActionLib`:

```
AaveV3Registry ──────────┐         PancakeSwapV3Registry ──────────┐
  (PoolAddressesProvider, │           (SwapRouter, NPM, Factory)     │
   caches Pool, runtime   │                                          │
   oracle)                │                                          │
  ↓                       │          ↓                               │
  AaveV3 Supply / Withdraw / Borrow / Repay   PancakeSwapV3 Swap / Mint / Increase / Decrease / Collect
                          └──────── ActionLib (amount modes, 18-dec normalization, inverse-HF math) ───────┘
```

- **Aave V3** — Supply / Withdraw / Borrow / Repay with a 4-mode amount model: `FIXED`, `FROM_SLOT`, `MAX_AVAILABLE` (per-action protocol max), `TARGET_HF` (move the position to a target health factor; wrong-direction is a no-op). Borrow/Repay use variable rate; approvals reset to 0.
- **PancakeSwap V3** — Swap (single-hop, ships `amountOutMinimum = 0` by design), LP Mint (explicit price range or preset ±% width, position NFT held by the vault via `onERC721Received`), Increase / Decrease (bundles `decreaseLiquidity` + `collect`) / Collect.
- Registries are **immutable** (no owner/setters); actions hold the registry as an `immutable` and call protocols via regular `call`. Curated per-protocol token lists are DB-backed (`/tokens?protocol=…`). All nine actions are well under the 24 KB EIP-170 limit.

### Execution Monitoring (PEC-219)

Users see a full, real-time history of every automation run, deposit, and withdrawal — and *why* a run failed.

```
                 success runs (logs)                    failures (no logs!)
BSC fork/chain ──────────────────────▶ Indexer ──┐   Keeper ──▶ POST /internal/executions/failures
   AutomationExecuted / GasCompSettled  (poll      │  (reverts)        (shared-secret guard)
   Deposited / Withdrawn                 loop)     ▼                          ▼
                                       Postgres: Execution · VaultEvent · ExecutionFailure · IndexerCursor
                                                  │                          │
                                       WS /executions (per-vault rooms)   GET /vaults/:address/executions
                                                  └──────────▶ Frontend ◀────┘  (unified UNION, paginated)
```

- **Two ingestion channels.** A reverted execution emits **no log**, so it can't come from the chain. The backend **indexer** (ethers v6 poll loop) ingests *successes* + deposits/withdraws from logs; the public **keeper** reports *failures* (with the decoded revert reason) to a shared-secret-guarded ingest endpoint.
- **Indexer** — one address-less `getLogs` across all vault proxies per tick, gated on the known-vault set (reloaded each tick); a durable `IndexerCursor` resumes after restart; idempotent on `(txHash, logIndex)`; `gasCompUsd` frozen at write time. Tune via `INDEXER_*` env (see below).
- **Failures collapse** to one open `ExecutionFailure` per automation (`attemptCount++` on retry); the indexer sets `resolvedAt` — atomically with the success insert — when the automation next succeeds.
- **Real time** — a Socket.IO gateway (`/executions`, per-vault rooms `vault:<address>`) pushes new successes. Two auth layers (handshake JWT + per-vault ownership) make it the no-data-leak boundary. The UI toasts + refetches; while the socket is down it REST-polls, and a freshness indicator shows real indexer lag from `/indexer/status`.
- **Revert reasons** — the vault re-reverts `ActionExecutionFailed(stepIndex, reason)` / `ConditionCallFailed(stepIndex, reason)` carrying the original bytes; the backend decoder unwraps them to `Error(string)` / `Panic` / known custom errors, else `Step N: 0x<selector>`.

> **Fork gotcha:** an idle Hardhat fork never mines the confirmation blocks, so set `INDEXER_CONFIRMATIONS=0` in `packages/backend/.env` for local dev (the fork has no reorgs). Otherwise fresh deposits/executions stay "unconfirmed" and never appear.

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
| `GET /vaults/:address/executions` | JWT + Owner | Unified paginated history — success runs + deposits/withdraws + failures; filter with `?automationId=` (PEC-219) |
| `GET /indexer/status` | JWT | Indexer freshness: last processed block + its timestamp |
| `POST /internal/executions/failures` | Shared secret | Keeper reports a reverted execution (no JWT; `x-keeper-secret`) |
| `GET /vaults/:address/gas-deposit` | JWT + Owner | Gas-comp reserve, depositToken, minFeeDeposit |
| `GET /vaults/:address/context-slots` | JWT + Owner | Context slots + current on-chain values |
| `GET/POST /vaults/:address/automations` | JWT + Owner | List / create draft automation |
| `GET/PATCH/DELETE /vaults/:address/automations/:id` | JWT + Owner | Read / update / delete (DB-only) |
| `POST /vaults/:address/automations/:id/encode*` | JWT + Owner | Build calldata: `encode`, `encode-update`, `encode-toggle`, `encode-execute` |
| `GET /vaults/:address/automations/trigger-statuses` | JWT + Owner | Live trigger status per automation |
| `GET /fees` | Public | depositFeeBps + withdrawFeeBps |
| `GET /tokens/accepted` | Public | Accepted fee tokens with metadata |
| `GET /tokens?protocol=aave\|pancakeswap` | Public | Curated per-protocol token allowlist (address, symbol, decimals) |
| `GET /step-types` | Public | Available conditions/actions with `paramSchema` + `abiFragment` (drives the editor) |
| `GET /errors/contract-errors` | Public | Solidity error → message map |
| `GET /health` | Public | Health check |

### Frontend Pages

| Route | Description |
|-------|-------------|
| `/connect` | Wallet connection + SIWE sign-in |
| `/dashboard` | Vault table with USD values, create vault CTA |
| `/vault/create` | Multi-step wizard (label → token → fees → TX → deposit) |
| `/vault/:address` | Portfolio, deposit/withdraw, automation list, context view, gas-reserve card (deposit + minFeeDeposit), **live execution history** (success / failed / resolved + deposits/withdraws, gas + USD, BscScan links, freshness indicator) |
| `/vault/:address/automation/:id/edit` | React-Flow automation editor: graph, context variables, auto-save, deploy dialog |

### MCP Server (`packages/mcp`)

A local **stdio** MCP server that lets an AI assistant (e.g. Claude Desktop) read **and
operate** the vaults of **one** wallet. It reads an encrypted keystore (password from the
OS keychain), derives the owner address, and authenticates with the backend via a
server-signed **SIWE** message — then every tool is bound to that owner (foreign-vault
access is impossible). It reuses the **shared** encode-boundary so AI-built graphs pass the
same validation as the web UI.

**Tools:**
- *Read (confirmation-free, owner-isolated):* `whoami`, `list_vaults`, `get_vault`,
  `get_portfolio`, `list_automations`, `get_executions`, `get_positions`, `get_performance`,
  `get_value_history`.
- *Catalog & recipes:* `list_step_types`, `describe_step_type`, `list_recipes`.
- *AI-building:* `propose_automation` (build + validate + intent cross-check → draft id, no
  signing), `deploy_automation` (signs exactly the stored draft).
- *Writing / money-moving (behind a server-enforced confirm gate + protections):*
  `create_vault`, `deposit`, `withdraw`, `simulate_action` (dry-run), `top_up_gas_deposit`,
  `set_min_fee_deposit`, `set_automation_active`.

**Security model:** signing/sensitive actions go through a **PolicyGate** confirm gate
(MCP elicitation or a localhost one-time-token page; timeout = hard fail; not forgeable via
the prompt). Plus an **address allowlist** for money destinations, **capability opt-in** for
sensitive steps, a per-action **max amount**, a **read-only** mode, and an append-only
**audit log**. Writing tools are only active when `PECUNITY_RPC_URL` (and, for `create_vault`,
`PECUNITY_FACTORY_ADDRESS`) are set.

Setup, Claude Desktop registration, env vars, and the full security model: see
[`packages/mcp/README.md`](packages/mcp/README.md).

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

The script also deploys a **MockPriceOracle** and calls `setGasConfig` (oracle, native=WBNB, executorMarkupBps=1000, overhead=50k, maxGasPrice=0; prices WBNB=$600, USDT=$1), so executor gas compensation works on the fork. Oracle address + gas config are written to `deployments/fork-latest.json` (`PriceOracle`, `config.gasComp`).

### Keeper (external execution)

`pnpm contracts:execute:fork` runs every externally-executable automation (active, public, trigger met) from an external account and logs gas compensation. It first mines a block at wall-clock time so an idle fork's `block.timestamp` matches real time. Env: `EXECUTOR_PRIVATE_KEY`, `FACTORY_ADDRESS`, `SKIP_TIME_SYNC=1`.

It also **reports failures** (PEC-219): a reverting `executeAutomation` or a reverting `isTriggerMet` check is POSTed to the backend ingest endpoint so failures (which emit no logs) still appear in the user's history. Set `KEEPER_INGEST_SECRET` (matching the backend) to enable it; `KEEPER_INGEST_URL` defaults to `http://localhost:3001`. With no secret, reporting is silently skipped.

> For external execution to be compensated, the vault needs a gas reserve: set a positive `minFeeDeposit` (gas-reserve card on the detail page) and either deposit directly (`depositFees`) or include a `FeeDepositAction` step. With an empty reserve, execution reverts `InsufficientFeeDeposit`.

### Important Notes

- **Production build profile required**: The deploy script compiles with `--build-profile production` (optimizer enabled). Without the optimizer, vault proxy deployment fails with StackOverflow.
- **Re-seed StepTypes after a fresh deploy**: `pnpm --filter backend prisma:seed` — otherwise newly built automations encode the previous deploy's (now dead) condition/action addresses and revert. The seed reads addresses from `fork-latest.json`, seeds one row per step (3 conditions + 2 example actions + 9 DeFi actions) and the per-protocol token lists, and **skips any action still at `address(0)`** (not yet deployed) — so deploy the contracts first, then seed.
- **Multicall disabled on Hardhat**: The frontend disables viem's multicall batching on chain 31337 to avoid StackOverflow from multicall3 contract simulation.
- **`NODE_ENV=development`**: Must be set in `packages/backend/.env` for the portfolio service to read balances via local RPC instead of Alchemy API.
- **Fork clock**: an idle fork's `block.timestamp` lags real time; the keeper script syncs it. Trigger badges in the UI use wall-clock, so they can read "ready" before the chain agrees.

### Troubleshooting

- **Editor shows only some action nodes**: the new DeFi actions aren't deployed, so their `StepType` rows collapsed onto the `address(0)` placeholder. Deploy them (`scripts/deploy-defi-actions.ts` or a full `deploy-fork.ts`) and re-seed.
- **Keeper skips an automation with `[id] skip: trigger not met` even though it should fire**: the automation's on-chain steps were encoded against a **previous deploy's condition/action addresses** (the `StepType` table drifted from `fork-latest.json` and wasn't re-seeded). The stale condition's `check()` reverts → `isTriggerMet` is false. **Fix:** re-seed `StepType`s (clear the table first so old rows don't linger as duplicates), then **re-deploy the automation** in the editor (re-seeding alone can't fix the addresses already baked into the deployed steps). To avoid the drift, prefer the incremental `deploy-defi-actions.ts` over a full re-deploy on an existing setup.
- **`InsufficientFeeDeposit` on external execution**: the vault's gas reserve is empty — set a positive `minFeeDeposit` (gas-reserve card) and fund it via `depositFees` or a `FeeDepositAction` step.
- **A deposit/execution never appears in the history (on the fork)**: the indexer only processes blocks `≤ head − INDEXER_CONFIRMATIONS`, but an **idle fork never mines** the confirmation blocks, so fresh events stay "unconfirmed" forever. **Fix:** set `INDEXER_CONFIRMATIONS=0` in `packages/backend/.env` and restart the backend (the fork has no reorgs). Alternatively mine blocks (`evm_mine`) so the head advances past the event + N. Verify with `GET /indexer/status` (does the cursor advance past the event's block?).
- **Failures don't show up**: the keeper is the only source of failures (reverts emit no logs). Ensure the keeper runs with `KEEPER_INGEST_SECRET` set to the same value as the backend; otherwise failure reporting is skipped.
