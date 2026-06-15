# Research: Strategy Builder V2 -- Full-Stack Architecture

> **Expiry:** Delete after initial MVP sprint is complete (~Q3 2026). APIs change. Do not let this file survive longer than one sprint.
> **Docs source:** Context7 (Prisma, NestJS, Vite, Account Kit), Aave GitHub, BscScan, PancakeSwap docs, Goldsky docs, TheGraph docs, web research May 2026.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Backend: NestJS + Prisma + PostgreSQL](#2-backend-nestjs--prisma--postgresql)
3. [Frontend: Vite + React](#3-frontend-vite--react)
4. [Authentication: Alchemy Account Kit](#4-authentication-alchemy-account-kit)
5. [Blockchain Indexing: TheGraph Subgraph + Goldsky](#5-blockchain-indexing-thegraph-subgraph--goldsky)
6. [DeFi Protocols: AaveV3 + PancakeSwap V3 on BSC](#6-defi-protocols-aavev3--pancakeswap-v3-on-bsc)
7. [CI/CD: GitHub Actions + Docker + Hetzner](#7-cicd-github-actions--docker--hetzner)
8. [Project Structure: pnpm Monorepo](#8-project-structure-pnpm-monorepo)
9. [Version Summary](#9-version-summary)
10. [Wagmi v2 + Viem v2 Contract Interactions (PEC-215)](#10-wagmi-v2--viem-v2-contract-interactions-pec-215)
11. [Token Balances & Prices: Alchemy API + DeFiLlama (Backend)](#11-token-balances--prices-alchemy-api--defillama-backend)
12. Visual Graph Editor (PEC-216) / Conditions (PEC-217) — see `## 12` sections inline
13. [PEC-219 Execution & Monitoring — Overview & Architecture Decision](#13-pec-219-execution--monitoring--overview--architecture-decision)
14. [PEC-219 Path A — Goldsky Subgraph (deltas over §5)](#14-pec-219-path-a--goldsky-subgraph-deltas-over-5)
15. [PEC-219 Path B — Backend Event Indexing with ethers v6](#15-pec-219-path-b--backend-event-indexing-with-ethers-v6-no-subgraph-alternative)
16. [PEC-219 Real-Time Updates — NestJS WebSockets + Socket.IO](#16-pec-219-real-time-updates--nestjs-websockets--socketio-shared-by-path-a--b)
17. [Vault-Cockpit — DeFi-Positionen-READ + Wert-/Performance-Historie](#17-vault-cockpit--defi-positionen-read--wert-performance-historie-epic-vault-cockpit-epicmd)

---

## 1. Architecture Overview

```
                          +------------------+
                          |   Vite + React   |
                          |   (Frontend)     |
                          |   Account Kit    |
                          +--------+---------+
                                   |
                          REST API + WebSocket
                                   |
                          +--------+---------+
                          |    NestJS        |
                          |    (Backend)     |
                          |    Prisma ORM    |
                          +---+----+----+----+
                              |    |    |
                   +----------+    |    +----------+
                   |               |               |
            +------+------+  +----+----+  +-------+--------+
            | PostgreSQL  |  | Goldsky |  | BSC Blockchain |
            | (Database)  |  | Subgraph|  | (Smart Contracts)|
            +-------------+  +---------+  +----------------+
```

**Data flow:**
- Frontend connects wallet via Account Kit (social login or MetaMask)
- Backend verifies wallet ownership via SIWE (Sign-In with Ethereum)
- User creates strategies via REST API -> stored in PostgreSQL
- Backend constructs on-chain transactions -> sent to BSC via user's wallet
- Subgraph indexes on-chain events (vault creation, executions, fees)
- Frontend queries Subgraph for historical data + backend for user-specific data

---

## 2. Backend: NestJS + Prisma + PostgreSQL

### Why NestJS (over Express/Fastify)

- Opinionated module/controller/service structure prevents monolithic sprawl
- Built-in WebSocket gateways (decorator-driven) for real-time automation status
- Guards pattern is ideal for wallet signature auth (`WalletAuthGuard`)
- Official Prisma recipe with injectable `PrismaService`
- `nest g resource` scaffolds full CRUD in one command
- Swagger/OpenAPI generation via decorators
- Can switch to Fastify HTTP adapter later if needed (`@nestjs/platform-fastify`)

### Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

// ── Users ──────────────────────────────────────

model User {
  id            String   @id @default(cuid())
  walletAddress String   @unique @db.VarChar(42)
  nonce         String   @default(cuid())
  displayName   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  vaults Vault[]

  @@index([walletAddress])
}

// ── Vaults ─────────────────────────────────────

model Vault {
  id              String   @id @default(cuid())
  address         String   @unique @db.VarChar(42)
  chainId         Int      @default(56)
  ownerAddress    String   @db.VarChar(42)
  depositToken    String?  @db.VarChar(42)
  label           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  createdAtBlock  BigInt
  txHash          String   @db.VarChar(66)

  owner       User         @relation(fields: [ownerAddress], references: [walletAddress])
  automations Automation[]
  executions  Execution[]
  feeEvents   FeeEvent[]

  @@index([ownerAddress])
  @@index([chainId])
}

// ── Automations ────────────────────────────────

enum StepType {
  CONDITION
  ACTION
}

model Automation {
  id           String  @id @default(cuid())
  onChainId    Int
  vaultId      String
  active       Boolean @default(true)
  ownerOnly    Boolean @default(false)
  label        String?
  description  String?
  steps        Json    @db.JsonB
  context      Json?   @db.JsonB

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  vault      Vault       @relation(fields: [vaultId], references: [id], onDelete: Cascade)
  executions Execution[]

  @@unique([vaultId, onChainId])
  @@index([vaultId])
  @@index([active])
  @@index([steps], type: Gin)
}

// ── Executions ─────────────────────────────────

enum ExecutionStatus {
  SUCCESS
  REVERTED
  TRIGGER_NOT_MET
}

model Execution {
  id              String          @id @default(cuid())
  automationId    String
  vaultId         String
  executorAddress String          @db.VarChar(42)
  txHash          String          @db.VarChar(66)
  blockNumber     BigInt
  blockTimestamp   DateTime
  gasUsed         BigInt
  gasCompAmount   String?
  gasCompToken    String?         @db.VarChar(42)
  status          ExecutionStatus
  errorMessage    String?

  createdAt DateTime @default(now())

  automation Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)
  vault      Vault      @relation(fields: [vaultId], references: [id], onDelete: Cascade)

  @@index([automationId])
  @@index([vaultId])
  @@index([executorAddress])
  @@index([blockTimestamp])
  @@index([txHash])
}

// ── Fee Events ─────────────────────────────────

enum FeeEventType {
  DEPOSIT_FEE
  WITHDRAW_FEE
  GAS_COMPENSATION
  FEE_DEPOSIT
  FEE_WITHDRAWAL
}

model FeeEvent {
  id             String       @id @default(cuid())
  vaultId        String
  eventType      FeeEventType
  token          String       @db.VarChar(42)
  amount         String
  feeBps         Int?
  txHash         String       @db.VarChar(66)
  blockNumber    BigInt
  blockTimestamp  DateTime

  createdAt DateTime @default(now())

  vault Vault @relation(fields: [vaultId], references: [id], onDelete: Cascade)

  @@index([vaultId])
  @@index([eventType])
  @@index([token])
  @@index([blockTimestamp])
}
```

### Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Blockchain addresses | `String @db.VarChar(42)` | Human-readable, directly usable in ethers.js, always checksum on write via `ethers.getAddress()` |
| uint256 values | `String` (decimal) | PostgreSQL `bigint` max ~9.2x10^18, Solidity uint256 max ~1.15x10^77. Token amounts with 18 decimals overflow `bigint` |
| Block numbers, gas | `BigInt` | Fits in 8 bytes, Prisma BigInt maps to PostgreSQL `bigint` |
| Strategy steps | `Json @db.JsonB` | Always read/written as unit, JSONB supports GIN indexes, avoids polymorphic table complexity |

### Connection Pooling (Production)

```bash
# .env
DATABASE_URL="postgres://USER:PASSWORD@HOST:6432/strategy_builder?pgbouncer=true"
DIRECT_URL="postgres://USER:PASSWORD@HOST:5432/strategy_builder"
```

`DIRECT_URL` for Prisma CLI migrations; pooled `DATABASE_URL` for runtime.

### Migration Workflow

```bash
npx prisma migrate dev --name init    # Dev: create + apply
npx prisma migrate deploy             # Prod: apply pending
npx prisma generate                   # Regenerate client
```

---

## 3. Frontend: Vite + React

### Why Vite (over Next.js)

- **DeFi dApps are inherently client-side.** Wallet connection, transaction signing, chain state all live in the browser. Every Next.js component touching wallet state needs `'use client'`, negating SSR benefits.
- **SEO irrelevant.** App is behind wallet authentication.
- **Hetzner deployment is trivial.** `npm run build` -> `dist/` folder -> nginx serves static files. No Node.js process needed.
- **Simpler mental model.** No server/client component confusion, no hydration mismatches.

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```

### Environment Variables

```typescript
// vite-env.d.ts
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_CHAIN_ID: string;
  readonly VITE_SUBGRAPH_URL: string;
  readonly VITE_ALCHEMY_API_KEY: string;
}
```

### Key Frontend Libraries

| Library | Version | Purpose |
|---|---|---|
| `vite` | ^7.0 | Build tool |
| `react` / `react-dom` | ^19.1 | UI library |
| `react-router` | ^7.x | Client-side routing |
| `@tanstack/react-query` | ^5.x | Data fetching / caching |
| `@account-kit/react` | v4 | Wallet connection + auth |
| `@account-kit/infra` | v4 | Chain config + transport |
| `@xyflow/react` | ^12.x | Visual automation graph builder |
| `tailwindcss` | ^4.x | Styling |
| `zod` | ^3.x | Shared validation schemas |

---

## 4. Authentication: Alchemy Account Kit

### Overview

Account Kit v4 provides ERC-4337 smart accounts + embedded wallets. Users can log in via social login (creates smart account) or connect external wallets like MetaMask (EOA). **BSC is officially supported** (`bsc` chain constant from `@account-kit/infra`).

### Setup

```typescript
// config.ts
import { bsc, alchemy } from "@account-kit/infra";
import { AlchemyAccountsUIConfig, createConfig } from "@account-kit/react";
import { QueryClient } from "@tanstack/react-query";

const uiConfig: AlchemyAccountsUIConfig = {
  illustrationStyle: "linear",
  auth: {
    sections: [
      [{ type: "email" }],
      [
        { type: "social", authProviderId: "google", mode: "popup" },
        { type: "social", authProviderId: "apple", mode: "popup" },
      ],
      [{ type: "passkey" }],
      [{ type: "external_wallets" }],
    ],
    addPasskeyOnSignup: false,
  },
};

export const config = createConfig(
  {
    transport: alchemy({ apiKey: import.meta.env.VITE_ALCHEMY_API_KEY }),
    chain: bsc,
    ssr: false,
    sessionConfig: { expirationTimeMs: 1000 * 60 * 60 },
  },
  uiConfig
);

export const queryClient = new QueryClient();
```

### Provider Wrapper

```tsx
import { AlchemyAccountProvider } from "@account-kit/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { config, queryClient } from "./config";

export default function App({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AlchemyAccountProvider config={config} queryClient={queryClient}>
        {children}
      </AlchemyAccountProvider>
    </QueryClientProvider>
  );
}
```

### Authentication Flows

| Method | Account Type | User Experience |
|---|---|---|
| Email OTP | Smart Account (SCA) | Enter email -> verify OTP -> wallet auto-created |
| Google/Apple | Smart Account (SCA) | OAuth popup -> wallet auto-created |
| Passkey | Smart Account (SCA) | Biometric prompt -> wallet auto-created |
| MetaMask | EOA | Standard wallet connection |

### Key React Hooks

| Hook | Purpose |
|---|---|
| `useAuthenticate()` | Trigger email/passkey/social auth |
| `useConnectedUser()` | Get connected user (EOA or SCA), address, type |
| `useAccount()` | Get smart account address + loading state |
| `useSmartWalletClient()` | Send transactions (SCA only, `undefined` for EOA) |
| `useSignMessage()` | Sign arbitrary messages |

### Smart Account vs EOA

| Aspect | Smart Account (SCA) | EOA (MetaMask) |
|---|---|---|
| `useConnectedUser().type` | `"sca"` | `"eoa"` |
| Gas sponsorship | Yes (via Paymaster) | No |
| Batch transactions | Yes (native) | No |
| `useSmartWalletClient()` | Returns client | Returns `undefined` |

### Backend Verification (SIWE Pattern)

No server-side Account Kit SDK exists. Verify wallet ownership via signatures:

- **EOA:** Standard `ethers.verifyMessage(message, signature)` / `ecrecover`
- **Smart Account:** ERC-1271 `isValidSignature(messageHash, signature)` on-chain check

```typescript
// Backend: verify SIWE signature
const MAGIC_VALUE = "0x1626ba7e";
const contract = new Contract(smartAccountAddress, ERC1271_ABI, provider);
const result = await contract.isValidSignature(messageHash, signature);
const isValid = result === MAGIC_VALUE;
```

### BSC Limitations to Verify

1. Confirm LightAccount/ModularAccountV2 factory contracts deployed on BSC
2. Verify Alchemy Bundler availability on BSC in Dashboard
3. Test Gas Manager policy creation for BSC
4. Use `LightAccount` (not ModularAccountV2) -- EIP-7702 may not be supported on BSC

---

## 5. Blockchain Indexing: TheGraph Subgraph + Goldsky

### Schema Design

```graphql
type Factory @entity {
  id: Bytes!
  vaultCount: BigInt!
  vaults: [Vault!]! @derivedFrom(field: "factory")
}

type Vault @entity {
  id: Bytes!
  factory: Factory!
  owner: Bytes!
  index: BigInt!
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  automationCount: BigInt!
  automations: [Automation!]! @derivedFrom(field: "vault")
  deposits: [DepositEvent!]! @derivedFrom(field: "vault")
  withdrawals: [WithdrawalEvent!]! @derivedFrom(field: "vault")
  executions: [ExecutionEvent!]! @derivedFrom(field: "vault")
  feeEvents: [FeeEvent!]! @derivedFrom(field: "vault")
  gasCompEvents: [GasCompEvent!]! @derivedFrom(field: "vault")
}

type Automation @entity {
  id: String!
  vault: Vault!
  automationId: BigInt!
  stepCount: BigInt!
  active: Boolean!
  createdAtBlock: BigInt!
  createdAtTimestamp: BigInt!
  executions: [ExecutionEvent!]! @derivedFrom(field: "automation")
}

type ExecutionEvent @entity(immutable: true) {
  id: String!
  vault: Vault!
  automation: Automation!
  executor: Bytes!
  blockNumber: BigInt!
  timestamp: BigInt!
  transactionHash: Bytes!
}

type DepositEvent @entity(immutable: true) {
  id: String!
  vault: Vault!
  token: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  transactionHash: Bytes!
}

type WithdrawalEvent @entity(immutable: true) {
  id: String!
  vault: Vault!
  token: Bytes!
  amount: BigInt!
  fee: BigInt!
  recipient: Bytes!
  blockNumber: BigInt!
  timestamp: BigInt!
  transactionHash: Bytes!
}

type FeeEvent @entity(immutable: true) {
  id: String!
  vault: Vault!
  token: Bytes!
  amount: BigInt!
  eventType: String!
  blockNumber: BigInt!
  timestamp: BigInt!
  transactionHash: Bytes!
}

type GasCompEvent @entity(immutable: true) {
  id: String!
  vault: Vault!
  executor: Bytes!
  token: Bytes!
  amount: BigInt!
  blockNumber: BigInt!
  timestamp: BigInt!
  transactionHash: Bytes!
}
```

### Subgraph Manifest (subgraph.yaml)

Uses **dynamic data source templates** for the factory pattern:

- **Static data sources:** `StrategyBuilderVaultFactory` + `FeeRegistry` (known addresses)
- **Template:** `StrategyBuilderVault` (spawned dynamically per vault via `VaultTemplate.create(proxyAddress)`)

ERC1967 proxies: index the **proxy address** (events emit from proxy), use the **implementation ABI** (has the event definitions).

```yaml
specVersion: 1.3.0
schema:
  file: ./schema.graphql
indexerHints:
  prune: auto

dataSources:
  - kind: ethereum/contract
    name: StrategyBuilderVaultFactory
    network: bsc
    source:
      address: "0xFACTORY_ADDRESS"
      abi: StrategyBuilderVaultFactory
      startBlock: DEPLOY_BLOCK
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      file: ./src/mappings/factory.ts
      entities: [Factory, Vault]
      abis:
        - name: StrategyBuilderVaultFactory
          file: ./abis/StrategyBuilderVaultFactory.json
      eventHandlers:
        - event: VaultCreated(indexed address,indexed address,uint256)
          handler: handleVaultCreated

  - kind: ethereum/contract
    name: FeeRegistry
    network: bsc
    source:
      address: "0xFEE_REGISTRY_ADDRESS"
      abi: FeeRegistry
      startBlock: DEPLOY_BLOCK
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      file: ./src/mappings/feeRegistry.ts
      entities: [FeeEvent, GasCompEvent]
      abis:
        - name: FeeRegistry
          file: ./abis/FeeRegistry.json
      eventHandlers:
        - event: FeeCollected(indexed address,indexed address,uint256)
          handler: handleFeeCollected
        - event: GasCompDeducted(indexed address,indexed address,indexed address,uint256)
          handler: handleGasCompDeducted

templates:
  - kind: ethereum/contract
    name: StrategyBuilderVault
    network: bsc
    source:
      abi: StrategyBuilderVault
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      file: ./src/mappings/vault.ts
      entities: [Automation, ExecutionEvent, DepositEvent, WithdrawalEvent]
      abis:
        - name: StrategyBuilderVault
          file: ./abis/StrategyBuilderVault.json
      eventHandlers:
        - event: AutomationCreated(indexed uint32,uint256)
          handler: handleAutomationCreated
        - event: AutomationActiveChanged(indexed uint32,bool)
          handler: handleAutomationActiveChanged
        - event: AutomationExecuted(indexed uint32,indexed address)
          handler: handleAutomationExecuted
        - event: Deposited(indexed address,uint256)
          handler: handleDeposited
        - event: Withdrawn(indexed address,uint256,uint256,indexed address)
          handler: handleWithdrawn
```

### Factory Mapping (Key Pattern)

```typescript
import { StrategyBuilderVault as VaultTemplate } from "../../generated/templates";

export function handleVaultCreated(event: VaultCreated): void {
  // ... create Factory + Vault entities ...

  // Spawn dynamic data source for this vault proxy
  VaultTemplate.create(event.params.vault);
}
```

### Goldsky Deployment

```bash
# Install
npm install -g @graphprotocol/graph-cli
curl https://goldsky.com | sh

# Build + Deploy
graph codegen && graph build
goldsky login
goldsky subgraph deploy strategy-builder-v2/1.0.0 --path .
goldsky subgraph tag create strategy-builder-v2/1.0.0 --tag prod
```

**Endpoint format:**
```
https://api.goldsky.com/api/public/<PROJECT_ID>/subgraphs/strategy-builder-v2/prod/gn
```

### Querying

```graphql
query VaultsByOwner($owner: Bytes!) {
  vaults(where: { owner: $owner }, orderBy: createdAtTimestamp, orderDirection: desc) {
    id
    index
    automationCount
    createdAtTimestamp
  }
}

query RecentExecutions($vaultId: Bytes!, $first: Int!, $skip: Int!) {
  executionEvents(where: { vault: $vaultId }, first: $first, skip: $skip,
    orderBy: timestamp, orderDirection: desc) {
    automation { automationId active }
    executor
    timestamp
    transactionHash
  }
}
```

**No GraphQL subscriptions** on Goldsky. Use polling (50 req/10s limit) or Goldsky webhooks/mirror pipelines for real-time.

### Package Versions

| Package | Version |
|---|---|
| `@graphprotocol/graph-cli` | `0.98.1` |
| `@graphprotocol/graph-ts` | `0.38.2` |
| `specVersion` | `1.3.0` |
| `apiVersion` | `0.0.9` |

---

## 6. DeFi Protocols: AaveV3 + PancakeSwap V3 on BSC

> **PEC-218 ("DeFi-Aktionen / Actions") — re-verified 2026-06-03.** Delete/refresh this section after PEC-218 ships. Addresses cross-checked against BscScan; Aave addresses against `bgd-labs/aave-address-book` (`AaveV3BNB.sol`); PancakeSwap structs/fee tiers against `pancakeswap/pancake-v3-contracts` source (Context7 + raw GitHub). PEC-218 implementation details live in the **PEC-218 Addendum** below.

### CRITICAL: Delegatecall Pattern -- CONFIRMED WORKING

Actions are called via `delegatecall` from the vault. During delegatecall, `address(this)` = vault. When action code makes regular `call` to Aave/PancakeSwap, the vault is `msg.sender`. Tokens live at the vault, approvals are set on the vault's behalf.

**Rule:** Action contracts must call external protocols via regular `call`, never `delegatecall`. Delegatecalling Aave Pool or PancakeSwap Router would corrupt the vault's storage.

### Contract Addresses (BSC Mainnet)

#### AaveV3

| Contract | Address |
|---|---|
| Pool (proxy) | `0x6807dc923806fE8Fd134338EABCA509979a7e0cB` |
| PoolAddressesProvider | `0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D` |
| PriceOracle | `0x39bc1bfDa2130d6Bb6DBEfd366939b4c7aa7C697` |
| PoolDataProvider | `0xc90Df74A7c16245c5F5C5870327Ceb38Fe5d5328` |

**Supported reserves:** WBNB, USDT, USDC, BTCB, ETH, CAKE, FDUSD, wstETH (all 18 decimals on BSC).

**Stable borrow rate is DEPRECATED.** Always use `interestRateMode = 2` (Variable).

#### PancakeSwap V3

| Contract | Address | Interface / use |
|---|---|---|
| **SwapRouter (v3-periphery)** | `0x1b81D678ffb9C0263b24A97847620C99d213eB14` | `ISwapRouter` — **recommended for single-hop actions**. `ExactInputSingleParams` **HAS `deadline`**. |
| SmartRouter (aggregator) | `0x13f4EA83D0bd40E75C8222255bc855a974568Dd4` | `V3SwapRouter` (SwapRouter02-style) — aggregates v2+v3+stableswap, Permit2/payments, **no `deadline`** in params. Heavier; avoid for a simple stateless action. |
| NonfungiblePositionManager | `0x46A15B0b27311cedF172AB29E4f4766fbE7F4364` | LP mint/increase/decrease/collect |
| QuoterV2 | `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997` | off-chain quoting only (non-view, reverts to measure) |
| Factory | `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865` | pool lookup / `computeAddress` |
| WBNB | `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` | |

**Fee tiers (feeAmountTickSpacing, from `PancakeV3Factory` constructor):** 100→1 (0.01%), 500→10 (0.05%), 2500→50 (0.25%), 10000→200 (1%).
⚠️ PancakeSwap's middle tier is **2500 (0.25%)**, not Uniswap's 3000 (0.3%). Most BSC volume sits in the 100 and 500 tiers.

### Key Operations

#### AaveV3

| Operation | Function | Approval Needed |
|---|---|---|
| Supply | `Pool.supply(asset, amount, address(this), 0)` | Yes |
| Withdraw | `Pool.withdraw(asset, amount, address(this))` | No |
| Borrow | `Pool.borrow(asset, amount, 2, 0, address(this))` | No |
| Repay | `Pool.repay(asset, amount, 2, address(this))` | Yes |
| Health check | `Pool.getUserAccountData(address(this))` | N/A (view) |

#### PancakeSwap V3

| Operation | Function | Notes |
|---|---|---|
| Single swap | `SwapRouter.exactInputSingle(params)` | **`ExactInputSingleParams` DOES include `deadline`** (verified from source). Use `amountOutMinimum > 0` for slippage; set `recipient = address(this)` (vault). |
| Multi-hop swap | `SwapRouter.exactInput(params)` | Path: `encodePacked(tokenA, fee, tokenB, fee, tokenC)`; struct includes `deadline`. |
| Mint LP | `NftPositionManager.mint(params)` | token0 < token1 required; store NFT tokenId in context |
| Add liquidity | `NftPositionManager.increaseLiquidity(params)` | Need tokenId |
| Remove liquidity | `NftPositionManager.decreaseLiquidity(params)` | Must call `collect()` after |
| Collect fees | `NftPositionManager.collect(params)` | `amount0Max/amount1Max = type(uint128).max` for all |

### Skeleton Action Contracts

#### AaveV3SupplyAction

```solidity
contract AaveV3SupplyAction {
    using SafeERC20 for IERC20;
    uint32 private constant NO_SLOT = type(uint32).max;

    struct Params {
        address pool;
        address asset;
        uint256 amount;            // 0 = full balance
        uint32 amountFromSlot;     // NO_SLOT = use static
        uint32 amountToSlot;       // NO_SLOT = no context write
    }

    function execute(bytes calldata params, bytes[] calldata ctx)
        external returns (uint32[] memory, bytes[] memory)
    {
        Params memory p = abi.decode(params, (Params));
        uint256 supplyAmount = p.amountFromSlot != NO_SLOT
            ? abi.decode(ctx[p.amountFromSlot], (uint256))
            : p.amount == 0 ? IERC20(p.asset).balanceOf(address(this)) : p.amount;

        IERC20(p.asset).forceApprove(p.pool, supplyAmount);
        IPool(p.pool).supply(p.asset, supplyAmount, address(this), 0);

        // Context diff
        if (p.amountToSlot != NO_SLOT) { /* write supplyAmount to slot */ }
    }
}
```

#### PancakeSwapV3SwapAction

```solidity
contract PancakeSwapV3SwapAction {
    using SafeERC20 for IERC20;
    uint32 private constant NO_SLOT = type(uint32).max;

    struct Params {
        address router;             // PancakeSwap v3 SwapRouter 0x1b81D678...
        address tokenIn;
        address tokenOut;
        uint24 fee;                 // 100 | 500 | 2500 | 10000
        uint256 amountIn;           // 0 = full balance
        uint256 amountOutMinimum;   // MUST be > 0 (success criterion)
        uint32 amountInFromSlot;    // NO_SLOT = use static
        uint32 amountOutToSlot;     // NO_SLOT = no write
        uint32 minOutFromSlot;      // NO_SLOT = use static
    }

    // ISwapRouter.ExactInputSingleParams (PancakeSwap v3 SwapRouter) — note `deadline`:
    // struct ExactInputSingleParams {
    //     address tokenIn; address tokenOut; uint24 fee; address recipient;
    //     uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    // }

    function execute(bytes calldata params, bytes[] calldata ctx)
        external returns (uint32[] memory, bytes[] memory)
    {
        // Resolve amounts from context or params
        // require(amountOutMinimum > 0)
        // forceApprove(router, amountIn)
        // exactInputSingle({ ..., recipient: address(this), deadline: block.timestamp,
        //                     sqrtPriceLimitX96: 0 }) → amountOut
        // Write amountOut to context slot
    }
}
```

### PEC-218 Addendum — 8 Action Contracts (implementation-ready)

Maps the Epic's 8 user stories to concrete on-chain calls. All actions are **stateless, delegatecall'd** (`address(this) == vault`), follow the `IAction.execute(bytes params, bytes[] ctx)` signature, and use OZ 5.6.1 `SafeERC20.forceApprove` (Solidity 0.8.28). `NO_SLOT = type(uint32).max`.

| # | Action | Target call | Approval | Context I/O |
|---|---|---|---|---|
| 1 | ERC20 Transfer | (exists) `IERC20.safeTransfer` | n/a | amountFrom/To slot |
| 2 | Aave Supply | `Pool.supply(asset, amt, address(this), 0)` | ✅ forceApprove(pool) | amountFrom; optional aToken-out |
| 3 | Aave Withdraw | `Pool.withdraw(asset, amt, address(this))` returns actual | ❌ | `amt = type(uint256).max` → full balance; actual→slot |
| 4 | Aave Borrow | `Pool.borrow(asset, amt, 2, 0, address(this))` | ❌ | amountFrom; borrowed→slot |
| 5 | Aave Repay | `Pool.repay(asset, amt, 2, address(this))` returns actual | ✅ forceApprove(pool) | `amt = type(uint256).max` → repay full debt; actual→slot |
| 6 | PCS Swap | `SwapRouter.exactInputSingle(...)` returns amountOut | ✅ forceApprove(router) | amountInFrom; **amountOut→slot** |
| 7 | PCS LP Mint | `NPM.mint(MintParams)` returns (tokenId, liq, a0, a1) | ✅ both tokens | **tokenId→slot** (required) |
| 8 | PCS LP Manage | `NPM.increaseLiquidity` / `decreaseLiquidity`+`collect` | increase: ✅ both | tokenId from slot |

**Amount sentinels (verified):**
- Aave `withdraw` / `repay`: pass `type(uint256).max` to withdraw entire aToken balance / repay entire debt. Pool transfers only what's needed and returns the actual amount — capture it into a context slot (it differs from the sentinel).
- ERC20Transfer / Swap "full balance": resolve `0 → IERC20(token).balanceOf(address(this))` in the action (existing convention).

**Aave specifics:**
- `interestRateMode = 2` always (stable rate is disabled on every V3 market — passing 1 reverts).
- Informational reads (no tx): `Pool.getReserveData(asset).currentLiquidityRate` (supply APR) / `.currentVariableBorrowRate` (borrow APR), both **ray (1e27)**, per-second linear → annualize/compound off-chain for the APY badge. `Pool.getUserAccountData(address(this))` returns `(totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor)`; base amounts are USD with **8 decimals**, `healthFactor` is **1e18-scaled** (`type(uint256).max` = no debt). Use for the health-factor / liquidation-risk warnings — UI-only, do not gate execution on it on-chain.
- aToken balances are continuously increasing (interest) — never cache; read live.

**PancakeSwap LP specifics:**
- `MintParams`, `IncreaseLiquidityParams`, `DecreaseLiquidityParams`, `CollectParams` **all include `deadline`** — set `block.timestamp`.
- **Token ordering**: `token0 < token1` (numeric address sort). Sort the pair and the matching amounts before building `MintParams`, else mint reverts.
- **NFT receipt**: `NonfungiblePositionManager.mint` uses ERC721 `_mint` (non-safe), so it does **not** call `onERC721Received` — the vault can custody the position NFT without implementing `IERC721Receiver`. (Verify against the deployed bytecode in the fork test; if a future version switches to `_safeMint`, the vault must implement the receiver hook.)
- **Remove liquidity is two steps**: `decreaseLiquidity` only accrues tokens to the position; you must then `collect` (use `amount0Max = amount1Max = type(uint128).max`) to actually pull them to the vault.
- **Quoter is off-chain only**: `QuoterV2.quoteExactInputSingle` is non-`view` (it executes a swap and reverts to measure). Compute `amountOutMinimum` off-chain (frontend `eth_call`/`callStatic`) with a slippage tolerance and pass it in; never call the quoter from the action.

**Testing strategy (forked mainnet — this is the deliverable, not a throwaway):**
- Run `pnpm contracts:fork:bsc` (archive RPC) and test against the live BSC addresses above. Use whale impersonation (`hardhat_impersonateAccount` + `hardhat_setBalance`) to fund the vault with real reserves — pattern already in `scripts/deploy-fork.ts` (USDT whale `0xF977814e90dA44bFA03b6295A0616a897441aceC`).
- Per Epic success criteria: Aave actions tested against ≥3 BSC reserves; Swap asserts `amountOutMinimum > 0` enforced; LP Mint asserts the NFT `tokenId` lands in the expected context slot.
- A standalone learning test under `/learning-tests` was intentionally **not** added: these are Solidity protocol integrations that require the Hardhat-3 fork harness (`network.connect()`, ESM) and the Epic already mandates forked tests as part of the build — duplicating them as throwaways would diverge from the real suite. The reusable artifact is this research section.

### BSC-Specific Gotchas

- **All major tokens use 18 decimals** (USDT, USDC are 18, NOT 6 like on Ethereum!)
- Gas for typical automation: $0.10-0.20 USD
- Block time: 3 seconds
- aTokens are rebasing -- never cache balances, always read live
- `decreaseLiquidity` does NOT transfer tokens -- must call `collect()` after
- QuoterV2 is off-chain only (eth_call) -- never use on-chain
- `amountOutMinimum = 0` is dangerous -- always compute with slippage tolerance

### Gas Costs (BSC Estimates)

| Operation | Gas | USD (~1 gwei) |
|---|---|---|
| AaveV3 supply | 250k-350k | $0.05-0.08 |
| AaveV3 borrow | 300k-400k | $0.06-0.09 |
| PCS V3 swap (single) | 150k-250k | $0.03-0.06 |
| PCS V3 mint LP | 400k-600k | $0.09-0.13 |
| Full automation overhead | ~50k | $0.01 |

---

## 7. CI/CD: GitHub Actions + Docker + Hetzner

### Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push: { branches: [main, develop] }
  pull_request: { branches: [main] }

jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter contracts compile
      - run: pnpm --filter contracts test

  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: test, POSTGRES_PASSWORD: test, POSTGRES_DB: strategy_builder_test }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter backend lint
      - run: pnpm --filter backend prisma:migrate:deploy
        env: { DATABASE_URL: 'postgres://test:test@localhost:5432/strategy_builder_test' }
      - run: pnpm --filter backend test
        env: { DATABASE_URL: 'postgres://test:test@localhost:5432/strategy_builder_test' }
      - run: pnpm --filter backend build

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter frontend lint
      - run: pnpm --filter frontend test
      - run: pnpm --filter frontend build

  deploy:
    needs: [contracts, backend, frontend]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - name: Build + push Docker images to GHCR
        run: |
          docker build -t ghcr.io/${{ github.repository }}/backend:${{ github.sha }} -f packages/backend/Dockerfile .
          docker build -t ghcr.io/${{ github.repository }}/frontend:${{ github.sha }} -f packages/frontend/Dockerfile .
      - name: Deploy to Hetzner via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: ${{ secrets.HETZNER_USER }}
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /opt/strategy-builder
            echo "IMAGE_TAG=${{ github.sha }}" > .env.deploy
            docker compose pull
            docker compose up -d --remove-orphans
            docker compose exec backend pnpm prisma migrate deploy
```

### Docker Compose (on Hetzner)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: strategy_builder
    ports: ["127.0.0.1:5432:5432"]

  backend:
    image: ghcr.io/your-org/strategy-builder-v2/backend:${IMAGE_TAG}
    restart: unless-stopped
    depends_on: [postgres]
    ports: ["127.0.0.1:3000:3000"]
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@postgres:5432/strategy_builder
      NODE_ENV: production
    env_file: .env

  frontend:
    image: ghcr.io/your-org/strategy-builder-v2/frontend:${IMAGE_TAG}
    restart: unless-stopped
    ports: ["127.0.0.1:8080:80"]

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/letsencrypt:ro
    depends_on: [backend, frontend]

volumes:
  pgdata:
```

### Secrets (GitHub)

| Secret | Purpose |
|---|---|
| `HETZNER_HOST` | Server IP |
| `HETZNER_USER` | SSH user |
| `HETZNER_SSH_KEY` | SSH private key |

---

## 8. Project Structure: pnpm Monorepo

### Why pnpm

- Native workspace support
- Strict dependency isolation (no phantom deps)
- Content-addressable store (disk-efficient, fast)

### Directory Layout

```
strategy-builder-v2/
├── .github/workflows/ci.yml
├── packages/
│   ├── contracts/                # Smart contracts (move existing root files)
│   │   ├── contracts/
│   │   ├── test/
│   │   ├── ignition/
│   │   ├── hardhat.config.ts
│   │   └── package.json
│   │
│   ├── backend/                  # NestJS API
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── prisma/           # PrismaService
│   │   │   ├── auth/             # SIWE wallet verification
│   │   │   ├── vaults/           # CRUD
│   │   │   ├── automations/      # CRUD
│   │   │   ├── executions/       # History
│   │   │   ├── fees/             # Fee tracking
│   │   │   └── ws/               # WebSocket gateway
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── frontend/                 # Vite + React
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   ├── lib/              # wagmi config, API client
│   │   │   └── types/
│   │   ├── vite.config.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── subgraph/                 # TheGraph subgraph
│   │   ├── schema.graphql
│   │   ├── subgraph.yaml
│   │   ├── src/mappings/
│   │   ├── abis/
│   │   └── package.json
│   │
│   └── shared/                   # Shared types + utils
│       ├── src/
│       │   ├── types/            # Vault, Automation, Step types
│       │   ├── constants/        # Contract addresses, ABIs, chains
│       │   └── validation/       # Zod schemas
│       └── package.json
│
├── pnpm-workspace.yaml
├── package.json                  # Root: scripts, linting
├── tsconfig.base.json
├── CLAUDE.md
└── research.md                   # <-- this file (delete after MVP)
```

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

### Cross-package imports

```typescript
// In backend or frontend:
import { VaultDTO, AutomationStep } from '@strategy-builder/shared';
```

### Migration from current repo

1. `npm install -g pnpm`
2. `pnpm import` (converts package-lock.json)
3. Create `pnpm-workspace.yaml`
4. Move existing contract files to `packages/contracts/`
5. `nest new backend` inside packages/
6. `pnpm create vite frontend --template react-ts`
7. Create `packages/shared/` and `packages/subgraph/`
8. Delete `package-lock.json`, run `pnpm install`

---

## 9. Version Summary

| Technology | Version | Purpose |
|---|---|---|
| **Runtime** | | |
| Node.js | 22 LTS | Runtime |
| pnpm | ^10.x | Package manager |
| TypeScript | ^5.8 (^6.0 for contracts) | Language |
| **Backend** | | |
| NestJS | ^11.1 | REST API framework |
| Prisma | ^7.5 | ORM + migrations |
| PostgreSQL | 16 | Database |
| **Frontend** | | |
| Vite | ^7.0 | Build tool |
| React | ^19.1 | UI library |
| react-router | ^7.x | Routing |
| @account-kit/react | v4 | Auth + wallet |
| @account-kit/infra | v4 | Chain config |
| @tanstack/react-query | ^5.x | Data fetching |
| @xyflow/react | ^12.x | Graph editor |
| TailwindCSS | ^4.x | Styling |
| zod | ^3.x | Validation |
| **Subgraph** | | |
| @graphprotocol/graph-cli | 0.98.1 | Build tool |
| @graphprotocol/graph-ts | 0.38.2 | Runtime |
| Goldsky CLI | latest | Deployment |
| **Smart Contracts** | | |
| Solidity | 0.8.28 | Language |
| Hardhat | ^3.2.0 | Build + test |
| OpenZeppelin | ^5.6.1 | Libraries |
| **Infrastructure** | | |
| Docker | latest | Containerization |
| nginx | alpine | Reverse proxy |
| GitHub Actions | v4 | CI/CD |

---

---

## 10. Wagmi v2 + Viem v2 Contract Interactions (PEC-215)

> **Docs source:** Context7 (wagmi.sh, viem.sh) + GitHub issues research, May 2026.
> **Scope:** Everything needed for vault creation, deposit, withdraw, and balance reads from the React frontend.

### Version Decision

- **Chosen versions:** wagmi ^2.15.4 (resolves to 2.19.5), viem ^2.31.3 (resolves to 2.51.3)
- **Why:** All peer deps satisfied — React 19, TanStack Query 5, TypeScript 5.9.3 all compatible
- **wagmi 2.x is EOL:** Last release Nov 2025. Plan migration to wagmi 3.x after MVP
- **wagmi 3.x requires:** TypeScript >=5.9.3 (already met), uses same viem 2.x + react >=18
- **DO NOT USE:** wagmi <2.15.4 (lacks React 19 fixes), viem <2.21 (BSC chain definition bugs), @tanstack/react-query 4.x (wagmi 2.x requires 5.x)

### ABI Setup

All hooks get full TypeScript inference when ABIs use `as const`.

**Recommended pattern — extract from Hardhat artifacts:**
```typescript
// packages/frontend/src/lib/abis/strategyBuilderVaultFactory.ts
export const strategyBuilderVaultFactoryAbi = [
  {
    type: 'function', name: 'createVault', stateMutability: 'nonpayable',
    inputs: [
      { name: 'vaultOwner', type: 'address' },
      { name: 'depositToken_', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  // ... more functions + custom errors
] as const;
```

**Alternative — human-readable ABI with `parseAbi` (viem):**
```typescript
import { parseAbi } from 'viem';
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);
```

**Critical:** Include custom `error` definitions (CallerNotOwner, TriggerNotMet, FeeTokenNotAccepted) in ABIs — without them viem returns "Execution reverted for an unknown reason" instead of decoded error names.

### Key Hooks Reference

#### useReadContract — single contract read
```typescript
const { data: depositFeeBps } = useReadContract({
  abi: feeRegistryAbi,
  address: FEE_REGISTRY_ADDRESS,
  functionName: 'depositFeeBps',
  query: { enabled: !!address }, // gate on dependency
});
```
Returns: `{ data, error, isLoading, isSuccess, refetch }`. `data` type inferred from ABI.

#### useReadContracts — multicall batch reads
```typescript
const { data: balances } = useReadContracts({
  contracts: tokenAddresses.map((token) => ({
    abi: erc20Abi, address: token,
    functionName: 'balanceOf', args: [vaultAddress],
  })),
  query: { enabled: !!vaultAddress },
});
// balances?.[0].result => bigint (with allowFailure=true, default)
```
Each result is `{ result, status: 'success'|'failure', error? }` — NOT the raw value.

**Shared contract pattern:**
```typescript
const feeRegistryContract = { abi: feeRegistryAbi, address: FEE_REGISTRY_ADDRESS } as const;
// spread: { ...feeRegistryContract, functionName: 'depositFeeBps' }
```

#### useSimulateContract — dry-run before write
```typescript
const { data: sim, error: simError } = useSimulateContract({
  abi: factoryAbi, address: FACTORY_ADDRESS,
  functionName: 'createVault',
  args: [ownerAddress, depositTokenAddress, salt],
  query: { enabled: !!ownerAddress },
});
// sim.request => pass to writeContract
// sim.result => simulated return value
```

#### useWriteContract — send transactions
```typescript
const { data: hash, error, isPending, writeContract, writeContractAsync } = useWriteContract();

// Fire-and-forget (updates React state):
writeContract({ abi, address, functionName, args });

// Async (for sequential flows like approve+deposit):
const hash = await writeContractAsync({ abi, address, functionName, args });
```

**Note:** `writeContract` internally calls `simulateContract` before submitting. If simulation fails, wallet popup never appears.

#### useWaitForTransactionReceipt — track confirmation
```typescript
const { isLoading: isConfirming, isSuccess: isConfirmed } =
  useWaitForTransactionReceipt({ hash });
```

### ERC-20 Approve + Deposit Pattern

```typescript
async function approveAndDeposit(amount: bigint) {
  // 1. Check current allowance
  const allowance = await readContract(config, {
    abi: erc20Abi, address: tokenAddress,
    functionName: 'allowance', args: [owner, vaultAddress],
  });

  // 2. Approve if needed (handle USDT-style tokens)
  if (allowance < amount) {
    if (allowance > 0n) {
      // USDT-style: reset to 0 first
      const resetTx = await writeContractAsync({
        abi: erc20Abi, address: tokenAddress,
        functionName: 'approve', args: [vaultAddress, 0n],
      });
      await waitForTransactionReceipt(config, { hash: resetTx });
    }
    const approveTx = await writeContractAsync({
      abi: erc20Abi, address: tokenAddress,
      functionName: 'approve', args: [vaultAddress, amount],
    });
    await waitForTransactionReceipt(config, { hash: approveTx });
  }

  // 3. Deposit
  return await writeContractAsync({
    abi: vaultAbi, address: vaultAddress,
    functionName: 'deposit', args: [tokenAddress, amount],
  });
}
```

**MaxUint256 vs exact approval:** For repeated deposits, approve MaxUint256 with explicit user consent UI. Skip re-approval on subsequent deposits when allowance is sufficient.

### Extracting Return Values from Receipts

After `createVault`, parse logs to get the new vault address:
```typescript
import { decodeEventLog } from 'viem';

const receipt = await waitForTransactionReceipt(config, { hash });
const log = receipt.logs.find(/* match VaultCreated topic */);
const decoded = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
const newVaultAddress = decoded.args.vault;
```

### Viem Utility Functions

```typescript
import { parseUnits, formatUnits, parseEther, formatEther } from 'viem';

parseUnits('100.5', 18)  // => 100500000000000000000n
parseUnits('100', 6)     // => 100000000n (USDT 6 decimals)
formatUnits(200n, 0)     // fee BPS display: "200" (= 2%)
```

### Error Handling

```typescript
import { BaseError, ContractFunctionRevertedError } from 'viem';

if (error instanceof BaseError) {
  const shortMsg = error.shortMessage; // "execution reverted: CallerNotOwner()"

  const revertError = error.walk(
    (err) => err instanceof ContractFunctionRevertedError
  );
  if (revertError instanceof ContractFunctionRevertedError) {
    const errorName = revertError.data?.errorName; // "CallerNotOwner"
  }
}
```

### Wagmi Config Update Required

Current config uses bare `transports` — multicall batching is NOT enabled. Update to use `client` factory:

```typescript
import { createConfig, http, createClient } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [injected()],
  pollingInterval: 2_000, // BSC has ~0.75s blocks now
  client({ chain }) {
    return createClient({
      chain,
      transport: http(),
      batch: {
        multicall: {
          batchSize: 512,
          wait: 50,
        },
      },
    });
  },
});
```

### Gotchas & Pitfalls

1. **`useReadContract` does NOT auto-refetch after writes.** Manually invalidate with `queryClient.invalidateQueries({ queryKey: ['readContract'] })` in a `useEffect` watching `isSuccess` from `useWaitForTransactionReceipt`.

2. **`onSuccess`/`onError` callbacks removed from query hooks in wagmi v2** (aligned with TanStack Query v5). Use `useEffect` on `isSuccess`/`isError` instead. Mutation hooks (`useWriteContract`) still have them.

3. **Multiple `useReadContract` hooks cause re-render waterfalls.** Batch with `useReadContracts` (one hook, one render cycle).

4. **`useReadContracts` default `allowFailure: true`** — results are `{ result, status, error }` objects, not raw values. Access `.result`.

5. **USDT `approve` returns void, not bool** — standard ERC-20 ABI decode fails. Use custom ABI or skip `simulateContract` for known non-standard tokens.

6. **BSC gas estimation bugs** — `eth_estimateGas` on BSC public nodes returns incorrect results. Always add 20% buffer or use `simulateContract` first for better error messages.

7. **`useWaitForTransactionReceipt` silent failure on OOG** — `isLoading` stays `true` forever. Check `failureCount > 0` as fallback.

8. **BSC public RPCs have aggressive rate limits.** Use a dedicated RPC provider (QuickNode, Ankr, dRPC) for production.

9. **`eth_getLogs` block range limited to 5000 blocks** on BSC public RPCs.

10. **`as const` is mandatory on ABIs** for type inference. Without it, `functionName` and `args` become `string` / `unknown[]`.

### Testing Strategy

**Unit tests (mock wagmi hooks):**
```typescript
vi.mock('wagmi', async () => {
  const actual = await vi.importActual('wagmi');
  return {
    ...actual,
    useReadContract: vi.fn().mockReturnValue({
      data: 1000n, isLoading: false, isSuccess: true, error: null,
    }),
  };
});
```

**Integration tests (recommended — Anvil fork):**
```typescript
import { mock } from 'wagmi/connectors';

const testConfig = createConfig({
  chains: [bsc],
  connectors: [mock({ accounts: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'] })],
  transports: { [bsc.id]: http('http://127.0.0.1:8545') }, // anvil --fork-url <BSC_RPC>
});
```

No official `@wagmi/test` package exists. Use `@testing-library/react` with `renderHook` wrapped in `WagmiProvider` + `QueryClientProvider`.

### Hook-to-Feature Mapping (PEC-215)

| Feature | Primary Hook | Notes |
|---------|-------------|-------|
| Create vault | `useSimulateContract` + `useWriteContract` + `useWaitForTransactionReceipt` | Parse VaultCreated event from receipt |
| ERC-20 approve | `useReadContract` (allowance) + `writeContractAsync` | Handle USDT zero-reset |
| Deposit tokens | `writeContractAsync` + `useWaitForTransactionReceipt` | Sequential after approve |
| Withdraw tokens | `useSimulateContract` + `useWriteContract` + `useWaitForTransactionReceipt` | Simulate first to catch errors |
| Vault balances (multi-token) | Backend API (`VaultPortfolioService`) | Alchemy `getTokenBalances` + DeFiLlama prices (see Section 11) |
| Fee rates | `useReadContracts` | `depositFeeBps` + `withdrawFeeBps` from FeeRegistry |
| USD values | Backend API (`PriceService`) | DeFiLlama API, no on-chain reads needed (see Section 11) |
| Vault list | Backend API + `useReadContracts` | DB for metadata, backend for balances/prices |

### Recommended File Structure

```
packages/frontend/src/lib/
  abis/
    erc20.ts                         # balanceOf, approve, allowance, transfer, decimals, symbol
    strategyBuilderVault.ts          # deposit, withdraw, createAutomation, getContext, etc.
    strategyBuilderVaultFactory.ts   # createVault, getVault, vaultCount, isRegisteredVault
    feeRegistry.ts                   # depositFeeBps, withdrawFeeBps, vaultDeposit, isAcceptedToken
  contracts.ts                       # Contract addresses per chain (BSC mainnet/testnet)
  wagmi.ts                           # Config (update with client factory)

packages/frontend/src/hooks/
  useCreateVault.ts                  # simulate + write + wait + parse event
  useApproveAndDeposit.ts            # allowance check + approve + deposit sequence
  useWithdraw.ts                     # simulate + write + wait
  useFeeRates.ts                     # useReadContracts for fee BPS (on-chain)
  useVaultPortfolio.ts               # TanStack Query wrapper for backend portfolio API
```

---

## 11. Token Balances & Prices: Alchemy API + DeFiLlama (Backend)

> **Docs source:** Alchemy docs, DeFiLlama API, CoinGecko docs, npm registry, GitHub issues, web research May 2026.
> **Scope:** Fetching ERC-20 token balances and USD prices for vault addresses on BSC from the NestJS backend.

### Critical Finding: Do NOT Use `alchemy-sdk` npm Package

The `alchemy-sdk` npm package is **archived** (March 11, 2026) and **stuck on ethers v5**. Our backend uses ethers v6. There is no migration path.

| Issue | Details |
|-------|---------|
| ethers v5 lock-in | Bundles ethers 5.x internally, conflicts with our ethers 6.16.0 |
| Archived | Repository archived March 11, 2026 — no further updates |
| Deprecation | Announced deprecation with "minimal support until January 2026" |
| Replacement | Alchemy recommends **direct REST API calls** or **viem** (frontend only) |

**Recommendation:** Use Alchemy's REST API directly via `fetch` (native in Node.js 18+). No SDK dependency needed.

### Alchemy BSC Support Status

Alchemy supports BSC with the following RPC endpoints:

| Network | Endpoint |
|---------|----------|
| BSC Mainnet | `https://bnb-mainnet.g.alchemy.com/v2/{apiKey}` |
| BSC Testnet | `https://bnb-testnet.g.alchemy.com/v2/{apiKey}` |

#### Token API on BSC

`alchemy_getTokenBalances` is available on all EVM chains including BSC. However:

- **DEFAULT_TOKENS** param (top 100 tokens auto-discovery) is **NOT available on BSC** — only Ethereum, Polygon, Arbitrum
- You must pass explicit contract addresses when querying BSC
- `alchemy_getTokenMetadata` also available on BSC

#### Portfolio API (Newer, Multi-Chain)

The Portfolio API endpoint `assets/tokens/by-address` returns balances + metadata + prices in a **single call**. Supports "30+ EVM chains." BSC is likely included but not explicitly confirmed in docs — must verify in Alchemy dashboard.

### API Endpoints & Costs

#### Option A: Token API (JSON-RPC, per-chain endpoint)

```
POST https://bnb-mainnet.g.alchemy.com/v2/{apiKey}
```

| Method | CU Cost | Description |
|--------|---------|-------------|
| `alchemy_getTokenBalances` | 20 CU | Get ERC-20 balances for an address |
| `alchemy_getTokenMetadata` | 10 CU | Get token name, symbol, decimals, logo |

**Request format (getTokenBalances):**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "alchemy_getTokenBalances",
  "params": [
    "0xVAULT_ADDRESS",
    ["0xTOKEN1", "0xTOKEN2", "0xTOKEN3"]
  ]
}
```

**Response format:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "address": "0xVAULT_ADDRESS",
    "tokenBalances": [
      {
        "contractAddress": "0xTOKEN1",
        "tokenBalance": "0x000000000000000000000000000000000000000000000056bc75e2d63100000"
      }
    ]
  }
}
```

**Limitation:** Balances returned as hex strings. No prices. Requires separate `getTokenMetadata` calls for decimals. Requires separate price source.

#### Option B: Portfolio API (REST, multi-chain in one call)

```
POST https://api.g.alchemy.com/data/v1/{apiKey}/assets/tokens/by-address
```

| Method | CU Cost | Description |
|--------|---------|-------------|
| `assets/tokens/by-address` | 360 CU | Balances + metadata + prices in one call |
| `assets/tokens/balances/by-address` | 200 CU | Balances only (cheaper) |

**Request format:**
```json
{
  "addresses": [
    {
      "address": "0xVAULT_ADDRESS",
      "networks": ["bnb-mainnet"]
    }
  ],
  "withMetadata": true,
  "withPrices": true,
  "includeNativeTokens": true,
  "includeErc20Tokens": true
}
```

**Response format:**
```json
{
  "data": {
    "pageKey": "",
    "tokens": [
      {
        "tokenAddress": "0xTOKEN1",
        "network": "bnb-mainnet",
        "tokenBalance": "100500000000000000000",
        "tokenMetadata": {
          "decimals": 18,
          "logo": "https://...",
          "name": "USD Tether",
          "symbol": "USDT"
        },
        "tokenPrices": [
          {
            "currency": "usd",
            "value": "0.9997",
            "lastUpdatedAt": "2026-05-31T12:00:00Z"
          }
        ]
      }
    ]
  }
}
```

**Constraints:** Max 2 wallet addresses, max 5 networks per request.

#### Option C: Prices API (Standalone)

```
POST https://api.g.alchemy.com/prices/v1/{apiKey}/tokens/by-address
GET  https://api.g.alchemy.com/prices/v1/tokens/by-symbol?symbols=ETH,BNB&Authorization=Bearer {apiKey}
```

| Method | CU Cost | Description |
|--------|---------|-------------|
| `tokens/by-address` | 40 CU | Price by contract address + network |
| `tokens/by-symbol` | 40 CU | Price by ticker symbol |
| `tokens/historical` | 40 CU | Historical price |

**Request (by-address):**
```json
{
  "addresses": [
    { "network": "bnb-mainnet", "address": "0xTOKEN1" },
    { "network": "bnb-mainnet", "address": "0xTOKEN2" }
  ]
}
```

**Constraint:** Max 25 addresses, max 3 networks per request.

### Alchemy Rate Limits & Pricing

| Plan | CU/month | CU/second | Price |
|------|----------|-----------|-------|
| Free | 30,000,000 | 500 | $0 |
| Pay-as-you-go | Unlimited | Higher | $0.45/M CU (first 300M), $0.40/M CU after |

**Budget estimation for vault balance polling (Free tier):**
- 1 vault, 5 tokens, every 60s: ~20 CU/call * 1440 calls/day = 28,800 CU/day
- 100 vaults, 5 tokens each, every 5 min: 20 CU * 100 * 288 = 576,000 CU/day = ~17.3M CU/month
- Leaves headroom for other API calls on Free tier

### DeFiLlama Prices API (Recommended for Prices)

DeFiLlama provides a **free, no-auth-required** price API that is ideal for BSC token prices.

**Base URL:** `https://coins.llama.fi`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/prices/current/{coins}` | GET | Current prices for multiple tokens |
| `/prices/historical/{timestamp}/{coins}` | GET | Historical prices at timestamp |
| `/batchHistorical` | POST | Batch historical price queries |
| `/chart/{coins}` | GET | Price chart data |
| `/percentage/{coins}` | GET | Percentage price changes |

**Coin identifier format:** `{chain}:{contractAddress}` — for BSC: `bsc:0x...`

**Example request:**
```
GET https://coins.llama.fi/prices/current/bsc:0x55d398326f99059fF775485246999027B3197955,bsc:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
```

**Verified response (live test):**
```json
{
  "coins": {
    "bsc:0x55d398326f99059fF775485246999027B3197955": {
      "decimals": 18,
      "symbol": "USDT",
      "price": 0.9986860112054028,
      "timestamp": 1780254168,
      "confidence": 0.99
    },
    "bsc:0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d": {
      "decimals": 18,
      "symbol": "USDC",
      "price": 0.9997318195568737,
      "timestamp": 1780254168,
      "confidence": 0.99
    }
  }
}
```

**Advantages over Alchemy Prices API:**
- Completely free, no API key required
- Proven BSC support (tested above)
- Returns decimals + symbol alongside price
- Batch multiple tokens in one GET request (comma-separated)
- Confidence score indicates price reliability
- DEX-sourced pricing (accurate for DeFi tokens)

**Rate limits:** Standard rate limiting (not documented precisely). Pro tier available for higher limits at `pro-api.llama.fi/{apiKey}/coins/...`.

### Alternative Price Sources Comparison

| Provider | BSC Support | Free Tier | Auth Required | Batch | Notes |
|----------|-------------|-----------|---------------|-------|-------|
| **DeFiLlama** | Yes (verified) | Unlimited | No | Yes (URL) | Best for backend; DEX-sourced |
| **Alchemy Prices** | Likely (unconfirmed) | 30M CU | Yes (API key) | Yes (25 max) | CEX+DEX aggregated |
| **CoinGecko** | Yes | 10K calls/mo | Optional | Yes (515 max) | Broader coverage; aggressive rate limits |
| **On-chain IPriceOracle** | Yes | Gas cost only | No | Via multicall | Already deployed in contracts |
| **PancakeSwap Subgraph** | Yes | Free | No | GraphQL | Pool-specific; stale if low volume |

### Recommended Architecture

Use **Alchemy Token API for balances** + **DeFiLlama for prices**. This avoids SDK dependency, works with ethers 6, and keeps prices free.

```
┌─────────────────────────────────────────────────┐
│                NestJS Backend                    │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐ │
│  │  AlchemyService   │  │  PriceService        │ │
│  │                    │  │                      │ │
│  │  getTokenBalances()│  │  getTokenPrices()    │ │
│  │  getTokenMetadata()│  │  getHistoricalPrice()│ │
│  └────────┬───────────┘  └────────┬─────────────┘ │
│           │                       │               │
│  ┌────────┴───────────┐  ┌───────┴──────────────┐ │
│  │ Alchemy REST API   │  │ DeFiLlama REST API   │ │
│  │ (JSON-RPC + REST)  │  │ (no auth needed)     │ │
│  └────────────────────┘  └──────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  VaultPortfolioService                        │ │
│  │  Combines balances + prices + metadata        │ │
│  │  Caching layer (in-memory or Redis)           │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### NestJS Service Implementation Pattern

#### AlchemyService (Token Balances)

```typescript
// src/blockchain/alchemy.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TokenBalance {
  contractAddress: string;
  tokenBalance: string; // hex string
}

interface TokenMetadata {
  decimals: number;
  logo: string | null;
  name: string;
  symbol: string;
}

interface TokenBalancesResponse {
  address: string;
  tokenBalances: TokenBalance[];
}

@Injectable()
export class AlchemyService {
  private readonly logger = new Logger(AlchemyService.name);
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('ALCHEMY_API_KEY');
    this.baseUrl = `https://bnb-mainnet.g.alchemy.com/v2/${apiKey}`;
  }

  /** Fetch ERC-20 balances for a vault address (20 CU per call) */
  async getTokenBalances(
    walletAddress: string,
    tokenAddresses: string[],
  ): Promise<TokenBalancesResponse> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [walletAddress, tokenAddresses],
      }),
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(`Alchemy error: ${json.error.message}`);
    }
    return json.result;
  }

  /** Fetch token metadata — name, symbol, decimals, logo (10 CU per call) */
  async getTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenMetadata',
        params: [tokenAddress],
      }),
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(`Alchemy error: ${json.error.message}`);
    }
    return json.result;
  }
}
```

#### PriceService (DeFiLlama)

```typescript
// src/blockchain/price.service.ts
import { Injectable, Logger } from '@nestjs/common';

interface TokenPrice {
  decimals: number;
  symbol: string;
  price: number;
  timestamp: number;
  confidence: number;
}

interface PricesResponse {
  coins: Record<string, TokenPrice>;
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly baseUrl = 'https://coins.llama.fi';

  /**
   * Fetch current USD prices for BSC tokens.
   * @param tokenAddresses - Array of BSC contract addresses (checksummed or lowercase)
   * @returns Map of address -> price data
   */
  async getTokenPrices(
    tokenAddresses: string[],
  ): Promise<Map<string, TokenPrice>> {
    const coins = tokenAddresses
      .map((addr) => `bsc:${addr}`)
      .join(',');

    const response = await fetch(
      `${this.baseUrl}/prices/current/${coins}`,
    );
    const json: PricesResponse = await response.json();

    const result = new Map<string, TokenPrice>();
    for (const [key, value] of Object.entries(json.coins)) {
      // key = "bsc:0x..." -> extract address part
      const address = key.split(':')[1];
      result.set(address.toLowerCase(), value);
    }
    return result;
  }

  /** Fetch historical price at a specific UNIX timestamp */
  async getHistoricalPrice(
    tokenAddress: string,
    timestamp: number,
  ): Promise<TokenPrice | null> {
    const coin = `bsc:${tokenAddress}`;
    const response = await fetch(
      `${this.baseUrl}/prices/historical/${timestamp}/${coin}`,
    );
    const json: PricesResponse = await response.json();
    return json.coins[coin] ?? null;
  }
}
```

#### VaultPortfolioService (Combined)

```typescript
// src/blockchain/vault-portfolio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';
import { PriceService } from './price.service';
import { formatUnits } from 'ethers';

interface VaultTokenPosition {
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;         // raw balance as decimal string
  balanceFormatted: string; // human-readable (e.g., "100.5")
  priceUsd: number | null;
  valueUsd: number | null;
  confidence: number | null;
}

interface VaultPortfolio {
  vaultAddress: string;
  positions: VaultTokenPosition[];
  totalValueUsd: number;
}

@Injectable()
export class VaultPortfolioService {
  private readonly logger = new Logger(VaultPortfolioService.name);

  // Cache token metadata (rarely changes)
  private metadataCache = new Map<string, { decimals: number; name: string; symbol: string }>();

  constructor(
    private alchemy: AlchemyService,
    private prices: PriceService,
  ) {}

  async getVaultPortfolio(
    vaultAddress: string,
    tokenAddresses: string[],
  ): Promise<VaultPortfolio> {
    // 1. Fetch balances and prices in parallel
    const [balancesResult, priceMap] = await Promise.all([
      this.alchemy.getTokenBalances(vaultAddress, tokenAddresses),
      this.prices.getTokenPrices(tokenAddresses),
    ]);

    // 2. Fetch metadata for unknown tokens (cached)
    const unknownTokens = tokenAddresses.filter(
      (addr) => !this.metadataCache.has(addr.toLowerCase()),
    );
    if (unknownTokens.length > 0) {
      const metadataResults = await Promise.all(
        unknownTokens.map((addr) => this.alchemy.getTokenMetadata(addr)),
      );
      unknownTokens.forEach((addr, i) => {
        this.metadataCache.set(addr.toLowerCase(), {
          decimals: metadataResults[i].decimals,
          name: metadataResults[i].name,
          symbol: metadataResults[i].symbol,
        });
      });
    }

    // 3. Combine into positions
    const positions: VaultTokenPosition[] = balancesResult.tokenBalances.map(
      (tb) => {
        const addr = tb.contractAddress.toLowerCase();
        const metadata = this.metadataCache.get(addr)!;
        const price = priceMap.get(addr);
        const rawBalance = BigInt(tb.tokenBalance);
        const balanceFormatted = formatUnits(rawBalance, metadata.decimals);
        const valueUsd = price
          ? parseFloat(balanceFormatted) * price.price
          : null;

        return {
          tokenAddress: tb.contractAddress,
          symbol: metadata.symbol,
          name: metadata.name,
          decimals: metadata.decimals,
          balance: rawBalance.toString(),
          balanceFormatted,
          priceUsd: price?.price ?? null,
          valueUsd,
          confidence: price?.confidence ?? null,
        };
      },
    );

    const totalValueUsd = positions.reduce(
      (sum, p) => sum + (p.valueUsd ?? 0),
      0,
    );

    return { vaultAddress, positions, totalValueUsd };
  }
}
```

#### NestJS Module Registration

```typescript
// src/blockchain/blockchain.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlchemyService } from './alchemy.service';
import { PriceService } from './price.service';
import { VaultPortfolioService } from './vault-portfolio.service';

@Module({
  imports: [ConfigModule],
  providers: [AlchemyService, PriceService, VaultPortfolioService],
  exports: [AlchemyService, PriceService, VaultPortfolioService],
})
export class BlockchainModule {}
```

### Environment Variables Needed

```bash
# .env
ALCHEMY_API_KEY=your_alchemy_api_key_here
# No key needed for DeFiLlama
```

### Extensibility: DeFi Protocol Balances

The architecture supports future protocol-specific balance fetching:

| Protocol | Data Source | Implementation |
|----------|-----------|----------------|
| Aave V3 positions | On-chain `Pool.getUserAccountData()` via ethers 6 | `AaveService` using ethers `Contract.staticCall` |
| PancakeSwap LP | PancakeSwap Subgraph or on-chain NFT reads | `PancakeSwapService` querying position NFTs |
| General DeFi | DeFiLlama `/protocol/{name}` API | Per-protocol adapter |

Each would implement a common interface:
```typescript
interface ProtocolBalanceProvider {
  getPositions(vaultAddress: string): Promise<ProtocolPosition[]>;
}
```

### Version Conflicts & Dependencies Summary

| Dependency | Status | Notes |
|-----------|--------|-------|
| `alchemy-sdk` | **DO NOT USE** | Archived, ethers v5, conflicts with our stack |
| `ethers` 6.16.0 | **Already installed** | Use for `formatUnits`, address utils |
| Native `fetch` | **Available** | Node.js 18+ built-in, no extra deps |
| `@nestjs/config` | **Already installed** | For `ALCHEMY_API_KEY` env var |

**Zero new npm dependencies needed.** Everything uses native `fetch` + existing `ethers` for formatting utilities.

### BSC-Specific Notes

1. **All major BSC tokens use 18 decimals** (USDT, USDC are 18 on BSC, NOT 6 like Ethereum)
2. DeFiLlama chain identifier is `bsc` (not `binance`, `bnb`, or `bsc-mainnet`)
3. Alchemy RPC network identifier is `bnb-mainnet` (not `bsc-mainnet`)
4. Alchemy Portfolio API network may be `bnb-mainnet` — verify in dashboard
5. Token balances from Alchemy are hex-encoded — use `BigInt(hexString)` to convert
6. DeFiLlama accepts both checksummed and lowercase addresses

### Testing Approach

```typescript
// Learning test: verify Alchemy getTokenBalances works on BSC
// packages/backend/src/blockchain/__tests__/alchemy.integration.spec.ts

describe('AlchemyService (BSC integration)', () => {
  it('should fetch USDT balance for a known address', async () => {
    const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955';
    const KNOWN_HOLDER = '0x...'; // find a known USDT holder on BSCscan

    const result = await alchemyService.getTokenBalances(KNOWN_HOLDER, [BSC_USDT]);

    expect(result.tokenBalances).toHaveLength(1);
    expect(result.tokenBalances[0].contractAddress.toLowerCase()).toBe(BSC_USDT.toLowerCase());
    expect(result.tokenBalances[0].tokenBalance).toBeDefined();
  });
});

// Learning test: verify DeFiLlama returns BSC prices
describe('PriceService (DeFiLlama integration)', () => {
  it('should fetch USDT price on BSC', async () => {
    const BSC_USDT = '0x55d398326f99059fF775485246999027B3197955';
    const prices = await priceService.getTokenPrices([BSC_USDT]);

    const usdtPrice = prices.get(BSC_USDT.toLowerCase());
    expect(usdtPrice).toBeDefined();
    expect(usdtPrice!.price).toBeGreaterThan(0.9);
    expect(usdtPrice!.price).toBeLessThan(1.1);
    expect(usdtPrice!.symbol).toBe('USDT');
    expect(usdtPrice!.decimals).toBe(18); // BSC uses 18 decimals for USDT
  });
});
```

---

## 12. Visual Automation Graph Editor: @xyflow/react (React Flow)

> **Docs source:** Context7 (reactflow.dev, xyflow/web GitHub), June 2026.
> **Scope:** Everything needed to build a visual automation graph editor where users create directed graphs of Conditions and Actions, matching the on-chain Step[] format.

### Version Decision

- **Chosen version:** `@xyflow/react` ^12.11.0 (current stable)
- **Why this version:** Latest v12. Peer deps require `react >=17` — our React 19.2.6 is satisfied. Fully compatible with Vite, TypeScript strict mode, and ESM.
- **Package name:** `@xyflow/react` (NOT `reactflow` — the old package is v11 and deprecated)
- **DO NOT USE:** `reactflow` (v11, deprecated), `@xyflow/react` <12.0 (different API shape)
- **Layout helper:** `@dagrejs/dagre` ^3.0.0 (~35KB, synchronous, good for DAGs). Do NOT use the old unscoped `dagre` (0.8.5, unmaintained). Only upgrade to `elkjs` (~700KB, WASM) if dagre proves insufficient.
- **Known dependency note:** @xyflow/react bundles zustand ^4.4.0 internally. Our project already has zustand 5.0.3 as a transitive dep from wagmi. With pnpm's strict isolation, both coexist safely (each package gets its own copy). Adds ~10KB gzipped to bundle. Do NOT install zustand as a direct dep — it creates confusion.

### Installation

```bash
pnpm --filter frontend add @xyflow/react @dagrejs/dagre
```

**CRITICAL — Tailwind CSS 4 import order:** With Tailwind v4, you MUST import React Flow styles in `src/index.css` (after the Tailwind import), NOT in a component file. Tailwind v4's `@import "tailwindcss"` reorders CSS layers and will override React Flow styles, making nodes/edges invisible.

```css
/* src/index.css */
@import "tailwindcss";
@import "@xyflow/react/dist/style.css";
```

Do NOT use `import '@xyflow/react/dist/style.css'` in a component file — it will be reordered by Tailwind v4's CSS layering.

### Core Concepts

React Flow renders a pannable, zoomable canvas with **nodes** (positioned boxes) and **edges** (connections between nodes). It uses a **controlled component** pattern where you own the nodes/edges state.

**Key data structures:**

```typescript
import type { Node, Edge, Connection, Position } from '@xyflow/react';

// Node: a box on the canvas
interface Node<T = Record<string, unknown>> {
  id: string;                    // unique identifier
  type?: string;                 // maps to nodeTypes registry (default: 'default')
  position: { x: number; y: number }; // top-left corner
  data: T;                       // custom payload passed to your component
  sourcePosition?: Position;     // default handle direction (Top/Right/Bottom/Left)
  targetPosition?: Position;
  parentId?: string;             // for sub-flows / grouping
  extent?: 'parent' | [number, number, number, number]; // constrain within parent
  draggable?: boolean;
  selectable?: boolean;
  hidden?: boolean;
}

// Edge: a connection between two nodes
interface Edge<T = Record<string, unknown>> {
  id: string;                    // unique identifier
  source: string;                // source node id
  target: string;                // target node id
  sourceHandle?: string | null;  // which handle on source (for multi-handle nodes)
  targetHandle?: string | null;  // which handle on target
  type?: string;                 // maps to edgeTypes registry
  animated?: boolean;            // dashed animation
  label?: string | React.ReactNode;
  data?: T;                      // custom payload
  style?: React.CSSProperties;
  markerEnd?: string | { type: MarkerType; color?: string };
  markerStart?: string | { type: MarkerType; color?: string };
}

// Connection: transient object during drag-connect (before becoming an Edge)
interface Connection {
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
}
```

### Minimal Setup (Controlled Flow)

```typescript
import { useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
];
const initialEdges: Edge[] = [];

function FlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );

  return (
    <div style={{ width: '100%', height: '600px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <Background />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

**Critical:** The parent container MUST have explicit width and height. React Flow fills its parent.

### State Management Hooks

#### useNodesState / useEdgesState

Convenience hooks that wrap `useState` and provide change handlers:

```typescript
const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
```

- `setNodes` / `setEdges`: standard React setState (value or updater function)
- `onNodesChange` / `onEdgesChange`: handlers for internal React Flow events (drag, select, delete, etc.)
- Pass all three to `<ReactFlow>` as shown above

#### useReactFlow

Imperative API for programmatic manipulation. Must be used inside `<ReactFlowProvider>`.

```typescript
import { useReactFlow, ReactFlowProvider } from '@xyflow/react';

function GraphToolbar() {
  const {
    getNodes,            // () => Node[]
    getEdges,            // () => Edge[]
    setNodes,            // (nodes: Node[] | updater) => void
    setEdges,            // (edges: Edge[] | updater) => void
    addNodes,            // (nodes: Node | Node[]) => void
    addEdges,            // (edges: Edge | Edge[]) => void
    deleteElements,      // ({ nodes?: Node[], edges?: Edge[] }) => void
    getNode,             // (id: string) => Node | undefined
    getEdge,             // (id: string) => Edge | undefined
    screenToFlowPosition,// ({ x, y }) => { x, y } -- screen coords to flow coords
    fitView,             // (options?) => void
    zoomIn,              // () => void
    zoomOut,             // () => void
    toObject,            // () => { nodes, edges, viewport } -- serialize
  } = useReactFlow();

  return (
    <button onClick={() => fitView({ padding: 0.2 })}>
      Fit View
    </button>
  );
}

// IMPORTANT: Wrap in ReactFlowProvider
function App() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
      <GraphToolbar />
    </ReactFlowProvider>
  );
}
```

### Custom Nodes

Custom nodes are React components. Register them via the `nodeTypes` prop.

```typescript
import { Handle, Position, type NodeProps } from '@xyflow/react';

// Define your data type
type ConditionNodeData = {
  label: string;
  contractAddress: string;
  conditionType: 'TokenBalance' | 'Interval' | 'Timer';
};

// Custom node component
function ConditionNode({ data, selected }: NodeProps) {
  return (
    <div className={`condition-node ${selected ? 'selected' : ''}`}>
      {/* Incoming edge connects here */}
      <Handle type="target" position={Position.Top} />

      <div className="node-header">{data.conditionType}</div>
      <div className="node-body">{data.label}</div>

      {/* Two outgoing handles for true/false branching */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="true"           // unique handle ID
        style={{ left: '30%', background: '#22c55e' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="false"          // unique handle ID
        style={{ left: '70%', background: '#ef4444' }}
      />
    </div>
  );
}

// Register -- MUST be defined outside component (or useMemo) to avoid re-renders
const nodeTypes = {
  condition: ConditionNode,
  action: ActionNode,     // similar pattern, single source handle
};

// Use in ReactFlow
<ReactFlow nodeTypes={nodeTypes} ... />
```

**Handle rules:**
- `type="target"` = incoming connection point
- `type="source"` = outgoing connection point
- Use `id` prop when a node has multiple handles of the same type
- `position`: `Position.Top`, `Position.Right`, `Position.Bottom`, `Position.Left`
- `isConnectable`, `isConnectableStart`, `isConnectableEnd` for fine control

### Custom Edges

Custom edges render SVG paths between nodes. Use `BaseEdge` + path utilities.

```typescript
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  useReactFlow,
  type EdgeProps,
} from '@xyflow/react';

type FlowEdgeData = {
  label: string;    // "true" | "false" | "next"
  branch: 'true' | 'false' | 'next';
};

function FlowEdge({ id, data, ...props }: EdgeProps<FlowEdgeData>) {
  const { deleteElements } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath(props);

  const color = data?.branch === 'true' ? '#22c55e'
              : data?.branch === 'false' ? '#ef4444'
              : '#6b7280';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: color, strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            background: color,
            color: 'white',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          {data?.label}
          <button
            onClick={() => deleteElements({ edges: [{ id }] })}
            style={{ marginLeft: 4, cursor: 'pointer' }}
          >
            x
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = {
  flow: FlowEdge,
};

<ReactFlow edgeTypes={edgeTypes} ... />
```

**Path utilities:**
- `getBezierPath(props)` -- curved (default)
- `getSmoothStepPath(props)` -- right-angle steps with rounded corners (best for flowcharts)
- `getStraightPath(props)` -- straight line

Each returns `[pathString, labelX, labelY, offsetX, offsetY]`.

**EdgeLabelRenderer:** Required for rendering HTML (not SVG) labels on edges. Labels are absolutely positioned divs. Add `className="nodrag nopan"` to prevent panning when clicking the label.

### Drag and Drop from Sidebar

Use the native HTML Drag and Drop API to let users add nodes from a palette.

```typescript
import { useReactFlow, ReactFlowProvider } from '@xyflow/react';

// Sidebar component
function NodePalette() {
  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside>
      <div draggable onDragStart={(e) => onDragStart(e, 'condition')}>
        Condition
      </div>
      <div draggable onDragStart={(e) => onDragStart(e, 'action')}>
        Action
      </div>
    </aside>
  );
}

// In your flow editor component
function FlowEditor() {
  const { screenToFlowPosition, addNodes } = useReactFlow();

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow-type');
    if (!type) return;

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    const newNode: Node = {
      id: crypto.randomUUID(),
      type,
      position,
      data: { label: `New ${type}`, /* defaults */ },
    };

    addNodes(newNode);
  }, [screenToFlowPosition, addNodes]);

  return (
    <ReactFlow
      onDrop={onDrop}
      onDragOver={onDragOver}
      // ... other props
    />
  );
}
```

### Connection Validation

Use `isValidConnection` on `<ReactFlow>` to enforce graph rules.

```typescript
import type { Connection, Edge } from '@xyflow/react';

type IsValidConnection = (edge: Edge | Connection) => boolean;

const isValidConnection: IsValidConnection = (connection) => {
  const { source, target, sourceHandle } = connection;

  // Rule 1: No self-connections
  if (source === target) return false;

  // Rule 2: Conditions must connect via "true" or "false" handles
  // Rule 3: Actions connect via their single "next" handle
  // Rule 4: Prevent duplicate edges from same handle
  // (access nodes/edges via useReactFlow or closure)
  return true;
};

<ReactFlow isValidConnection={isValidConnection} ... />
```

Can also be set per-handle via the `isValidConnection` prop on `<Handle>`, but the `<ReactFlow>` level prop is preferred for performance.

### Key Event Handlers on ReactFlow

```typescript
<ReactFlow
  // State management (required for controlled flow)
  nodes={nodes}
  edges={edges}
  onNodesChange={onNodesChange}      // drag, select, remove, position changes
  onEdgesChange={onEdgesChange}      // select, remove changes
  onConnect={onConnect}              // new connection completed

  // Connection validation
  isValidConnection={isValidConnection}

  // Connection events
  onConnectStart={onConnectStart}    // drag started from handle
  onConnectEnd={onConnectEnd}        // drag ended (connected or not)

  // Node events
  onNodeClick={onNodeClick}          // (event, node) => void
  onNodeDoubleClick={onNodeDoubleClick}
  onNodeDragStop={onNodeDragStop}    // (event, node, nodes) => void -- save positions
  onNodesDelete={onNodesDelete}      // (nodes) => void -- after deletion

  // Edge events
  onEdgeClick={onEdgeClick}
  onEdgesDelete={onEdgesDelete}

  // Pane events
  onPaneClick={onPaneClick}          // click on empty canvas (deselect)

  // Reconnection (drag existing edge to new target)
  onReconnect={onReconnect}          // (oldEdge, newConnection) => void
  onReconnectStart={onReconnectStart}
  onReconnectEnd={onReconnectEnd}

  // Registration
  nodeTypes={nodeTypes}              // custom node components
  edgeTypes={edgeTypes}              // custom edge components

  // Display
  fitView                            // fit on initial render
  connectionLineType={ConnectionLineType.SmoothStep}
  defaultEdgeOptions={{ animated: true, type: 'smoothstep' }}

  // Behavior
  deleteKeyCode="Delete"             // or "Backspace"
  selectionKeyCode="Shift"
  multiSelectionKeyCode="Meta"       // Cmd on Mac
  connectionMode={ConnectionMode.Loose} // allow connecting to any handle
/>
```

### Plugin Components

```typescript
import {
  Controls,     // zoom in/out/fit buttons
  MiniMap,      // bird's-eye overview
  Background,   // dot/line grid pattern
  Panel,        // positioned overlay panel
} from '@xyflow/react';

// Inside <ReactFlow>:
<Controls />
<MiniMap
  pannable
  zoomable
  nodeColor={(node) => node.type === 'condition' ? '#3b82f6' : '#f59e0b'}
/>
<Background variant="dots" gap={16} size={1} />
<Panel position="top-left">
  <button>Auto Layout</button>
</Panel>
```

### Auto-Layout with Dagre

Dagre computes positions for a directed graph. Apply it after any structural change.

```typescript
import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB',
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const isHorizontal = direction === 'LR';
  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? 'left' : 'top',
      sourcePosition: isHorizontal ? 'right' : 'bottom',
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
```

**Usage:** Call `getLayoutedElements` when loading a graph, after adding/removing nodes, or on a "layout" button click. Then `setNodes(layouted.nodes)` and `setEdges(layouted.edges)`.

### Edge Markers (Arrows)

```typescript
import { MarkerType } from '@xyflow/react';

const edge: Edge = {
  id: 'e1-2',
  source: '1',
  target: '2',
  markerEnd: { type: MarkerType.ArrowClosed },
  // or markerEnd: { type: MarkerType.Arrow, color: '#22c55e' },
};
```

### Built-in Node Types

- `'default'` -- one target handle (top), one source handle (bottom)
- `'input'` -- source handle only (start node)
- `'output'` -- target handle only (end node)
- `'group'` -- container for child nodes (sub-flows)

### Sub-flows / Grouping

```typescript
const parentNode: Node = {
  id: 'group-1',
  type: 'group',
  position: { x: 0, y: 0 },
  data: {},
  style: { width: 400, height: 300 },
};

const childNode: Node = {
  id: 'child-1',
  type: 'condition',
  position: { x: 20, y: 40 },     // relative to parent
  parentId: 'group-1',             // makes it a child
  extent: 'parent',                // constrained within parent bounds
  data: { label: 'Nested' },
};
```

### Performance Considerations

1. **nodeTypes and edgeTypes MUST be stable references** -- define outside component or use `useMemo`. Changing the reference causes all nodes to re-render.
2. **Memo your custom node components** with `React.memo()` to avoid unnecessary re-renders.
3. For 500+ nodes, consider:
   - Setting `nodesDraggable={false}` during layout animations
   - Using `onlyRenderVisibleElements` prop (default true)
   - Debouncing position updates
4. `useNodesState` / `useEdgesState` handle immutability internally -- do not spread-copy unnecessarily.

### Serialization: toObject / fromObject

```typescript
const { toObject } = useReactFlow();

// Save
const flowState = toObject();
// Returns: { nodes: Node[], edges: Edge[], viewport: { x, y, zoom } }
const json = JSON.stringify(flowState);

// Restore
const parsed = JSON.parse(json);
setNodes(parsed.nodes);
setEdges(parsed.edges);
```

---

### Application to Strategy Builder: Graph <-> Step[] Conversion

#### Design: Node Types for Automation Steps

| Node Type | Visual | Handles | Maps to |
|-----------|--------|---------|---------|
| `condition` | Blue card | 1 target (top), 2 sources: "true" (green, bottom-left), "false" (red, bottom-right) | `StepType.CONDITION` |
| `action` | Amber card | 1 target (top), 1 source: "next" (bottom) | `StepType.ACTION` |

#### Design: Edge Types

| Edge Type | Visual | Maps to |
|-----------|--------|---------|
| `true-branch` | Green, label "true" | `step.nextOnTrue` |
| `false-branch` | Red, label "false" | `step.nextOnFalse` |
| `next` | Gray, label "next" | Action's `step.nextOnTrue` |

#### Converting React Flow Graph to Step[]

```typescript
import type { Node, Edge } from '@xyflow/react';

const DONE = 0xFFFFFFFF; // type(uint32).max

interface Step {
  stepType: 'CONDITION' | 'ACTION';
  target: string;        // contract address
  selector: string;      // bytes4 function selector
  nextOnTrue: number;    // step index or DONE
  nextOnFalse: number;   // step index or DONE
  data: string;          // ABI-encoded params
}

function graphToSteps(nodes: Node[], edges: Edge[]): Step[] {
  // 1. Topological sort (step 0 must be the trigger/entry node)
  //    Use BFS from the node with no incoming edges (or user-designated start)
  const startNode = findStartNode(nodes, edges);
  const ordered = topologicalSort(startNode, nodes, edges);

  // 2. Create index map: nodeId -> step index
  const indexMap = new Map<string, number>();
  ordered.forEach((node, i) => indexMap.set(node.id, i));

  // 3. Convert each node to a Step
  return ordered.map((node) => {
    const outEdges = edges.filter((e) => e.source === node.id);

    if (node.type === 'condition') {
      const trueEdge = outEdges.find((e) => e.sourceHandle === 'true');
      const falseEdge = outEdges.find((e) => e.sourceHandle === 'false');

      return {
        stepType: 'CONDITION',
        target: node.data.contractAddress,
        selector: node.data.selector,
        nextOnTrue: trueEdge ? indexMap.get(trueEdge.target)! : DONE,
        nextOnFalse: falseEdge ? indexMap.get(falseEdge.target)! : DONE,
        data: node.data.encodedParams,
      };
    } else {
      const nextEdge = outEdges.find((e) => e.sourceHandle === 'next' || !e.sourceHandle);

      return {
        stepType: 'ACTION',
        target: node.data.contractAddress,
        selector: node.data.selector,
        nextOnTrue: nextEdge ? indexMap.get(nextEdge.target)! : DONE,
        nextOnFalse: DONE, // actions always have nextOnFalse = DONE
        data: node.data.encodedParams,
      };
    }
  });
}
```

#### Converting Step[] Back to React Flow Graph

```typescript
function stepsToGraph(steps: Step[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = steps.map((step, i) => ({
    id: `step-${i}`,
    type: step.stepType === 'CONDITION' ? 'condition' : 'action',
    position: { x: 0, y: 0 }, // will be auto-layouted
    data: {
      label: decodeStepLabel(step),
      contractAddress: step.target,
      selector: step.selector,
      encodedParams: step.data,
      stepIndex: i,
    },
  }));

  const edges: Edge[] = [];
  steps.forEach((step, i) => {
    if (step.nextOnTrue !== DONE) {
      edges.push({
        id: `e-${i}-true-${step.nextOnTrue}`,
        source: `step-${i}`,
        target: `step-${step.nextOnTrue}`,
        sourceHandle: step.stepType === 'CONDITION' ? 'true' : 'next',
        type: 'flow',
        data: {
          label: step.stepType === 'CONDITION' ? 'true' : 'next',
          branch: step.stepType === 'CONDITION' ? 'true' : 'next',
        },
      });
    }
    if (step.stepType === 'CONDITION' && step.nextOnFalse !== DONE) {
      edges.push({
        id: `e-${i}-false-${step.nextOnFalse}`,
        source: `step-${i}`,
        target: `step-${step.nextOnFalse}`,
        sourceHandle: 'false',
        type: 'flow',
        data: { label: 'false', branch: 'false' },
      });
    }
  });

  // Apply auto-layout
  const layouted = getLayoutedElements(nodes, edges, 'TB');
  return layouted;
}
```

#### Validation Rules for the Graph Editor

These should be enforced via `isValidConnection` and before `graphToSteps`:

1. **Exactly one start node** (no incoming edges) -- this becomes step 0
2. **For public automations:** step 0 must be a CONDITION (the trigger)
3. **For owner automations:** step 0 can be either CONDITION or ACTION
4. **No cycles** (on-chain traversal has MAX_STEPS=256 guard, but cycles are UX-confusing)
5. **No orphan nodes** (all nodes must be reachable from step 0)
6. **Condition nodes:** "true" handle must connect somewhere (false can be DONE)
7. **Action nodes:** nextOnFalse must always be DONE
8. **Max 256 steps** (on-chain limit)
9. **No duplicate edges** from the same source handle

### Gotchas & Pitfalls

1. **nodeTypes/edgeTypes must be stable references.** Define OUTSIDE the component (module-level) or use `useMemo`. Changing the reference unmounts ALL nodes — catastrophic re-render.

2. **ALWAYS wrap custom node components in `React.memo()`.** Without it, every node change (position, selection, data) re-renders ALL nodes. 100 nodes without memo: 2-10 FPS. With memo: 50-60 FPS.

3. **Wrap ALL callback props with `useCallback`.** Anonymous functions (`onNodeClick={() => ...}`) cause 6x FPS drop.

4. **Focus loss in node forms.** Updating `node.data` creates a new reference, causing uncontrolled inputs to lose focus. Fix: use `defaultValue` + `onBlur` instead of `value` + `onChange`, or store form state separately in a Zustand store.

5. **Add `className="nodrag"` to inputs inside custom nodes** — otherwise dragging the node fires when clicking form inputs. Add `"nopan"` to scrollable containers.

6. **Dynamic handles require `useUpdateNodeInternals()`.** If handles appear/disappear, call this hook after the change. Use `opacity: 0` to hide handles, NOT `display: none` (breaks edge positioning).

7. **Mutations are silently ignored in v12.** Must create new data objects when updating nodes (`{...node, data: {...node.data, label: 'new'}}`, not `node.data.label = 'new'`).

8. **Dagre returns center coordinates** but React Flow uses top-left origin. Always subtract `width/2` and `height/2` from dagre positions. In v12, measured dimensions are in `node.measured.width/height` (NOT `node.width/height`).

9. **Undo/Redo is not built-in.** Implement with a snapshot stack: store `{ nodes, edges }` on semantic actions (node add/delete, edge add/delete, node drag stop). Take snapshots on `onNodeDragStop`, NOT `onNodeDrag`. Limit history depth (~50).

10. **Container MUST have explicit width and height.** React Flow fills its parent — if the parent has no dimensions, the canvas is invisible.

### Testing Strategy

**Priority order (highest ROI first):**

1. **Graph conversion logic (`graphToSteps`, `stepsToGraph`)** — pure functions, no React/DOM dependency, no mocks needed. Test every edge case: cycles, orphans, single-node graphs, max 256 steps, condition-only vs action-only paths.

2. **Validation logic** — pure functions, no mocks. Test all 8+ validation rules individually.

3. **Auto-layout (dagre integration)** — no React Flow mocks needed. Verify node positions are computed and coordinate conversion (center → top-left) is correct.

4. **Component rendering** — requires extensive mocks:
   - Mock `ResizeObserver`, `DOMMatrixReadOnly`, `Element.prototype.offsetHeight/offsetWidth`
   - Mock `SVGElement.getBBox`
   - Disable `nodesDraggable` and `panOnDrag` in tests
   - Use `waitFor` for async edge rendering
   - Consider whether the testing cost is worth it — pure logic tests give more confidence per effort.

5. **E2E interactions** — use Playwright. No mocking needed. Best for validating drag-and-drop, connection drawing, and full flows.

### Context7 Coverage Gaps

The following topics had limited or no documentation coverage in Context7 and may need supplementation from web sources if needed during implementation:

1. **onReconnect / onReconnectStart / onReconnectEnd** -- documented in API reference but no Context7 code examples. These allow dragging an existing edge endpoint to a new node.
2. **NodeToolbar / NodeResizer** -- mentioned as plugin components but no Context7 code snippets. NodeToolbar shows a toolbar when a node is selected. NodeResizer adds resize handles.
3. **Sub-flows (parentId, extent)** -- conceptually documented but no complete Context7 examples showing child nodes constrained within parents.
4. **Performance optimization for large graphs** -- no dedicated Context7 documentation. General React optimization principles (memo, stable refs) apply.
5. **TypeScript generic patterns** -- the hooks accept generic types (`useReactFlow<MyNodeType, MyEdgeType>()`, `EdgeProps<MyEdgeData>`, `NodeProps<MyNodeData>`) but full generic typing examples were sparse.
6. **onDelete callback** -- not found in Context7 results. Use `onNodesDelete` / `onEdgesDelete` instead.
7. **Undo/redo** -- not built-in. Must implement manually using a state history stack.

---

## 12. Conditions / Trigger-Konfiguration (PEC-217) — Zod + React-Flow custom nodes

> **Docs source:** Context7 `/websites/zod_dev_v4` (Zod 4, stable) + `/websites/reactflow_dev` (xyflow v12); repo patterns read 2026-06-03.
> **Scope:** The PEC-217 epic — making `IntervalCondition`, `TimerCondition`, `TokenBalanceCondition` configurable as graph nodes with user-friendly units and auto-allocated context slots.

### Scope reality check (read first)

PEC-217 is **mostly internal work**:
- The three condition **contracts already exist** (see CLAUDE.md "Example Contracts"). No contract work.
- `@xyflow/react` v12 **is already installed and in use** — condition nodes already render (`src/features/automation-editor/components/condition-node.tsx`). See the existing React-Flow section above for the full library reference; this section only adds condition-specific conventions.
- Config forms are **already JSON-Schema-driven** — `StepType.paramSchema` (with `x-ui-widget`/`x-ui-slot-access` extensions) seeded in `packages/backend/prisma/seed.ts`, rendered generically by `dynamic-form.tsx`. Backend already encodes params→ABI and auto-allocates context slots (`EncodingService`/`ContextService`).

**The only genuinely new external dependency is Zod.** It is not installed anywhere today, and there is no `shared` package yet (the MVP layout above planned one, but it was never created).

#### ⚠️ Architectural decision to settle in the PRD

The ticket says "Zod-Schemas für Params-Validierung" + "Params-Schemas in shared-Package". But the system **already validates params via JSON Schema** rendered by `DynamicForm`. Introducing Zod means choosing:

1. **Zod as source of truth** — define params as Zod in a new `shared` package, derive JSON Schema for the DB/form via `z.toJSONSchema()`. Highest consistency, biggest refactor (and `x-ui-*` extensions + transforms don't round-trip — see gotchas).
2. **Zod as a thin layer** — keep the DB-driven `DynamicForm`, add Zod only for frontend pre-submit validation + the unit-conversion boundary. Smallest change; two schemas to keep in sync.
3. **No Zod** — extend the existing JSON-Schema validation with the missing pieces (unit conversion, cross-field rules). No new dependency.

This section documents options 1/2 (Zod assumed per the ticket). **Confirm the choice in the PRD before coding.** Note this supersedes the MVP version table above, which lists `zod ^3.x` — the correct target is now **Zod 4**.

### Existing condition gap this epic closes

`seed.ts` currently defines Interval/Timer params with **raw seconds** UI (`title: 'Interval (seconds)'`, `'Delay (seconds)'`). The ticket's Ergebnisziel #2 wants **hours/days** in the UI and token amounts instead of wei. That conversion layer is the new work — and the #1 named risk ("falsche Einheitenumrechnung").

---

### Part A — Zod

**What:** TypeScript-first schema + validator; one declaration yields a runtime check and a static type (`z.infer`). For PEC-217: validated trigger params + a typed boundary for unit conversion (hours/days→seconds, human amount→wei).

**Version Decision**
- **Chosen:** `zod@^4` (latest stable **4.0.1**; install `zod`, default export is v4).
- **Why:** Stack (TS 5.8 strict, React 19, Node 22, NestJS 11, Vite 6) is well above Zod 4's floor; faster type-checking, smaller bundle, built-in `z.toJSONSchema()`.
- **Hard requirement:** **TypeScript ≥ 5.5, `strict: true`** (repo: TS 5.8 strict → OK). Non-strict tsconfig silently mis-infers.
- **DO NOT USE:**
  - `zod@3.x` — pre-v4 API; no `z.toJSONSchema`, old error API, slower. (Overrides the `^3.x` entry in §9.)
  - The `zod/v4` transitional sub-export (from `zod@3.25.x`) — now that v4 is stable, import from `zod`, not `zod/v4`. Mixing the two yields "two different Zod instances" type errors.
  - `zod-to-json-schema` (3rd-party) — superseded by built-in `z.toJSONSchema()`.
- **Existing deps that interact:** none. Frontend form (`dynamic-form.tsx`) + backend encoder (`encoding.service.ts`) consume JSON Schema, not Zod; NestJS DTOs are plain classes (no class-validator). Clean slate; the only friction is the JSON-Schema form (decision above).
- **Monorepo:** pin **one** Zod version workspace-wide (root override / pnpm `catalog:`). Two copies break type identity. If a `shared` package is created, `zod` is its dependency.
- **Conflicts:** none.

**Install**
```bash
pnpm --filter shared add zod      # option 1 (if shared package created)
pnpm --filter frontend add zod    # option 2 (frontend-only layer)
```
Ships both ESM + CJS; Vite (ESM) and NestJS (CJS) both fine.

**Key API for this feature**

1) **Unit conversion via `.transform()` — input ≠ output type** (the core hours→seconds pattern):
```typescript
const HoursToSeconds = z.number().positive().transform((h) => Math.round(h * 3600));
type In  = z.input<typeof HoursToSeconds>;  // hours  — form binds here
type Out = z.output<typeof HoursToSeconds>; // seconds — encoder consumes here
```
- `z.input` (form) vs `z.output`/`z.infer` (encoder) **matters** — conflating them is the #1 "encoder got hours not seconds" bug.
- `.transform()` returns a `ZodPipe`, **not introspectable** → can't emit JSON Schema from it. Keep transforms **out** of UI-driving / `toJSONSchema` schemas; convert in a separate parse at the form→encode boundary.

2) **`z.coerce` for string text fields** (`x-ui-widget: 'amount'` binds strings):
```typescript
const Amount = z.coerce.bigint();
```
⚠️ Zod 4: input type of any `z.coerce.*` is now **`unknown`** (was specific in v3). For wei, prefer viem `parseUnits(value, decimals)` (decimals are token-specific — the epic assumes 18 but don't hardcode); validate the *string shape* with Zod, do the decimal math in the transform.

3) **Cross-field / value rules via `.refine()`** (e.g. Timer `delta > 0`, "static value XOR context slot"):
```typescript
const TimerParams = z.object({
  delta: z.coerce.number().int().positive(),
  timeSlot: z.union([z.string(), z.literal(4294967295)]).optional(),
}).refine((p) => p.delta > 0, { message: "Delay must be > 0", path: ["delta"] });
```
⚠️ Zod 4: refinements **no longer narrow** types; `ctx.path` is **gone** in `.superRefine()` (set `path` on the issue or use top-level `.refine(..., { path })`); function-as-second-arg messages deprecated → use `{ message, path }`.

4) **Branded types** (optional; cheap insurance against unit mix-ups — the ticket's #1 risk):
```typescript
const Seconds = z.number().int().brand<"Seconds">();
const Wei     = z.bigint().brand<"Wei">();
```

5) **`z.toJSONSchema()`** — only for option 1 (Zod as source of truth):
```typescript
const json = z.toJSONSchema(z.object({ interval: z.number(), timeSlot: z.number() }));
```
Caveat: `.transform()`/`.brand()`/`.refine()` don't round-trip, and the form's `x-ui-widget`/`x-ui-slot-access` extensions aren't producible — attach via `.meta({ 'x-ui-widget': 'context-slot' })` + a post-process step. Non-trivial; budget for it.

**Error handling:** use `safeParse` in form UIs → `{ success, data | error }`; read `error.issues[].{path,message,code}`. v4 renamed `.flatten()`/`.format()` → `z.flattenError()`/`z.treeifyError()`.

**Gotchas (Zod 4-specific):** single workspace version or types diverge · `z.input ≠ z.output` with transform/coerce/default · transforms not introspectable · `z.coerce.*` input is `unknown` · refine no longer narrows + `ctx.path` gone · `.flatten/.format` renamed · TS must be ≥5.5 strict.

**Learning test:** `learning-tests/zod.test.ts` (vitest — repo runner). Pins version + smoke-checks it, and locks the unit-conversion + refine behaviors. Run manually after any Zod bump (NOT in CI):
```bash
pnpm --filter frontend exec vitest run ../../learning-tests/zod.test.ts
```

---

### Part B — React-Flow v12 condition nodes (delta vs existing §React-Flow section)

The library reference is already in this file (custom nodes, `nodeTypes`, handles, `useReactFlow`, container-size gotcha, testing). PEC-217 only adds **condition-node conventions**, taken from the existing `condition-node.tsx`:

- Nodes are `memo`-wrapped, read state from the **Zustand** `editor-store` (current `ConditionNode` casts `data as unknown as EditorNodeData` and updates via the store — stay consistent with that; the React-Flow-native `updateNodeData(id, …)` is the alternative).
- Condition nodes use **two source handles with explicit ids** `"true"`/`"false"` + one target handle. Multiple same-type handles **must** have unique ids or edges attach to the wrong branch.
- Interactive form inputs inside nodes need the **`nodrag`** class (already applied in `dynamic-form.tsx`) so canvas dragging doesn't steal focus.
- New nodes must participate in `validate-graph.ts` (errors surface via `validationErrors` keyed by `nodeId` → red ring).
- v12 typing: `type CondNode = Node<DataShape, 'condition'>` → `NodeProps<CondNode>`. Never mix the old `reactflow` (v11) package with `@xyflow/react` (v12).

No learning test for React-Flow — already exercised by `lib/__tests__/` + Playwright golden-path tests. Cover new nodes via `validate-graph`/`graph-to-steps` unit tests + the Playwright editor flow.

### Open questions for the PRD
1. Zod source-of-truth vs. layer vs. none (decision above) → whether a `shared` package gets created now.
2. Where unit conversion lives — frontend Zod `.transform()` at submit, or backend `EncodingService` (recommend: convert in frontend, re-validate ranges in backend).
3. Wei conversion uses viem `parseUnits` with the token's actual decimals (don't hardcode 18).

---

## 13. PEC-219 Execution & Monitoring — Overview & Architecture Decision

> **Epic:** PEC-219 "Ausführung & Monitoring". **Docs source:** Context7 (The Graph, ethers v6, NestJS 11, Socket.IO — all current) + web (Goldsky webhooks, BSC RPC/WSS gotchas), June 2026.
> **Scope:** (1) per-automation **execution history** (status, gas, timestamp, tx link, paginated); (2) **real-time** push of new executions (toast, no refresh, auto-reconnect, per-vault isolation). The history data source is an open architecture choice — both paths are researched below; the real-time layer (§16, Socket.IO) is shared by both.

### 13.0 The decisive constraint — a reverted execution emits **no** event

`executeAutomation` **reverts** on a failed action or unmet trigger (`TriggerNotMet`, `CallerNotOwner`, action revert). A revert produces **no logs**, so **any log/event indexer — subgraph (§14) OR backend ethers (§15) — yields a SUCCESS-only history.**

The Epic's success-criterion *"Fehlgeschlagene Ausführungen zeigen die Fehlermeldung"* therefore **cannot** be satisfied by indexing on-chain events alone. Failed-run history must come from a **non-log source**:
- **Keeper-reported failures** — `scripts/execute-automations.ts` (the public executor) catches the revert, decodes the reason via the existing `ContractErrorService`, and `POST`s a `status: REVERTED` row. This is the recommended source for the "failure + error message" criterion.
- *(Alternative, expensive)* tracing every `executeAutomation` tx (receipt `status === 0` + `debug_traceTransaction`/revert-reason decode) — needs an archive/trace RPC, not viable on public BSC RPCs.

**Implication:** whichever indexing path is chosen, plan a **second ingestion channel** (keeper → backend `POST /executions`) for failed runs. The indexer covers successes; the keeper covers failures.

### 13.1 Decision matrix — Path A (Goldsky subgraph) vs Path B (backend ethers indexer)

| Dimension | **Path A — Goldsky Subgraph** (§5 + §14) | **Path B — Backend ethers v6 indexer** (§15) |
|---|---|---|
| New infra | Subgraph repo + Goldsky account/deploy + GraphQL client in backend | **None** — reuses existing ethers `JsonRpcProvider` + Prisma/Postgres |
| Reorg handling | **Automatic** (Graph Node rolls back) | **Manual** — confirmation lag (N≈15) + `log.removed` handling in our code |
| Backfill / historical sync | **Managed** from `startBlock` | **Manual** — cursor + chunked `getLogs`, adaptive range halving |
| Dynamic vaults (factory) | **Native** — data-source templates spawn per `VaultCreated` | Address-less topic filter (`getLogs` no `address`) → map `log.address`→vault |
| Pagination | GraphQL `first` + `blockTimestamp_lt`/`id_gt` cursor (skip capped 5000) | SQL `LIMIT/OFFSET` or keyset from Postgres — trivial, no rate limit |
| Query rate limits | Goldsky tier limits (~50 req/10s) | **None** (own DB) |
| Real-time push | Backend polls subgraph **or** Goldsky **webhooks/Mirror** → WS | Indexer persists → calls WS gateway directly (lowest latency, in-process) |
| **Local Hardhat-fork dev** | **❌ NOT supported** — Goldsky/Graph-Node index public chains only; breaks the repo's standard fork loop | **✅ Works against the fork** (`JsonRpcProvider` → `localhost:8545`), same as existing services |
| Transactional consistency with app data | Separate store (GraphQL), eventual | **Same Postgres** as Automations/Vaults — joinable, one source of truth |
| Ops burden | Subgraph versioning/grafting on schema change; managed uptime | Reliability code is ours (cursor, dedupe, range caps, reorg) — §15.5 |
| Latency to "visible" | Sync lag (seconds→minutes) + head-lag | Poll interval + confirmation lag (≈ N×3s on BSC) |

### 13.2 Recommendation

**Start with Path B (backend ethers v6 indexer) for the MVP**, because:
1. **It works on the local BSC fork** — Path A does **not** (§14 gotcha), and the entire dev/test workflow (deploy-fork → seed → keeper → UI) is fork-based. Introducing Goldsky now forces a testnet detour for every history change.
2. **Zero new infra** and **one Postgres** — history rows live next to `Automation`/`Vault`, the WS gateway is fed in-process (lowest real-time latency), and pagination is plain SQL with no rate limit.
3. The §5 subgraph schema/manifest already exists as a **migration target**: if query volume or multi-instance scaling later demands it, lift indexing to Path A and have the backend query Goldsky (or consume Goldsky **webhooks**) with the *same* WS gateway and DB-row shape. The reliability burden (§15.5) is the price; revisit when it outweighs the fork-dev cost.

**Both paths share §16 (Socket.IO)** and **both require the keeper failure channel (§13.0).** This recommendation is for owner sign-off — the matrix above is the basis for choosing A instead if production-grade reorg/backfill correctness outweighs fork-dev convenience from day one.

---

## 14. PEC-219 Path A — Goldsky Subgraph (deltas over §5)

> §5 ("Blockchain Indexing: TheGraph Subgraph + Goldsky") already documents the **schema, manifest, factory→template pattern, deployment, querying, and pinned versions** — that is the Path-A core; do not duplicate it. This section records only what §5 omits and what PEC-219 specifically needs.
> **Docs source:** Context7 `/graphprotocol/docs` (templates, immutable entities, `_meta`) + web (Goldsky webhooks/Mirror, matchstick), June 2026.

### 14.0 Confirmed reusable from §5
The §5 schema already has `ExecutionEvent @entity(immutable: true)` with `executor`, `blockNumber`, `timestamp`, `transactionHash`, derived from `Vault`/`Automation`; the manifest already spawns a `StrategyBuilderVault` **template** per `VaultCreated` via `VaultTemplate.create(event.params.vault)`; pinned `@graphprotocol/graph-cli 0.98.1`, `graph-ts 0.38.2`, `specVersion 1.3.0`, `apiVersion 0.0.9`. **All correct — keep as is.** For gas, §5 already models `GasCompEvent` off the `FeeRegistry` `GasCompDeducted` event; the vault's own `GasCompSettled(automationId, executor, token, gasCompTokens)` can alternatively be indexed on the vault template and joined to `ExecutionEvent` by `txHash`.

### 14.1 Backend GraphQL client (NOT in §5)
Query Goldsky from NestJS with **`graphql-request` `^7.4.0`** (lightweight; v7 is **ESM-only** — under the backend's CJS ts-jest either target ESM or use dynamic `import('graphql-request')`).
```ts
import { GraphQLClient, gql } from 'graphql-request';
const client = new GraphQLClient(process.env.SUBGRAPH_URL!, {
  headers: process.env.GOLDSKY_QUERY_KEY ? { authorization: `Bearer ${process.env.GOLDSKY_QUERY_KEY}` } : {},
});
```

### 14.2 Pagination — cursor, not deep `skip`
§5's example uses `first`/`skip`. **`skip` is capped at 5000 and degrades at depth.** For real history pagination use a **keyset cursor**: order by `timestamp` desc and pass `timestamp_lt: <lastSeen>` per page (cursor on `id`/`id_gt` for a strict total order when timestamps tie).
```graphql
query History($vault: Bytes!, $automationId: BigInt!, $lastTs: BigInt!, $first: Int!) {
  executionEvents(first: $first, orderBy: timestamp, orderDirection: desc,
    where: { vault: $vault, automation_: { automationId: $automationId }, timestamp_lt: $lastTs }) {
    id executor timestamp transactionHash
  }
}
```

### 14.3 Sync-status surface (for the "letzte Aktualisierung" UI requirement)
Query `_meta { block { number } hasIndexingErrors }` to show indexing lag / a "history may be delayed" banner — the Epic's reliability mitigation. `hasIndexingErrors: true` ⇒ a mapping threw and indexing is degraded.

### 14.4 Real-time push without GraphQL subscriptions
**Goldsky has no GraphQL subscriptions.** Two push options instead of backend polling:
- **Goldsky webhooks** — `goldsky subgraph webhook create <name>/<ver> --name exec-hook --url https://api/.../webhooks/goldsky --entity executionEvent --secret "<shared>"`. Payload carries `op` / `entity` / `data.{old,new}`; the **exact auth header/HMAC is undocumented** — validate empirically (treat `--secret` as a shared-secret header check). Backend webhook handler → emits via the §16 WS gateway.
- **Goldsky Mirror** (Postgres/webhook sink) for higher-throughput pipelines (overkill for MVP).
Otherwise: backend **polls** the subgraph on an interval and diffs against `lastSeenTimestamp` → WS.

### 14.5 Gotchas not in §5
- **❌ No local Hardhat-fork support** — the single biggest reason §13.2 defers Path A. Dev requires a self-hosted `graph-node` Docker stack against the fork **or** deploying to BSC testnet; the standard fork loop does not extend to the subgraph.
- **Schema change ⇒ full re-sync** unless you **graft** (`features: [grafting]`, `graft: { base: <deploymentId>, block: N }`) — copies a synced deployment's data to block N and continues. Use Goldsky versioned tags (`name/1.0.1`) + repoint `SUBGRAPH_URL` for zero-downtime cutover.
- **Reverted executions never appear** (§13.0) — don't model `REVERTED` rows from the subgraph.
- `startBlock` = factory deploy block (never `0` — full-chain scan).

### 14.6 Testing — matchstick (no chain, no deploy)
Unit-test mappings with **`matchstick-as` `^0.6.0`** via `graph test`: build mock `ethereum.Event`s (params + `block` + `transaction.hash`), call the handler, assert `assert.fieldEquals('ExecutionEvent', id, 'executor', '0x…')`. Covers the factory→template wiring and txHash/timestamp extraction. **Cannot** cover real on-chain decoding, template spawning, or Goldsky webhook delivery — those need a BSC-testnet subgraph (no fork support).

---

## 15. PEC-219 Path B — Backend Event Indexing with ethers v6 (no-subgraph alternative)

> **Docs source:** Context7 `/websites/ethers_v6` (current API: queryFilter / getLogs / Log / Block / JsonRpcProvider options) + web research June 2026 (WebSocketProvider drop behavior, BSC RPC range limits, @nestjs/schedule version). Each fact below is tagged **[C7]** (Context7, current) or **[web]**.
> **Scope:** Index `AutomationExecuted` (+ `GasCompSettled`, `Deposited`, `Withdrawn`) across **all** vault proxies into Postgres, paginate from the DB, push via WebSocket. Evaluates doing this **in the NestJS backend with ethers v6** instead of the §5 subgraph.

### 15.0 What / why

The §5 Goldsky subgraph is the "managed indexer" path. This section is the **self-hosted alternative**: the backend already holds an ethers v6 `JsonRpcProvider` (HTTP, `^6.16.0`) and a Prisma/Postgres connection, so a long-running indexer service can poll vault logs, persist `Execution`/`FeeEvent` rows (schema already in §2), serve the paginated history endpoint from the DB, and feed the WS gateway — no extra infra, no GraphQL.

**The defining constraint:** a **failed** execution **reverts and emits no event**. On-chain logs therefore only ever yield `SUCCESS` rows. `REVERTED` / `TRIGGER_NOT_MET` executions are **invisible to any log indexer** (subgraph included). If the history must show failed attempts, they have to come from the **keeper** (`scripts/execute-automations.ts`) catching the revert and POSTing it, or from tracing every `executeAutomation` tx in a block (expensive). Decide this explicitly — the log indexer alone gives a *success-only* history.

**Trade-off vs subgraph:** backend indexing wins on infra simplicity, transactional consistency with app data (one Postgres), and zero query-rate limits; it loses the subgraph's automatic reorg handling, managed backfill, and dynamic-data-source-per-vault. The reliability burden (cursor, reorgs, dedupe, RPC range caps, WSS drops) moves into our code — that burden is §15.5, the core of this evaluation.

### 15.1 Version decision

| Package | Version | Note |
|---|---|---|
| `ethers` | `^6.16.0` (already pinned) | No bump needed. All APIs below are v6. **[C7]** |
| `@nestjs/schedule` | `^6.1.3` (latest, Apr 2026) | Peer-compatible with NestJS 11. Provides `@Interval()`, `@Cron()`, `SchedulerRegistry`. Use **only** as a lifecycle host; the poll loop itself should be a self-rescheduling async loop (see §15.6), not a fixed `@Interval` that can overlap a slow RPC call. **[web]** |

Do **not** use `WebSocketProvider` for the primary indexer (see §15.5). Keep the existing **HTTP `JsonRpcProvider` + interval `queryFilter`/`getLogs`** model.

### 15.2 Listening approaches in ethers v6 — trade-offs

| Approach | API | Misses events? | Backfill? | Verdict for this feature |
|---|---|---|---|---|
| `contract.on(filter, cb)` | event subscription | **Yes** — silent gaps reported on BSC (events arrive ~4/5 times via WS, no recovery until reconnect) **[web]**; over HTTP it falls back to **polling filters** anyway | No (only live) | ❌ no durable cursor, no restart backfill |
| `provider.on(filterObj, cb)` | low-level log subscription | Same as above | No | ❌ same |
| **`contract.queryFilter(filter, from, to)`** / **`provider.getLogs({topics, from, to})`** on an interval | explicit range pull | **No** — you control the range and persist a cursor | **Yes** — re-query any past range | ✅ **chosen**: durable, backfillable, reorg-safe |

`JsonRpcProvider` "processes events by polling the backend for the current block number; when it advances, block-based events are checked." Default events use **filters and fall back to polling** (`polling: false` default; set `polling: true` to force) **[C7]**. For a durable indexer we bypass the event system entirely and drive ranges ourselves.

**Matching one event across MANY vault addresses — address-less topic filter.** `getLogs` with **no `address`** field but a topic filter returns matching logs from *every* contract, then map `log.address → vault`. This is the key to indexing all proxies in one call (vs N per-contract subscriptions):

```ts
import { Interface, id, JsonRpcProvider } from "ethers";

const vaultIface = new Interface(strategyBuilderVaultAbi); // impl ABI (proxies emit, impl defines)
const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true }); // skip per-call eth_chainId [C7]

// topic0 = keccak256 of the canonical event signature
const TOPIC_EXECUTED = id("AutomationExecuted(uint32,address)");
const TOPIC_GASCOMP  = id("GasCompSettled(uint32,address,address,uint256)");

// One getLogs across ALL vaults — no `address` key:
const logs = await provider.getLogs({
  fromBlock, toBlock,
  topics: [[TOPIC_EXECUTED, TOPIC_GASCOMP]], // array-of-array = OR on topic0
});

for (const log of logs) {
  const parsed = vaultIface.parseLog(log);   // -> { name, args } or null if unknown
  if (!parsed) continue;
  const vault = log.address;                  // map back to the vault proxy
  // parsed.name, parsed.args.automationId (bigint), parsed.args.executor, ...
}
```

- `contract.filters.AutomationExecuted(id)` builds a **per-contract** filter (includes `address`) — fine if you instantiate one `Contract` per vault, but defeats the single-call advantage. Prefer the address-less form above and gate on `isRegisteredVault` / a known-vault set loaded from the DB to ignore unrelated contracts that happen to share a topic. **[C7]**
- `iface.parseLog(log)` returns `null` for non-matching logs — always null-check. **[C7]**

### 15.3 Key methods (with snippets)

**queryFilter (per-contract, indexed-arg filter):** `contract.queryFilter(event, fromBlock?, toBlock?) ⇒ Promise<Array<EventLog | Log>>`. Negative `fromBlock` = relative to head (`-100` = last 100 blocks). **[C7]**
```ts
const vault = new Contract(vaultAddr, abi, provider);
const filter = vault.filters.AutomationExecuted(automationId); // topic-encoded indexed arg
const events = await vault.queryFilter(filter, fromBlock, toBlock); // EventLog[] -> e.args destructured
```

**getLogs (range + topics, address-less):** see §15.2. Returns `Log[]` (raw — no decoded `args`; decode with `iface.parseLog`). **[C7]**

**getBlock (timestamp):** `provider.getBlock(blockNumberOrHash) ⇒ Block | null`; `block.timestamp` is **seconds since epoch (number)**, `block.date` is a `Date | null`. **[C7]**
```ts
const block = await provider.getBlock(log.blockNumber);
const ts = new Date(block!.timestamp * 1000); // -> Execution.blockTimestamp (DateTime)
```

**parseLog:** `iface.parseLog({ topics, data }) ⇒ LogDescription | null` → `.name`, `.args` (named + positional; uint→`bigint`). **[C7]**

### 15.4 Data formats (the fields the history needs)

**`Log`** (from `getLogs`) — **[C7]**: `log.address` (emitting vault), `log.blockNumber` (number), `log.blockHash`, `log.transactionHash`, `log.index` (**log index in block** — note v6 renamed v5's `logIndex` → `index`), `log.data`, `log.topics`, `log.removed` (true if dropped by reorg). Dedupe key = **`transactionHash` + `index`**.

**`Block`** — **[C7]**: `block.timestamp` (number, seconds), `block.date` (Date|null), `block.number`, `block.hash`, `block.gasUsed` (bigint). One `getBlock` per distinct block; cache by block number to avoid re-fetching when several events share a block.

**`TransactionReceipt`** (only if you need real gas spent) — `receipt.gasUsed` (bigint) × `receipt.gasPrice`/`effectiveGasPrice`. **For our schema you usually do NOT need this:** the `GasCompSettled(automationId, executor, token, gasCompTokens)` event already carries `gasCompTokens` in its data — decode it straight from the log into `Execution.gasCompAmount` (string) + `gasCompToken`. Reading the receipt is an **extra RPC per event**; the event is cheaper and is the value actually charged. **[C7 for receipt shape; design note]**

**Field → source map for one `Execution` row:**
| Column | Source | RPC cost |
|---|---|---|
| `automationId`, `executorAddress` | `AutomationExecuted` args (indexed) | none (in log) |
| `gasCompAmount`, `gasCompToken` | `GasCompSettled` args (same tx) | none (in log) |
| `txHash`, `blockNumber` | `log.transactionHash` / `log.blockNumber` | none |
| `blockTimestamp` | `getBlock(blockNumber).timestamp` | 1 per block (cache) |
| `status` | always `SUCCESS` for logged events (revert emits nothing) | n/a |

**Avoiding the per-event timestamp RPC:** logs in the same block share a timestamp — fetch `getBlock` **once per block number** and reuse. When processing a contiguous range you already know `toBlock`; batch the distinct block numbers. (BSC has no log-embedded timestamp, so at least one `getBlock` per block is unavoidable; ethers batches these JSON-RPC calls automatically via `batchMaxCount: 100` default.) **[C7]**

### 15.5 Error handling & reliability gotchas — **the core of this evaluation**

1. **Persist a `lastProcessedBlock` cursor + backfill on restart.** The indexer must store the highest fully-processed block (e.g. a `IndexerCursor` row or reuse `Vault.createdAtBlock` as the per-feature floor). On boot, resume from `cursor + 1`; never trust in-memory state. Without this, any downtime = permanently missed `AutomationExecuted` events (they're not re-emitted). **[design]**

2. **BSC public-RPC `getLogs` range limits.** Public BSC endpoints reject wide ranges and `fromBlock: 0`. The project already hit this — see CLAUDE.md: `FeeService` scans `fromBlock: currentBlock - 10_000` because `fromBlock: 0` triggers an upstream full-chain scan that gets rejected. **Chunk `getLogs` into bounded windows** (commonly ≤ 2k–5k blocks per call on bsc-dataseed-class RPCs; use an archive RPC — BlastAPI/Alchemy — for backfill, per the fork notes). Implement adaptive chunking: on a range-limit error, halve the window and retry. **[web + project CLAUDE.md]**

3. **Reorg handling — index with a confirmation lag.** Only treat blocks `≤ head - N` as final; BSC reorgs are shallow but real (3s blocks). Use **N ≈ 15** confirmations (≈45s) for history. Set the poll's `toBlock = currentBlock - N`. Any log with `log.removed === true` (seen only if you index nearer the tip) must delete its row. Safer: stay behind the lag and never index unconfirmed blocks. The subgraph does this for you; here it's your code. **[design; web]**

4. **Duplicate delivery / idempotency.** Re-querying an overlapping range (after a crash, or because chunk windows overlap by design for safety) re-delivers logs. **Dedupe on `(txHash, logIndex)`** — add a Prisma `@@unique([txHash, logIndex])` to `Execution`/`FeeEvent` (or upsert). The current `Execution` model has `@@index([txHash])` but no unique guard — **add `logIndex` + a composite unique** before relying on at-least-once polling. **[design]**

5. **WebSocketProvider drops connections silently — do NOT use it as the source of truth.** On BSC public RPCs, WSS closes silently; ethers v6 (≥6.8.1) has a known issue where `contract.on` over WS receives events ~4/5 of the time with no recovery until reconnect, and the `onclose` handler is not wired into the `WebSocketLike` interface, so disconnects aren't surfaced. There is **no built-in reconnection** in ethers v6. If WS is ever used for low-latency *notification*, it must be paired with the authoritative `getLogs` poll as backstop (WS = "wake up and poll", never the system of record), plus a manual ping/heartbeat + reconnect-on-close wrapper. For this feature: **HTTP polling only.** **[web: ethers issues #4470, #4587, #1053]**

6. **`JsonRpcProvider` default `pollingInterval`.** ethers v6 polls roughly every ~4s by default for its event system; you control your own loop interval instead. Set `provider.pollingInterval` if you ever use `.on`, but the durable indexer uses an explicit interval (≈ block time × a few, e.g. 6–12s on BSC). Use `{ staticNetwork: true }` to suppress a per-request `eth_chainId` round-trip on a fixed chain. **[C7]**

7. **Slow-RPC overlap.** A fixed `@Interval(6000)` can fire again while the previous `getLogs` chain is still running → double-processing / cursor races. Use a **self-rescheduling loop** (run → await → `setTimeout(next)`) or an in-flight mutex/`isRunning` flag. **[design]**

8. **Local fork clock lag (dev).** Per CLAUDE.md, an idle Hardhat fork only advances `block.timestamp` when a block is mined; `getBlock().timestamp` can lag wall-clock. Relevant when asserting timestamps in fork tests (§15.7). **[project CLAUDE.md]**

### 15.6 NestJS integration

```ts
@Injectable()
export class ExecutionIndexer implements OnModuleInit, OnModuleDestroy {
  private provider = new JsonRpcProvider(this.cfg.rpcUrl, undefined, { staticNetwork: true });
  private iface = new Interface(strategyBuilderVaultAbi);
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly CONFIRMATIONS = 15;
  private readonly MAX_RANGE = 2_000;

  constructor(private prisma: PrismaService, private cfg: ConfigService,
              private gateway: ExecutionGateway) {}

  onModuleInit() { this.scheduleNext(0); }       // self-rescheduling, not @Interval (§15.5.7)
  onModuleDestroy() {                            // graceful shutdown
    if (this.timer) clearTimeout(this.timer);
    this.provider.removeAllListeners();
    this.provider.destroy();                     // closes transports/timers [C7]
  }

  private scheduleNext(ms: number) { this.timer = setTimeout(() => this.tick(), ms); }

  private async tick() {
    if (this.running) return this.scheduleNext(6_000);
    this.running = true;
    try {
      const head = await this.provider.getBlockNumber();
      const safeHead = head - this.CONFIRMATIONS;
      let from = (await this.getCursor()) + 1;
      while (from <= safeHead) {
        const to = Math.min(from + this.MAX_RANGE - 1, safeHead);
        const logs = await this.provider.getLogs({ fromBlock: from, toBlock: to,
          topics: [[TOPIC_EXECUTED, TOPIC_GASCOMP]] }); // address-less, all vaults
        await this.persist(logs);                 // parseLog + getBlock(cache) + upsert by (txHash,index)
        await this.setCursor(to);
        from = to + 1;
      }
    } catch (e) { /* adaptive: on range-limit halve MAX_RANGE; log + retry next tick */ }
    finally { this.running = false; this.scheduleNext(6_000); }
  }
}
```

- Host it as a plain `@Injectable` provider with `OnModuleInit`/`OnModuleDestroy` — `@nestjs/schedule` is **optional** here (only needed if you prefer `@Cron`/`SchedulerRegistry` to manage the timer). Add `ScheduleModule.forRoot()` to `AppModule` if used.
- After persisting new rows, push them through the existing WS gateway (`this.gateway.emitExecution(row)`).
- Filter `logs` to known vaults: load registered vault addresses from the DB (`Vault` table) into a `Set<string>` (lowercased) and skip `log.address` not in it — cheaper than `factory.isRegisteredVault` per log.

### 15.7 Testing strategy (against the Hardhat BSC fork)

Hardhat 3 + ethers via `network.connect()` (ESM, top-level await — matches the contracts suite). The indexer is plain TS, so it can also be unit-tested in the backend Jest suite by pointing its `JsonRpcProvider` at `http://localhost:8545`.

1. **Deterministic emit → assert pickup:** in a fork test, execute an automation (`vault.executeAutomation(id)` from a non-owner so `GasCompSettled` also fires), `evm_mine` past `CONFIRMATIONS`, run one `tick()`, assert an `Execution` row exists with the right `automationId`/`executor`/`gasCompAmount` and `blockTimestamp` from `getBlock`.
2. **Multi-vault address-less filter:** create ≥2 vaults via the factory, execute one automation in each in the same block range, assert the single address-less `getLogs` picks up both and maps `log.address → vault` correctly.
3. **Backfill / cursor:** process to block X, persist cursor, simulate restart (new indexer instance), execute more, assert it resumes from `cursor+1` with no gap and no duplicate.
4. **Idempotency:** run `tick()` twice over an overlapping range; assert row count unchanged (the `(txHash, index)` unique guard holds).
5. **Range chunking:** set `MAX_RANGE` small (e.g. 5), span events across > MAX_RANGE blocks (`evm_mine` in a loop), assert all are indexed across multiple `getLogs` windows.
6. **Reorg lag:** mine to head, assert events within the `CONFIRMATIONS` window are **not** yet indexed (only `≤ head - N`).
7. **Revert is invisible (the critical caveat):** make an automation revert (trigger-not-met / failing action), execute, mine, run `tick()`, assert **no** `Execution` row appears from logs — proving failed runs need a non-log source.

Time/timestamp assertions: mine a wall-clock block (`evm_setNextBlockTimestamp` + `evm_mine`) before reading `getBlock().timestamp` to avoid the idle-fork clock lag (§15.5.8).

---

## 16. PEC-219 Real-Time Updates — NestJS WebSockets + Socket.IO (shared by Path A & B)

> **Docs source:** Context7 (NestJS 11 gateways/guards/adapter/WsException; socket.io v4) + web (client reconnection defaults, server/client major-match, BSC-irrelevant), June 2026. **[C7]** / **[web]** tags below.
> **Scope:** push a `new execution` event to the vault-detail UI (toast, no refresh), auto-reconnect with exponential backoff, **per-vault isolation** (a client only receives events for vaults its wallet owns — *"kein Datenleck"*).

### 16.1 Version decision (NestJS 11 — exact compatible set)
| Package | Version | Where | Source |
|---|---|---|---|
| `@nestjs/websockets` | `^11.1.x` (match NestJS major **11**) | backend | npm/[C7] |
| `@nestjs/platform-socket.io` | `^11.1.x` (match **11**) | backend | npm/[C7] |
| `socket.io` | `^4.8.x` (peer of platform pkg) | backend | npm |
| `socket.io-client` | `^4.8.x` | frontend + backend (e2e test) | npm |

**Compatibility rule:** Socket.IO **server major MUST equal client major** (both **v4**) — a v4↔v2/v3 mix silently fails to connect. `rxjs ^7.1.0` peer already satisfied (`^7.8.2`). **[web]**

### 16.2 Authentication — the no-data-leak boundary (most important)
**Two layers.** The global `APP_GUARD` (`WalletAuthGuard`) is an **HTTP guard and does NOT protect gateways** — WS handlers are unguarded unless you add WS auth explicitly. **[C7]**

1. **Handshake JWT (reject before connect).** Client sends `io(url, { auth: { token } })`; server reads `socket.handshake.auth.token` (prefer `auth` over query — query leaks to logs; browsers can't set custom headers on the WS upgrade). Verify with the existing `JwtService` in `handleConnection`; on failure `client.disconnect(true)`. On success attach `client.data.address = payload.sub` (mirrors `JwtStrategy.validate` → `{ address: payload.sub }`). **[C7]**
2. **Per-vault room authorization (the isolation boundary).** Never auto-join. Client emits `subscribe { vaultAddress }`; handler runs the **same DB ownership check as `VaultOwnerGuard`** (`prisma.vault.findUnique` → `ownerAddress === client.data.address`) **before** `client.join(\`vault:\${address}\`)`; reject with `throw new WsException('NOT_VAULT_OWNER')`. Server only ever emits `server.to(\`vault:\${address}\`).emit(...)` → a socket that never joined the room cannot physically receive it.

### 16.3 Key skeletons
```ts
@WebSocketGateway({ namespace: '/executions',
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true } })
export class ExecutionsGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    try {
      const p = this.jwt.verify(client.handshake.auth?.token ?? '', { secret: process.env.JWT_SECRET });
      client.data.address = p.sub;
    } catch { client.disconnect(true); }
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(@ConnectedSocket() c: Socket, @MessageBody() b: { vaultAddress: string }) {
    const v = await this.prisma.vault.findUnique({ where: { address: b.vaultAddress } });
    if (!v || v.ownerAddress !== c.data.address) throw new WsException('NOT_VAULT_OWNER');
    await c.join(`vault:${b.vaultAddress}`);
    return { event: 'subscribed', data: { vaultAddress: b.vaultAddress } };
  }

  emitExecution(vaultAddress: string, payload: ExecutionEvent) {   // called by the indexer (§15) / webhook (§14.4)
    this.server.to(`vault:${vaultAddress}`).emit('execution', payload);
  }
}
```
Gateways are providers — declare in the owning module's `providers` and inject where executions are persisted. **[C7]**

**Client (React 19 — reconnection is built-in):**
```ts
const socket = io(`${API_URL}/executions`, { auth: { token: jwt } });
// defaults already = exponential backoff + jitter:
//   reconnection:true, reconnectionDelay:1000, reconnectionDelayMax:5000,
//   randomizationFactor:0.5, reconnectionAttempts:Infinity   (no custom backoff needed)
socket.on('connect', () => socket.emit('subscribe', { vaultAddress })); // RE-JOIN on every (re)connect
socket.on('execution', (e) => toast(`Automation #${e.automationId} executed`));
socket.on('connect_error', (err) => {/* auth/CORS failure */});
// useEffect cleanup: socket.off(...) + socket.disconnect()  (StrictMode double-mount → guard duplicate sockets/toasts)
```

### 16.4 Event payload (emit shape)
```ts
type ExecutionEvent = {
  vaultAddress: string; automationId: number; txHash: string;
  status: 'success' | 'reverted';        // 'reverted' only via the keeper failure channel (§13.0)
  triggerFired: boolean; gasCompPaid?: string; timestamp: number; // unix seconds
};
```
`subscribe` (client→server): `{ vaultAddress }` → ack `{ event:'subscribed', data:{ vaultAddress } }`. Optional `unsubscribe` → `client.leave(...)`.

### 16.5 Gotchas
- **Server/client major must match (v4↔v4)** — mismatch = silent no-connect. **[web]**
- **Global HTTP `APP_GUARD` does NOT guard gateways** — add WS auth in `handleConnection` / a `WsJwtGuard` (`ctx.switchToWs().getClient()`) / adapter middleware. **[C7]**
- **CORS is separate** — set `cors` in `@WebSocketGateway` (or a custom `IoAdapter.createIOServer`); `app.enableCors()` in `main.ts` does **not** cover the Socket.IO server. The repo already has `FRONTEND_URL` for HTTP CORS — reuse it. **[C7]**
- **Use ONE namespace (`/executions`) + rooms (`vault:<addr>`)** for per-vault fan-out — not per-vault namespaces. **[C7]**
- **Reconnection is automatic; room membership is NOT** — re-emit `subscribe` on every `connect` (covers first connect + reconnects). **[web]**
- **Custom `IoAdapter`** needed only when feeding `@nestjs/config` values, installing connection-level `server.use(...)` auth middleware, or (later) the Redis adapter. `app.useWebSocketAdapter(...)` in `main.ts`. **[C7]**
- **Horizontal scaling (later)** — multiple backend instances need `@socket.io/redis-adapter` so `server.to(room)` reaches sockets on other instances; single-instance dev/fork doesn't. **[C7]**
- **React StrictMode** double-invokes effects — create socket + listeners in `useEffect`, cleanup with `socket.off` + `socket.disconnect()` to avoid duplicate live sockets/toasts (same `useRef`-guard discipline the repo uses for one-shot effects).

### 16.6 Testing
- **e2e (covers the isolation requirement):** boot Nest (`createNestApplication` + `app.listen(0)`), connect a real `socket.io-client` with a signed test JWT. Assert (a) socket on `vault:A` receives an `execution` emitted to `vault:A`; (b) a **different wallet's socket does NOT** receive it (the core *kein-Datenleck* assertion — use a short timeout to assert non-delivery); (c) `subscribe` to a non-owned vault → `exception`/no-join.
- **Unit:** instantiate the gateway with mocked `JwtService`/`PrismaService`; stub `client = { handshake:{auth:{token}}, data:{}, join, disconnect }`; assert the `join`/`disconnect`/`WsException` branches. `@nestjs/testing` + `supertest` already present; add `socket.io-client` (dev) for the e2e client.

---

## 17. Vault-Cockpit — DeFi-Positionen-READ + Wert-/Performance-Historie (Epic `vault-cockpit-epic.md`)

> **Docs source:** WebSearch/WebFetch (Aave + PancakeSwap Docs, The Graph Explorer, DeFiLlama Coins API), 2026-06-05. **Refresh/Delete nach Abschluss des Cockpit-Epics.**
> **Scope:** Nur die **Read-Seite** für das Cockpit (Positionen anzeigen, Wertverlauf, PnL). Die *Write*-Actions sind PEC-218 (§6) und nicht Teil hiervon. DeFiLlama-`chart`/`historical`/`batchHistorical`-Endpoints sind bereits in **§11** dokumentiert — hier nur die Deltas (Aave/PCS-Position-Reads, RPC-vs-Subgraph, Snapshot-/PnL-Modell).
> **Verifiziert:** Aave-Addr gegen §6 (`PoolAddressesProvider 0xff75B6da…`) konsistent; restliche Adressen unten vor Gebrauch on-chain prüfen.

### 17.0 RPC vs. Subgraph — Entscheidung: **RPC-first**

| Kriterium | RPC (ethers v6, bestehend) | Subgraph (The Graph) |
|---|---|---|
| Neue Abhängigkeit | Keine (nutzt Indexer-Provider) | API-Key + GRT-Billing pro Query |
| Hosted Service | — | **Seit Juni 2024 abgeschaltet** → nur noch Decentralized Network (kostenpflichtig) oder protokoll-eigenes Gateway |
| Aktueller Zustand (HF, Fees, Liquidität) | Exakt, blockgenau | Indexer-Lag (Minuten), reorg-fähig |
| Uncollected Fees (PCS) | `collect`-staticCall = exakter Live-Wert | feeGrowth-Math od. veraltetes `tokensOwed` |
| Historie | teuer (Archive-Reads) | Subgraph-Stärke |
| Earnings/APY | selbst rechnen (Formeln unten) | teils vorberechnet |

**Begründung:** Das Cockpit braucht primär den **aktuellen** Zustand → RPC ist exakt + nutzt vorhandene Infra. Die einzige Subgraph-Stärke (Historie) lösen wir billiger über **eigene Snapshots** (§17.3). Subgraph würde einen kostenpflichtigen externen Dienst + Key-Management einführen, ohne MVP-Mehrwert. **[web — Hosted-Service-Sunset]**

### 17.1 Aave V3 — Position lesen (RPC, BSC)

**Adressen (BSC 56, vor Gebrauch on-chain verifizieren):**
- `PoolAddressesProvider` `0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D` (= §6) → `getPool()` / `getPriceOracle()` zur Laufzeit auflösen, nicht hardcoden.
- `UiPoolDataProviderV3` `0xc0179321f0825c3e0F59Fe7Ca4E40557b97797a3` **(⚠️ verifizieren — periphery driftet)**.

**Schnellster Read-Pfad = `UiPoolDataProviderV3` (der Pfad, den Aaves UI nutzt):**
- `getReservesData(provider) → (AggregatedReserveData[], BaseCurrencyInfo)` — alle Reserves mit `underlyingAsset`, `decimals`, `liquidityRate`(RAY), `variableBorrowRate`(RAY), `liquidityIndex`, `aTokenAddress`, `variableDebtTokenAddress`, `priceInMarketReferenceCurrency`, `reserveLiquidationThreshold`. **Ein Call.**
- `getUserReservesData(provider, user) → (UserReserveData[], uint8 emode)` — pro Reserve `scaledATokenBalance`, `scaledVariableDebt`, `usageAsCollateralEnabledOnUser`. **Ein Call.**

**Aggregierte Risiko-Kennzahlen** (direkt aus dem Pool, siehe auch §6): `Pool.getUserAccountData(vault) → (totalCollateralBase, totalDebtBase, availableBorrowsBase, currentLiquidationThreshold, ltv, healthFactor)`. Base = **USD, 8 Dezimalen** (`/1e8`); `healthFactor` **1e18**, bei **keiner Debt = `type(uint256).max`** → als „∞ / keine Liquidationsgefahr" rendern (sonst UI-Bug). `ltv`/`liquidationThreshold` in **bps**.

**Per-Reserve Beträge:** supplied = `aToken.balanceOf(vault)` (rebasing, inkl. Zinsen — nie zusätzlich aufzinsen), debt = `variableDebtToken.balanceOf(vault)`.

**Supply-/Borrow-APY aus RAY-Raten (selbst rechnen, per-Sekunde-Compounding):**
```
RAY = 1e27 ; SECONDS_PER_YEAR = 31_536_000
APR = liquidityRate / RAY               // bzw. variableBorrowRate / RAY
APY = (1 + APR / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1
```
(Float reicht für die Anzeige; entspricht Aave-`calculateCompoundedInterest`.)

**Accrued Earnings (MVP):** `current_supplied_USD − net_principal_USD`, mit `net_principal` aus den vom Indexer erfassten Supply/Withdraw-Events (write-time-USD wie Deposits in PEC-219). Exakt-on-chain via `scaledBalance × liquidityIndex / RAY` ist aufwändiger → nicht MVP.

### 17.2 PancakeSwap V3 — LP-Positionen lesen (RPC, BSC)

**Adressen (= §6):** NPM `0x46A15B0b27311cedF172AB29E4f4766fbE7F4364`, Factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`.

**Enumeration** (NPM ist `ERC721Enumerable`, Vault custodiert NFTs via `onERC721Received`): `n = NPM.balanceOf(vault)`; `tokenId = NPM.tokenOfOwnerByIndex(vault, i)`.

**`NPM.positions(tokenId)` →** `(nonce, operator, token0, token1, fee, tickLower, tickUpper, liquidity, feeGrowthInside0LastX128, feeGrowthInside1LastX128, tokensOwed0, tokensOwed1)`.

**⚠️ Uncollected Fees — `tokensOwed` ist VERALTET** (nur bei mint/increase/decrease/collect aktualisiert). Echten Live-Wert via **`collect`-staticCall** (kein State-Change):
```ts
const MAX_U128 = 2n ** 128n - 1n;
const [fee0, fee1] = await npm.collect.staticCall(
  { tokenId, recipient: vaultAddress, amount0Max: MAX_U128, amount1Max: MAX_U128 },
  { from: vaultAddress }   // ethers v6: from MUSS owner/approved sein, sonst revert
);
```
(Standard-Trick, Uniswap/Pancake identisch.) **[web]**

**Positions-Token-Beträge aus `liquidity`:** `pool = Factory.getPool(token0, token1, fee)`; `(sqrtPriceX96, tick,…) = pool.slot0()`; `getAmountsForLiquidity(sqrtPriceX96, sqrtRatioAtTick(tickLower), sqrtRatioAtTick(tickUpper), liquidity)` → `(amount0, amount1)` (Uniswap-V3-`LiquidityAmounts`/`TickMath`, **BigInt** — Q96/Q128 niemals als `number`). PancakeSwap V3 = Uniswap-V3-Fork → Math identisch; im Backend hand-rollen ODER `@uniswap/v3-sdk` nur im Frontend.

**in-range:** `tickLower <= tick < tickUpper`. **USD-Wert:** `(amount0+fee0)×price0 + (amount1+fee1)×price1` (DeFiLlama).

### 17.3 Wert-Historie + PnL — Snapshot-Ansatz (nicht Event-Rekonstruktion)

**Token-Preis-Historie ≠ Vault-WERT-Historie** (Wert hängt auch von rebasing-aTokens, LP-Fees, Tick-abhängigem LP-Wert ab → historische Rekonstruktion zu komplex).

**Empfehlung:** periodischer Backend-Cron schreibt `VaultValueSnapshot(vaultId, timestamp, totalValueUsd, breakdownJson)`; Chart (Story 2) liest Snapshots. Reuse der vorhandenen Indexer-Kadenz + `PriceService`. Granularität = Cron-Intervall.

**PnL (Story 3):** `PnL_abs = currentValueUsd − netDeposits`, `netDeposits = Σ depositUsd − Σ withdrawUsd` aus den **bereits write-time-USD-frozen** VaultEvents (PEC-219). `PnL% = PnL_abs / netDeposits`. DeFiLlama **`/prices/historical`** (§11) nur als Backfill, falls für Alt-Events kein USD eingefroren ist. Vermeidet Archive-RPC-Reads und Subgraph-Kosten.

### 17.4 Gotchas (Delta zu §6)

1. **The-Graph Hosted Service tot (Juni 2024)** — alte Aave/Pancake-Hosted-Endpoints liefern nichts; Decentralized Network = Key + GRT. → RPC-first.
2. **PCS `tokensOwed` veraltet** → nur `collect`-staticCall (mit `from: vault`) gibt echte uncollected Fees. Häufigster Integrationsfehler.
3. **Aave Base = 8 Dezimalen (USD), nicht 18** — typischer 1e10-Fehler; dieselbe `×1e10`-Normalisierung wie `ActionLib`-HF-Math nutzen.
4. **`healthFactor = uint256.max` bei keiner Debt** — als ∞ rendern.
5. **Q96/Q128 + RAY mit BigInt** — `number` overflowt.
6. **Reads pro Position einzeln fangen** — eine kaputte Position darf das Cockpit nicht killen; Leerzustände (kein aToken / `balanceOf==0`) als sauberen Empty-State, nicht als Fehler.
7. **Fork:** idle BSC-Fork bewegt sich nicht (Fork-Clock-Lag, CLAUDE.md) — für UI-Tests Positionen via die Actions erzeugen + Block minen.
8. **`UiPoolDataProviderV3`-Adresse vor Gebrauch on-chain verifizieren** (periphery wird neu deployt).

### 17.5 Version Decision (Delta)

- **Primär `ethers ^6.16.0`** (bestehend) für alle Reads über `INDEXER_PROVIDER`. **Keine** neue Backend-Dependency nötig.
- **`@aave/contract-helpers` NICHT einziehen** (ethers-v5-Annahmen → Konflikt mit v6-Provider); falls überhaupt, nur `@aave/math-utils` (pure Math). APY-Formel ist ~10 Zeilen → hand-rollen bevorzugt.
- **`@uniswap/v3-sdk` nur im Frontend** oder `LiquidityAmounts`/`TickMath` im Backend hand-rollen (kein JSBI-Ballast im Backend).
- **`graphql-request` / Subgraph-Client NICHT** (RPC-first).
- DeFiLlama: kein Key, raw HTTP, bereits in `PriceService` — nur um `getHistoricalPrices`/`chart` erweitern (§11).

### 17.6 Testing Strategy (Delta)

- **DeFiLlama:** `fetch` mocken (wie `price.service.spec.ts`); historical/chart-Shapes + low-confidence/fehlende-Coin abdecken.
- **Aave/PCS Reads:** Integration gegen den **BSC-Fork** nach `deploy-fork.ts` — Positionen via die existierenden Actions erzeugen (Supply/Borrow, LP-Mint), dann Read-Service prüfen. Unit: vorhandene Mocks (`MockAaveV3`, `MockNonfungiblePositionManager.accrue`) nutzen; **`UiPoolDataProviderV3` ist noch nicht gemockt** → Fork-Test oder schlanker Mock.
- **`collect`-staticCall:** assert Revert ohne `from`-Owner; mit `from` kommen die akkruierten Fees (nicht `tokensOwed`) zurück.
- **APY/LiquidityAmounts-Math** (falls hand-gerollt): Hard-Fixture-Unit-Tests analog `test/ActionLibHF.ts` (fängt 10ⁿ-Skalierungsfehler).

### 17.7 Sources

- Aave Pool / Addresses / UiPoolDataProviderV3 — https://aave.com/docs/aave-v3/smart-contracts/pool · https://aave.com/docs/resources/addresses · https://github.com/aave/aave-v3-periphery/blob/master/contracts/misc/UiPoolDataProviderV3.sol
- Aave Subgraphs / Graph Explorer — https://github.com/aave/protocol-subgraphs · https://thegraph.com/explorer
- PancakeSwap NPM / Subgraph — https://docs.pancakeswap.finance/ · https://developer.pancakeswap.finance/apis/subgraph
- Uniswap V3 Collect-Fees (gleiche Math) — https://docs.uniswap.org/sdk/v3/guides/liquidity/liquidity-fees
- DeFiLlama Coins API — https://docs.llama.fi/coin-prices-api (Endpoints siehe §11)

---

> **Remember:** Delete this file after the MVP sprint is complete. Stale research leads to code against APIs that no longer exist.
