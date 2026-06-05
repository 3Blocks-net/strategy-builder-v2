# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Strategy Builder V2

## Overview

On-chain automation protocol deployed on BSC. Users create **vaults** (ERC1967 proxies) and configure **automations** — directed graphs of Conditions and Actions. A public executor calls `executeAutomation`, the trigger condition gates execution, and actions run in sequence modifying the vault's shared context. Fees are charged at the vault boundary (deposit/withdraw BPS), and executors receive gas compensation from a pre-funded deposit in FeeRegistry.

Beyond the example steps, the vault can run real **DeFi actions** (PEC-218): **Aave V3** Supply/Withdraw/Borrow/Repay and **PancakeSwap V3** Swap/LP-Mint/Increase/Decrease/Collect — nine stateless, delegatecall-executed action contracts wired through per-protocol address registries (`AaveV3Registry`, `PancakeSwapV3Registry`) and a shared computation library (`ActionLib`). See **DeFi Actions** below.

**Execution monitoring (PEC-219):** a backend **indexer** (ethers v6 poll loop) reads on-chain events across all vaults into Postgres and pushes new successful runs over a WebSocket; the public **keeper** reports failures (reverts emit no logs) to a secured ingest endpoint. The vault detail page shows a unified, real-time execution history (successes + deposits/withdraws + decoded failures). See **Key Backend Patterns → Execution monitoring** and the `IndexerModule`.

## Monorepo Structure

pnpm workspaces with packages in `packages/`:

| Package | Path | Description |
|---------|------|-------------|
| `contracts` | `packages/contracts` | Hardhat smart contracts (Solidity) |
| `backend` | `packages/backend` | NestJS API server (TypeScript) |
| `frontend` | `packages/frontend` | Vite + React SPA (TypeScript) |

## Commands

**Root (workspace scripts):**
```bash
pnpm install                 # Install all workspace dependencies
pnpm dev                     # Start DB + backend + frontend (unified dev; builds shared first, then watches it)
pnpm shared:build            # Build shared package → single-CJS dist/ (consumed by backend + frontend)
pnpm shared:build:watch      # Rebuild shared on change (used by pnpm dev)
pnpm db:up                   # Start PostgreSQL via Docker
pnpm db:down                 # Stop PostgreSQL
pnpm db:migrate              # Run Prisma migrations
pnpm contracts:compile       # Compile contracts + extract ABIs to frontend
pnpm contracts:test          # Run contract tests
pnpm contracts:clean         # Clean contract artifacts
pnpm contracts:fork:bsc      # Start BSC mainnet fork on localhost:8545
pnpm contracts:deploy:fork   # Deploy all contracts to fork (incl. MockPriceOracle + gas config + the 2 DeFi registries + 9 actions)
pnpm contracts:execute:fork  # Keeper: execute all externally-runnable automations
pnpm backend:dev             # Start backend in watch mode
pnpm backend:build           # Build backend
pnpm backend:test            # Run backend unit tests (builds shared first via pnpm topology)
pnpm backend:test:e2e        # Run backend e2e tests (builds shared first via pnpm topology)
pnpm frontend:dev            # Start frontend dev server
pnpm frontend:build          # Build frontend for production
pnpm frontend:test           # Run frontend tests (builds shared first via pnpm topology)
```

**`shared` package** (`packages/shared`) — framework-free, IO-free pure helpers (unit conversion, validation) consumed by **both** backend (ts-jest/CJS) and frontend (Vite/ESM). Built to a **single-CJS `dist/`** (no dual output) via `tsc`, exposed through an `exports` map; **`shared/dist` must be built before backend/frontend type-check, test, or build**. The `backend:test`/`frontend:test` root scripts and `pnpm dev` handle this automatically (`pnpm --filter "<pkg>^..." build` builds workspace deps topologically; `dev` builds once then watches). Backend Jest `transformIgnorePatterns` includes `/shared/dist/` so ts-jest requires the built CJS directly instead of recompiling it. No `zod` (validation is hand-written and generic over `paramSchema` metadata).

**From `packages/contracts/`:**
```bash
npx hardhat compile          # Compile all contracts
npx hardhat test             # Run all tests
npx hardhat test test/StrategyBuilderVault.ts   # Run single test file
npx hardhat clean            # Clean artifacts
npx hardhat test --grep "pattern"  # Run tests matching pattern
npx hardhat node --network bscFork  # Start BSC fork node (Chain ID 31337)
npx hardhat run --build-profile production --network localhost scripts/deploy-fork.ts  # Deploy the full system to a running fork
npx hardhat run --network localhost scripts/deploy-defi-actions.ts  # Incremental: deploy ONLY the 2 registries + 9 DeFi actions, merge into fork-latest.json
```

**`scripts/deploy-defi-actions.ts`** — deploys only the DeFi-actions Epic contracts (the two registries + nine actions) and **merges** their addresses into the existing `deployments/fork-latest.json`, leaving the factory / FeeRegistry / vault implementation / existing vaults untouched. Use it when the base system is already deployed and you just need the new actions to get real, distinct addresses (then `pnpm --filter backend prisma:seed`). A full `deploy-fork.ts` would mint a new factory address → orphaned vaults + `.env` changes + service restart.

**Deploy** (Hardhat Ignition):
```bash
npx hardhat ignition deploy --network bscTestnet ignition/modules/StrategyBuilderVault.ts
npx hardhat ignition deploy --network bscMainnet ignition/modules/StrategyBuilderVault.ts
```

**Local Development Workflow** (order matters — services need the deployed addresses in their `.env`):
```bash
# Terminal 1: pnpm contracts:fork:bsc    (BSC fork node)
# Terminal 2: pnpm contracts:deploy:fork (deploy contracts → copy addresses to .env files)
# Terminal 3: pnpm dev                   (DB + backend + frontend, after .env is filled)
#             ↳ pnpm dev builds packages/shared first, then keeps it rebuilding in watch.
#               Running backend/frontend test or build standalone? They build shared first
#               via pnpm topology, but a manual `pnpm shared:build` is the fallback if dist/ is missing.
```
**After a fresh redeploy, re-seed the backend StepType table** (`pnpm --filter backend prisma:seed`) — it reads condition/action addresses from `deployments/fork-latest.json`. Skipping this leaves stale addresses, so newly built automations encode dead contract addresses and revert (`ConditionCallFailed`). The seed upserts by `(contractAddress, selector)`, so delete old `StepType` rows first if addresses changed (e.g. `TRUNCATE "StepType" RESTART IDENTITY CASCADE` then re-seed). **Re-seeding does NOT fix already-deployed automations** — their step addresses are baked into the vault's on-chain steps, so a drifted automation manifests as the keeper logging `skip: trigger not met` (the stale condition's `check()` reverts → `isTriggerMet` false); the automation must be **re-deployed** (editor → update / `updateAutomationSteps`) to pick up the current addresses. On an already-running setup prefer `scripts/deploy-defi-actions.ts` (incremental, leaves factory/conditions/vaults untouched) over a full `deploy-fork.ts` to avoid the drift entirely.

**Hardhat 3** (`hardhat ^3.2.0`) — uses `defineConfig`, `network.connect()`, and ESM (`"type": "module"` in package.json). Tests use top-level `await` for network connection:
```typescript
const { ethers } = await network.connect();
```

**Compiler**: Solidity 0.8.28, `viaIR: true` (required — stack-too-deep in `_executeAction`), 200 optimizer runs in production profile. Target chain: BSC.

**BSC Fork** — `bscFork` network in hardhat config uses `forking: { url }` (NOT `fork`). Requires archive-capable RPC (BlastAPI, Alchemy — NOT `bsc-dataseed.binance.org`). Fork runs as `hardhat node --network bscFork` on Chain ID 31337. Deploy script targets `--network localhost` (HTTP to running node), NOT `--network bscFork` (which spawns its own in-process fork).

**Deploy Script** — `scripts/deploy-fork.ts` deploys all contracts (FeeRegistry, Factory, Vault impl, 5 example contracts), configures FeeRegistry with USDT+WBNB, deploys a **MockPriceOracle** and calls **`setGasConfig`** (oracle, nativeToken=WBNB, executorMarkupBps=1000, overhead=50k, maxGasPrice=0; prices WBNB=$600, USDT=$1) so gas compensation is active on the fork, and seeds test wallet with tokens via whale impersonation. **Must compile with `--build-profile production`** (optimizer required — without it, vault proxy deployment fails with StackOverflow due to 21KB unoptimized bytecode). Output: console addresses + `deployments/fork-latest.json` (incl. `PriceOracle` and `config.gasComp`).

**Keeper Script** — `scripts/execute-automations.ts` (`pnpm contracts:execute:fork`) iterates all factory-registered vaults and executes every externally-runnable automation (active, public/non-owner-only, trigger met) from an external account, logging gas compensation. Before checking it mines a block at wall-clock time (`evm_setNextBlockTimestamp` + `evm_mine`) so the idle fork's `block.timestamp` matches real time — otherwise time-based triggers due in the UI are seen as not-met on-chain. Env: `EXECUTOR_PRIVATE_KEY`, `FACTORY_ADDRESS`, `SKIP_TIME_SYNC=1`.

**ABI Extraction** — `scripts/extract-abis.js` runs after `hardhat compile`, writes typed `as const` ABI files to `packages/frontend/src/lib/abis/`.

**Critical Dev Gotchas:**
- `NODE_ENV=development` must be in `packages/backend/.env` — without it, portfolio service uses Alchemy API instead of local RPC balance reads
- Frontend disables viem multicall on Hardhat chain (31337) to avoid StackOverflow from multicall3 simulation
- Frontend `wagmi.ts` puts `hardhat` chain first in dev mode, `bsc` first in production — controls MetaMask auto-switch on connect
- All vault proxy calls (`createVault`, `deposit`, `withdraw`) need explicit `gas` overrides in frontend hooks — Hardhat fork gas estimation is unreliable for proxy delegatecalls
- `FeeService.getAcceptedTokens()` scans logs with `fromBlock: currentBlock - 10_000` (not 0) — `fromBlock: 0` on a fork triggers upstream RPC full-chain scan which gets rejected
- **Fork clock lags wall-clock**: an idle Hardhat fork only advances `block.timestamp` when a block is mined. `TriggerStatusService` computes interval/timer status from the backend's `Date.now()`, while on-chain `isTriggerMet` uses `block.timestamp` — so a time-trigger can show "Ready to fire" in the UI but be not-met on-chain. The keeper script mines a wall-clock block to align them.
- **Indexer confirmation lag on an idle fork** (PEC-219): the indexer only processes blocks `≤ head − INDEXER_CONFIRMATIONS` (default 5, reorg safety), but an idle fork never mines the confirmation blocks → fresh deposits/executions stay "unconfirmed" and never appear in the history. **Set `INDEXER_CONFIRMATIONS=0` in `packages/backend/.env` for the fork** (no reorgs there) and restart the backend. Diagnose via `GET /indexer/status` (does the cursor advance past the event's block?). Same root cause family as the fork-clock lag.
- **Gas-comp bootstrap**: external (non-owner) execution settles gas comp from `FeeRegistry.vaultDeposits[vault][token]`; if empty it reverts `InsufficientFeeDeposit`. Fund via `vault.depositFees(token, amount)` (owner, from vault balance) or a `FeeDepositAction` step. The `FeeDepositAction` is a no-op when `vault.minFeeDeposit() == 0` (`FeeDepositAction.sol`), so a positive `minFeeDeposit` is required for auto-top-up.

## Architecture

### Deployment Topology

```
StrategyBuilderVaultFactory  (Ownable, NOT upgradeable, implements IVaultRegistry)
    │  owns _vaultImplementation (shared implementation)
    │  stores feeRegistry → forwarded to every new vault
    └─ deploys ERC1967Proxy instances via CREATE2
           │  proxy.implementation = StrategyBuilderVault
           └─ per-user isolated storage

FeeRegistry  (Ownable, NOT upgradeable)
    │  stores depositFeeBps / withdrawFeeBps (global flat rates, max 1000 bps)
    │  holds vaultDeposits[vault][token] (gas comp pre-funding)
    │  holds collectedFees[token] (deposit/withdraw fees for owner withdrawal)
    └─ gas compensation via IPriceOracle

External contracts (pre-existing, read-only interfaces):
    IPriceOracle   — 18-decimal USD prices per token
```

### Execution Flow (`executeAutomation`)

1. Check `ownerOnly` — non-owner callers revert with `CallerNotOwner`
2. Load vault context (`bytes[]`) into memory
3. Traverse directed graph starting at step 0:
   - **Public automations**: step 0 must be a CONDITION (the trigger)
   - **Owner automations**: step 0 can be ACTION (runs unconditionally)
   - **Condition**: `staticcall` → `bool` → follow `nextOnTrue` or `nextOnFalse`
   - **Action**: `delegatecall` → apply context diff → follow `nextOnTrue`
   - On failure both **re-revert with the original revert bytes**: `ConditionCallFailed(uint32 stepIndex, bytes reason)` / `ActionExecutionFailed(uint32 stepIndex, bytes reason)` (PEC-219 #02) — so the keeper/backend can decode the real protocol reason instead of a swallowed generic error.
4. Record `triggerFired` on the first step (step 0)
   - If step 0 condition returns false and caller is not owner → revert `TriggerNotMet`
5. If `triggerFired`: call `afterExecution` (staticcall) on step 0 — applies context diff (e.g. IntervalCondition advances schedule)
6. Save context back to storage (only when modified)
7. If caller is not owner: measure `gasUsed = gasStart - gasleft()` → `_settleGasComp`

### Fee Model

```
Fees at vault boundary (deposit/withdraw):
  deposit():  fee = amount × depositFeeBps / 10_000 → FeeRegistry.collectFee()
  withdraw(): fee = amount × withdrawFeeBps / 10_000 → FeeRegistry.collectFee()
  ERC20TransferAction: reads withdrawFeeBps dynamically, deducts from transfer

Gas compensation (per automation execution, non-owner callers only):
  effectiveGasPrice = min(tx.gasprice, maxGasPrice)  (if maxGasPrice > 0)
  gasCostUSD = (gasUsed + overhead) × effectiveGasPrice × nativePriceUSD / 1e18
  gasCompUSD = gasCostUSD × (10_000 + executorMarkupBps) / 10_000
  gasCompTokens = feeTokenAmount(gasCompUSD)
  → deducted from vault's pre-funded deposit in FeeRegistry
  → transferred directly to executor (push, not pull)

Fee collection:
  collectedFees[token] accumulates in FeeRegistry
  Owner calls withdrawFees(token) to withdraw
```

Owner-executed automations pay no gas compensation.

## Key Interfaces

### IAction (`execute`)

```solidity
function execute(bytes calldata params, bytes[] calldata ctx)
    external
    returns (uint32[] memory updatedSlots, bytes[] memory updatedValues);
```

- Called via **delegatecall** — runs in vault's storage context
- **Must be stateless** (no state variables)
- Returns a context diff as two parallel arrays

### ICondition (`check`)

```solidity
function check(bytes calldata params, bytes[] calldata ctx)
    external view returns (bool met);
```

- Called via **staticcall** — read-only

### IUpdatableCondition (`afterExecution`)

```solidity
function afterExecution(bytes calldata params, bytes[] calldata ctx)
    external view returns (uint32[] memory updatedSlots, bytes[] memory updatedValues);
```

- Extends ICondition
- Called via **staticcall** on step 0 after successful execution
- Vault applies returned diff before saving context

## Contract Reference

### StrategyBuilderVault

**State** (set once at `initialize`):
- `_feeRegistry` — IFeeRegistry; address(0) = fees disabled
- `_depositToken` — ERC-20 for gas comp pre-funding; address(0) = gas comp disabled

**Other state:**
- `_automations` — mapping(uint32 → Automation), each has `active`, `ownerOnly`, `steps[]`
- `_ctx` — shared `bytes[]` context, all automations read/write the same slots
- `_minFeeDeposit` — target balance in FeeRegistry (for FeeDepositAction)

**Constants:**
- `DONE = type(uint32).max` — terminates graph traversal
- `MAX_STEPS = 256` — per-execution step limit

**Key functions:**
- `createAutomation(steps[])` — public automation, step 0 must be CONDITION (created `active = true`)
- `createOwnerAutomation(steps[])` — owner-only automation, step 0 can be ACTION (created `active = true`)
- `updateAutomationSteps(id, steps[])` — replace all steps (context unaffected)
- `setAutomationActive(id, bool)` — pause or resume (automations have no on-chain delete; deactivate is the only way to stop one)
- `setContext(bytes[])` — replace entire shared context
- `setContextSlot(slot, value)` — update a single context slot
- `deposit(token, amount)` — owner deposits tokens, deducts depositFee to FeeRegistry
- `withdraw(token, amount, recipient)` — owner withdraws, deducts withdrawFee from amount
- `depositFees(token, amount)` — moves vault tokens to FeeRegistry for gas comp pre-funding
- `setMinFeeDeposit(amount)` — set target fee reserve for FeeDepositAction
- `withdrawETH(to, amount)` — recover accidentally sent ETH (amount=0 sends full balance)
- `executeAutomation(automationId)` — public; owner-only automations restricted to owner
- `isTriggerMet(automationId)` — view, checks if trigger condition is currently true
- `onERC721Received(...)` — returns the ERC-721 magic selector so the vault can custody PancakeSwap V3 LP position NFTs (proactive, unconditional; works even if NPM uses `_safeMint`). Existing vaults pick this up via `setVaultImplementation`.

**Views:** `getAutomation(id)`, `getContext()`, `automationCount()`, `depositToken()`, `feeRegistry()`, `minFeeDeposit()`

**Step struct:**
```solidity
struct Step {
    StepType stepType;   // CONDITION or ACTION
    address target;
    bytes4 selector;
    uint32 nextOnTrue;   // next step index or DONE
    uint32 nextOnFalse;  // CONDITION: branch | ACTION: must be DONE
    bytes data;          // ABI-encoded static params
}
```

### StrategyBuilderVaultFactory

Implements `IVaultRegistry` — `isRegisteredVault(address) → bool`.

**Protocol-controlled (owner only):**
- `setVaultImplementation(address)` — implementation for future vaults
- `setFeeRegistry(address)` — forwarded to all new vaults

**Vault creation:**
```solidity
function createVault(
    address vaultOwner,
    address depositToken_,  // address(0) = gas comp disabled
    bytes32 salt
) external returns (address vault)
```
- `depositToken_` is validated against FeeRegistry — reverts `FeeTokenNotAccepted` if not accepted
- CREATE2 salt mixed with `msg.sender` to prevent address griefing

**Views:** `vaultImplementation()`, `getVault(index)`, `vaultCount()`, `isRegisteredVault(addr)`

### FeeRegistry

**Setup sequence:**
1. `addAcceptedToken(token, decimals)` — register fee-payment ERC-20s
2. `setDepositFeeBps(bps)` / `setWithdrawFeeBps(bps)` — max 1000 bps (10%)
3. `setGasConfig(priceOracle, nativeToken, executorMarkupBps, overhead, maxGasPrice)` — optional

**Vault-facing:**
- `collectFee(token, amount)` — pulls fee via transferFrom, accumulates in `collectedFees`
- `deductGasComp(token, executor, gasUsed)` — computes gas comp, deducts from vault deposit, transfers to executor
- `depositFor(vault, token, amount)` — pre-fund gas comp deposit
- `withdrawDeposit(token, amount)` — vault withdraws its deposit (0 = full balance)

**Owner:**
- `withdrawFees(token)` — withdraw accumulated deposit/withdraw fees
- `removeAcceptedToken(token)` — disable a token

**Views:** `depositFeeBps()`, `withdrawFeeBps()`, `isAcceptedToken(token)`, `vaultDeposit(vault, token)`, `collectedFees(token)`, `priceOracle()`, `nativeToken()`, `estimateGasComp(token, gasUsed, gasPrice)`

**Invariant**: `physicalBalance(token) == Σ vaultDeposits[*][token] + collectedFees[token]`

## Example Contracts

### TokenBalanceCondition

Checks `IERC20(token).balanceOf(account) >= threshold`.

```solidity
struct Params {
    address token;
    address account;
    uint256 minBalance;
    bool aboveOrEqual;
    uint32 minBalanceFromSlot;  // type(uint32).max = use static value
}
```

### IntervalCondition

Time-based trigger. Fires when `block.timestamp >= ctx[timeSlot]`. After execution, advances `ctx[timeSlot] += interval` (drift-free).

```solidity
struct Params {
    uint256 interval;   // seconds between executions
    uint32 timeSlot;    // context slot holding next trigger time (uint256)
}
```

### TimerCondition

One-shot trigger. Fires once when `block.timestamp >= startTime + delta`, then resets slot to 0 via `afterExecution`.

```solidity
struct Params {
    uint256 delta;     // seconds after startTime before firing (must be > 0)
    uint32 timeSlot;   // context slot holding start timestamp (0 = stopped)
}
```

### ERC20TransferAction

Transfers ERC-20 from vault to recipient. Optionally deducts withdraw fee.

```solidity
struct Params {
    address token;
    address recipient;
    uint256 amount;           // 0 = full vault balance
    uint32 amountFromSlot;    // type(uint32).max = use static amount
    uint32 amountToSlot;      // type(uint32).max = no context write
    address feeRegistry;      // address(0) = no fee deduction
}
```

When `feeRegistry != address(0)`, reads `withdrawFeeBps()` dynamically and deducts fee from transfer amount.

### FeeDepositAction

Tops up vault's gas comp deposit when below `vault.minFeeDeposit()`.

```solidity
struct Params {
    address feeRegistry;
    address token;
    uint256 topUpAmount;    // 0 = fill exactly to minFeeDeposit
}
```

**No-op when `minFeeDeposit == 0`** — set a positive `minFeeDeposit` (vault `setMinFeeDeposit`) for auto-top-up to work.

## DeFi Actions (Aave V3 + PancakeSwap V3 — PEC-218)

Nine stateless, delegatecall-executed action contracts that perform real on-chain DeFi from the vault. They never `delegatecall` into the external protocols — they use regular `call`, `SafeERC20.forceApprove`, and **reset every approval back to 0** after a pull. Each action holds an `immutable registry` (immutables live in bytecode → read correctly under delegatecall, so the action stays stateless and address-portable).

### Registries (`contracts/registries/`)

- **`AaveV3Registry`** — stores the Aave **`PoolAddressesProvider`** (BSC `0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D`) as `immutable`, resolves + caches the `Pool` in the constructor. Does **not** cache the price oracle — `priceOracle()` resolves it at call time via `provider.getPriceOracle()`, so a governance oracle re-point is followed and the HF math reads the same oracle Aave uses. Zero-address construction reverts.
- **`PancakeSwapV3Registry`** — stores `SwapRouter` (`0x1b81…`), `NonfungiblePositionManager` (`0x46A1…`), `Factory` (`0x0BFb…`) as three `immutable`s. No oracle. Zero-address construction reverts.
- Both are **immutable — no owner, no setters**. Re-targeting a chain = deploy new registries + repoint actions.

### `ActionLib` (`contracts/libraries/ActionLib.sol`)

Pure `library` of `internal` functions, inlined into each action's bytecode (delegatecall-safe, no storage). Carries:
- **v1 primitives** — `NO_SLOT = type(uint32).max`; `AmountMode` enum `{FIXED, FROM_SLOT, MAX_AVAILABLE, TARGET_HF}` (integer values are part of the ABI — keep stable); `readUint256Slot` (bounds-checked), `fullBalance`, `singleSlotDiff` (empty diff on `NO_SLOT`). The three ERC-20 amount conventions (`0 = full balance`, `uint256.max = "all"`, explicit) are kept **strictly separate** so they can't leak between actions.
- **HF/oracle engine** — 18-decimal normalization (`×1e10` for Aave's 8-dec base values **and** `getAssetPrice`), `baseToToken`/`tokenToBase` at dynamic decimals (floors), the inverse target-HF math in four directions (`targetDebtBase` for Borrow/Repay, `targetCollateralBase` for Supply/Withdraw), `maxSafeWithdrawBase` (HF ≥ 1 floor), `applyHaircut` (`HAIRCUT_BPS = 50`, applied only to Borrow-MAX / Withdraw-MAX), `requireValidTargetHF` (`MIN_TARGET_HF = 1.05e18`), `loadAaveCtx`. **Mandatory hard-fixture unit tests** live in `test/ActionLibHF.ts` (exercised via `ActionLibHarness`) — a 10ⁿ scaling error is caught there, not by fork tests.

### The nine actions (`contracts/actions/`)

| Action | External call | Approval | Amount / params |
|---|---|---|---|
| `AaveV3SupplyAction` | `Pool.supply` | ✅ reset 0 | 4-mode; MAX = full balance |
| `AaveV3WithdrawAction` | `Pool.withdraw` → actual | ❌ | 4-mode; MAX = max-safe (`uint256.max` only when no debt); actual → slot |
| `AaveV3BorrowAction` | `Pool.borrow(...,2,...)` | ❌ | 4-mode; MAX = `availableBorrows` − haircut; rate **always 2 (variable)**; borrowed → slot |
| `AaveV3RepayAction` | `Pool.repay(...,2,...)` → actual | ✅ reset 0 | 4-mode; MAX = `min(debt, balance)` (revert-free); actual → slot |
| `PancakeSwapV3SwapAction` | `SwapRouter.exactInputSingle` → amountOut | ✅ reset 0 | in: slot/full/fixed; **`amountOutMinimum = 0`**, `sqrtPriceLimitX96 = 0`; amountOut → slot |
| `PancakeSwapV3MintAction` | `NPM.mint` → (tokenId, …) | ✅ both, reset 0 | range explicit/preset; `amountMin = 0`; **tokenId → slot** |
| `PancakeSwapV3IncreaseLiquidityAction` | `NPM.increaseLiquidity` | ✅ both, reset 0 | tokenId from slot; per-token amounts; `amountMin = 0` |
| `PancakeSwapV3DecreaseLiquidityAction` | `NPM.decreaseLiquidity` **then** `NPM.collect(max,max)` | ❌ | tokenId from slot; **percentage** (1–100) of live `positions().liquidity` |
| `PancakeSwapV3CollectAction` | `NPM.collect(max,max)` | ❌ | tokenId from slot |

- **Aave 4-mode model** (all four Aave actions): `mode ∈ {FIXED, FROM_SLOT, MAX_AVAILABLE, TARGET_HF}`. `MAX_AVAILABLE` resolves per-action (table above). `TARGET_HF` computes the amount that moves the position to `targetHealthFactor` (inverse-HF math): **wrong-direction → no-op** (amount 0, the step proceeds, never reverts), **holdings cap → best-effort**, `MAX_AVAILABLE` never reverts from edge rounding. `targetHealthFactor` must be `> 1.05e18`. The oracle-bound modes (`MAX_AVAILABLE` for Withdraw/Borrow, all `TARGET_HF`) read `getUserAccountData` + `getAssetPrice`; FIXED / FROM_SLOT / Supply-MAX / Repay-MAX read neither.
- **Swap / LP price protection — removed by design** (PRD): swaps ship `amountOutMinimum = 0`, `sqrtPriceLimitX96 = 0`; LP mint/increase/decrease use `amount0Min = amount1Min = 0`. Priority is that the step **executes** over price-protection; the swap struct keeps optional `amountOutMinimum` + `minOutFromSlot` (default 0) so protection can be enabled later without redeploy. (Epic success-criterion conflict pending owner sign-off — see PRD.)
- **Mint tick range** — `rangeMode 0` (explicit): frontend computes `tickLower`/`tickUpper` off-chain, rounded **outward** to spacing, sorted to the token0<token1 order; action uses as-is. `rangeMode 1` (preset): frontend passes only `tickDelta`; the action reads `pool.slot0().tick` (via `Factory.getPool`) and centers `tick ∓ tickDelta`, rounded outward. Token ordering + amounts are auto-sorted.
- **Decrease bundles `collect`** — `decreaseLiquidity` alone only accrues to the position; the bundled `collect(max,max)` is what delivers the freed tokens (+ fees) to the vault (the classic LP integration bug, explicitly asserted in tests).
- `deadline = block.timestamp` for all swap/LP calls. All nine actions are **< 8 KB** under the production profile (EIP-170 well clear).

### New external interfaces (`contracts/interfaces/external/`)

`IAaveV3Pool` (supply/withdraw/borrow/repay + `getUserAccountData`/`getReserveData`), `IPoolAddressesProvider` (`getPool`, `getPriceOracle`), `IAaveOracle` (`getAssetPrice`), `IPancakeV3SwapRouter` (`exactInputSingle` incl. `deadline`), `IPancakeV3Factory` (`getPool`), `IPancakeV3Pool` (`slot0`/`tickSpacing`/`token0`/`token1`), `INonfungiblePositionManager` (mint/increase/decrease/collect/positions).

### Deploy / seed

`deploy-fork.ts` deploys both registries (real BSC protocol addresses) + the nine actions and writes them to `deployments/fork-latest.json`; `extract-abis.js` emits each action ABI to the frontend. For an incremental add to an already-running fork, use `scripts/deploy-defi-actions.ts` (see Commands). The backend `prisma/seed.ts` seeds **one `StepType` row per action** and the `ProtocolToken` allowlists; it **skips any action whose address is `address(0)`** (not yet deployed) and deletes stale zero-address rows — re-seed after deploying (`pnpm --filter backend prisma:seed`).

## Test Helpers (TypeScript)

```typescript
const CHECK_SEL      = id("check(bytes,bytes[])").slice(0, 10);
const EXECUTE_SEL    = id("execute(bytes,bytes[])").slice(0, 10);
const AFTER_EXEC_SEL = id("afterExecution(bytes,bytes[])").slice(0, 10);

encodeBalanceParams(token, account, minBalance, aboveOrEqual, minBalanceFromSlot?)
encodeTransferParams(token, recipient, amount, amountFromSlot?, amountToSlot?, feeRegistry?)
encodeIntervalParams(interval, timeSlot)
encodeTimerParams(delta, timeSlot)
encodeFeeDepositParams(feeRegistry, token, topUpAmount?)

conditionStep(target, data, nextOnTrue, nextOnFalse?, sel?)
actionStep(target, data, nextOnTrue?, sel?)
```

**Time manipulation in tests:**
```typescript
await ethers.provider.send("evm_increaseTime", [seconds]);
await ethers.provider.send("evm_mine", []);
```

## Mock Contracts (tests only)

| Contract | Purpose |
|---|---|
| `MockERC20` | Standard ERC-20, mints on deploy |
| `MockPriceOracle` | `setPrice(token, priceUSD18)` — reverts `OracleNotExist` if unset (project `IPriceOracle`) |
| `ERC1967ProxyHelper` | Proxy helper for tests |
| `ActionLibHarness` | Exposes `ActionLib`'s internal funcs (incl. the HF/oracle math) for hard-fixture unit tests |
| `MockAaveV3` | `MockAaveV3Pool` (supply/withdraw/borrow/repay + debt-token tracking + configurable `getUserAccountData`/`seedDebt`), `MockAToken` (mintable/burnable), `MockAaveOracle` (`setPrice` 8-dec), `MockPoolAddressesProvider` |
| `MockPancakeV3` | `MockPancakeV3Factory` (`setPool`/`getPool`), `MockPancakeV3SwapRouter` (rate-based `exactInputSingle`), `MockPancakeV3Pool` (configurable `slot0`/`tickSpacing`), `MockNonfungiblePositionManager` (ERC-721, `_safeMint`s the position; mint/increase/decrease/collect/positions + `accrue` helper) |

## Backend Modules

| Module | Path | Description |
|--------|------|-------------|
| `AuthModule` | `src/auth/` | SIWE nonce/verify/refresh, JWT strategy, WalletAuthGuard (global APP_GUARD) |
| `VaultModule` | `src/vault/` | Vault CRUD, `VaultOwnerGuard`, **`VaultAccessService`** (shared ownership check, used by the guard **and** the WS gateway). The legacy deposit/withdraw event-recording + `/history` endpoints were **removed** (PEC-219 — history is indexer-owned now) |
| `AutomationModule` | `src/automation/` | Automation CRUD + draft reconciliation (AutomationService), graph→steps encoding incl. context-slot allocation (EncodingService), context slot read/allocate (ContextService), trigger status (TriggerStatusService) |
| `BlockchainModule` | `src/blockchain/` | FeeService (on-chain fees + per-vault gas deposit, 1h cache), **ContractErrorService** (now a real **revert decoder**, not just a name→message map — PEC-219), accepted tokens; `GET /vaults/:address/gas-deposit` |
| `IndexerModule` | `src/indexer/` | **Execution monitoring (PEC-219)** — `IndexerService` (poll loop), `IndexerCursorStore`, pure `RangePlanner` + event→row mapper, `ExecutionService` (unified UNION history), `FailureIngestService` + `KeeperIngestGuard`, `ExecutionsGateway` (Socket.IO). Endpoints below |
| `TokensModule` | `src/tokens/` | DB-backed curated per-protocol token allowlists; `GET /tokens?protocol=aave\|pancakeswap` (address/symbol/decimals from the `ProtocolToken` table) |
| `PortfolioModule` | `src/portfolio/` | AlchemyService, PriceService (DeFiLlama fallback, now also **exported** for the indexer's write-time USD freeze), VaultPortfolioService (60s cache) |
| `DatabaseModule` | `src/database/` | PrismaService (global) |
| `HealthModule` | `src/health/` | GET /health |

**AutomationModule endpoints** (all `VaultOwnerGuard`): `POST/GET/PATCH/DELETE :address/automations[/:id]`, `:id/encode` + `:id/encode-update` (build create/update calldata + context-setup tx), `:id/encode-toggle` (setAutomationActive), `:id/encode-execute` (executeAutomation); `GET :address/context-slots`; `GET :address/automations/trigger-statuses`. DELETE is DB-only and blocks active **public** automations until deactivated on-chain (owner-only are exempt).

**IndexerModule endpoints**: `GET :address/executions?automationId=&page=&pageSize=` (`VaultOwnerGuard`; unified UNION history), `GET /indexer/status` (authenticated; cursor freshness), `POST /internal/executions/failures` (`@Public()` + `KeeperIngestGuard` shared secret — keeper-only). The legacy `POST/GET :address/events` + `GET :address/history` are **gone**.

### Key Backend Patterns

- **Auth**: SIWE + JWT. `WalletAuthGuard` is global APP_GUARD; use `@Public()` decorator for public endpoints.
- **VaultOwnerGuard**: Per-vault auth. Delegates to **`VaultAccessService.assertOwnership`** (the single ownership check shared with the WS gateway) — compares **checksummed** (`getAddress`) so casing never matters, malformed input → `NOT_FOUND` (never a 500). Attaches `req.vault`.
- **Execution monitoring (PEC-219)** — `IndexerModule`. **Two channels:** the indexer ingests *successes* + deposits/withdraws from logs; the keeper reports *failures* (reverts emit no logs). **Models:** `Execution` (SUCCESS-only, unique `(txHash, logIndex)`, frozen `gasCompUsd`), `VaultEvent` (now indexer-owned, `(txHash, logIndex)` unique), `ExecutionFailure` (one **open** row per automation via a **partial unique index** `(vaultId, automationId) WHERE resolvedAt IS NULL` — hand-written raw-SQL migration), `IndexerCursor` (single feed, durable resume). **Indexer:** self-rescheduling poll loop (in-flight-guarded), one address-less `getLogs({topics:[ALL_TOPICS]})` per tick gated on the **per-tick-reloaded** known-vault set, pure `RangePlanner` (`head − CONFIRMATIONS` cap, chunking, adaptive halving) + pure event→row mapper, idempotent `createMany`, write-time-frozen USD via `PriceService`. The indexer **resolves** an open failure in the **same `$transaction`** as the SUCCESS insert. Provider injected via `INDEXER_PROVIDER` (HTTP `JsonRpcProvider`, `staticNetwork`; null → dormant). `onModuleInit` is resilient (a startup hiccup never crashes the API; mocked-Prisma integration tests rely on this). **Decoder** (`ContractErrorService.decodeRevert`): unwraps the 2-arg `ActionExecutionFailed`/`ConditionCallFailed` → `Step N:` + inner reason → `Error(string)` (Aave codes / PancakeSwap require msgs) → `Panic` → known custom error → `0x<selector>`. **Gateway** (`ExecutionsGateway`, Socket.IO `/executions`, rooms `vault:<checksummed>`): handshake JWT in `handleConnection` + per-vault ownership on `subscribe` (shared `VaultAccessService`); bound as `EXECUTION_EVENTS_PORT` (`useExisting`) so the indexer pushes in-process without importing it. **Keeper** (`scripts/execute-automations.ts`) reports path 1 (`executeAutomation` revert, has txHash) + path 2 (`isTriggerMet` revert, no txHash) with raw `e.data`; gated by `KEEPER_INGEST_SECRET`.
- **PrismaService**: Global, extends PrismaClient. All modules inject it.
- **DTOs**: Plain classes (no class-validator decorators yet).
- **Context-slot encoding** (`EncodingService`): `extractSlotNames` collects variable names from params of fields marked `x-ui-widget: context-slot` (via `StepType.paramSchema`), `ContextService.allocateSlots` maps name→index in `vault.contextSlots`, and `encodeParams` resolves names→indices and applies the field's schema `default` (e.g. NO_SLOT `4294967295`) for unset slot fields — never 0, which would point at slot 0. `encode`/`encodeUpdate` emit a `setContext` calldata when new slots are needed (the deploy dialog sends it as a separate tx before create/update).
- **Friendly params + encode-boundary mapper** (PEC-217): condition/action params are stored **friendly** in `node.data.params` (durations as `{ value, unit }`, start time as Unix seconds, etc.) for lossless round-trip. The frontend runs the **encode-boundary mapper** (`features/automation-editor/lib/encode-boundary.ts`, using `shared`'s `toSeconds`/`encodeTimestamp`) just before `POST /encode`: `mapGraphToRaw` converts friendly → **raw** and strips friendly-only fields (sent as `body.graph`); `buildContextOverrides` routes each `x-ui-widget: start-time` field → **name-keyed** `contextOverrides[<timeSlot var name>]` (ABI-encoded uint256). The encode controller prefers `body.graph` over the persisted (friendly) `editorState`; `EncodingService` runs a defensive **raw-mode guard** (`shared` `validateParams(schema, params, { mode: 'raw' })`) before building calldata (e.g. rejects `interval = 0` with HTTP 400). `contextOverrides` on `/encode` + `/encode-update` is **name-keyed** `Record<string,string>` (no index-keyed form); `EncodingService`/`ContextService.buildExpandedContext` resolve name→index via the `slotMapping` from `allocateSlots`. New context slots default to `0x` — only `start-time` slots receive a timestamp initial value, written into the deploy `setContext` tx. The generic ABI encoder is unchanged. `/step-types` (findAll) returns `paramSchema` + `abiFragment` so the editor store can do **node-init** default materialization (static defaults; deterministic hidden `__time_<nodeId>` slot names; `start-time` defaults to now; `account-selector` fields default to the vault address) and a schema-driven **param-validation pass** over all nodes (friendly mode) merged into `validationErrors` — gating Deploy and feeding inline per-field errors (`ValidationError.fieldName`). Widget UI lives in `dynamic-form.tsx` (`x-ui-widget`: `duration` → `DurationField`, `start-time` → `StartTimeField`, `token-amount` → `TokenAmountField`; `x-ui-hidden` fields are kept in params but not rendered). **Token amounts**: `token-amount` fields store a human string (e.g. `1.5`) and declare their token field via `x-ui-amount-token-field`; the mapper converts → base units with `shared`'s `toBaseUnits` using **decimals from the loaded accepted-token list** (`/tokens/accepted`, no extra call), held in the store as `tokenDecimals` (lowercased address → decimals) which also drives the friendly over-precision check. A bare `token-amount` (e.g. TokenBalance threshold) allows `0`. **Zero-toggle**: action amount fields with the contract's "0 = special" semantics add `x-ui-zero-toggle: { label, default? }` (ERC20Transfer `amount` = full balance; FeeDeposit `topUpAmount` = fill to target). The toggle state is a flat boolean param keyed by `shared`'s `zeroToggleField(field)` (`<field>_useZero`) — friendly-only, stripped before `/encode`. Toggle on → mapper emits raw `0` and the widget disables the amount input; toggle off → a positive amount is required (`validateParams` enforces `> 0`).
- **Raw-mode guards** (defensive, `shared` `validateParams(schema, params, { mode: 'raw' })` run by `EncodingService` before building calldata — HTTP 400): `interval = 0`; `token-selector` zero/invalid address; `aave-amount-mode` TARGET_HF `targetHealthFactor ≤ 1.05e18`; `fee-tier` ∉ `{100,500,2500,10000}`; `tick-range` explicit `tickLower ≥ tickUpper`; `percent` ∉ `[1,100]`. Each new widget added a rule keyed by `x-ui-widget` — no per-step-type code.
- **DB-backed token allowlists** (`ProtocolToken`): a Prisma entity (`protocol`, `address`, `symbol`, `decimals`, `enabled`, `@@unique([protocol, address])`) seeded with curated Aave reserves + PancakeSwap pairs (BSC, all standard ERC-20s). `GET /tokens?protocol=…` serves them; their `decimals` feed the frontend `tokenDecimals` map so protocol-token `token-amount` → base-units conversion is correct. Lives alongside `/tokens/accepted` (fee tokens).
- **StepType seed**: `prisma/seed.ts` loads contract addresses from `deployments/fork-latest.json` and seeds one row per condition/action (14 total: 3 conditions, ERC-20 Transfer, Fee Deposit, + 9 DeFi actions) plus the `ProtocolToken` allowlists; re-seed after every fresh contract deploy. **It skips actions whose address is `address(0)`** (not yet deployed) and deletes stale zero-address rows — otherwise multiple undeployed actions sharing `(0x0…0, executeSelector)` collide on the unique key and collapse into one row.

## Frontend Structure

| Route | Component | Description |
|-------|-----------|-------------|
| `/connect` | `ConnectPage` | MetaMask connection + SIWE sign-in |
| `/dashboard` | `DashboardPage` | Vault table with USD values, empty state, create CTA |
| `/vault/create` | `CreateVaultPage` | Multi-step wizard (label → token → fees → TX → deposit) |
| `/vault/:address` | `VaultDetailPage` | Portfolio, label edit, deposit/withdraw, automation list, **ContextView** (slots + on-chain values), **GasDepositCard** (gas reserve + deposit + minFeeDeposit config), **ExecutionHistoryTable** (live unified history: success/failed/resolved + deposits/withdraws, gas+USD, BscScan, freshness indicator — PEC-219) |
| `/vault/:address/automation/:id/edit` | `AutomationEditorPage` | React-Flow graph editor (`features/automation-editor/`): nodes/edges, context variables, auto-save, deploy dialog (context tx → create/update tx) |

**Automation editor** (`src/features/automation-editor/`): Zustand store (`editor-store.ts`), `useAutoSave` (5s debounce → PATCH editorState), context variables merged from both `/context-slots` (vault-wide) and the automation's saved `editorState.contextVariables` via commutative `mergeContextVariables` so concurrent loads don't clobber. Automation list shows **Execute** (owner-only) vs Activate/Deactivate toggle (public); deploy dialog reads the on-chain id from the `AutomationCreated` event receipt.

### Key Frontend Patterns

- **Auth**: `AuthProvider` context wraps app. `useAuth()` gives `address`, `isAuthenticated`, `login`, `logout`.
- **API**: `apiFetch()` in `lib/api.ts` handles JWT headers, silent token refresh, auth failure callback.
- **Contract ABIs**: Auto-generated in `lib/abis/` from Hardhat artifacts via `scripts/extract-abis.js` (runs on compile).
- **wagmi**: Config in `lib/wagmi.ts`. Chain order: `[hardhat]` in dev, `[bsc, bscTestnet]` in production. Multicall disabled on Hardhat chain. `pollingInterval: 2000`. Hooks: `useCreateVault` (gas: 500k), `useApproveAndDeposit` (gas: 300k on deposit), `useWithdraw` (gas: 300k).
- **Receipt waiting**: `lib/wait-for-receipt.ts` polls `getTransactionReceipt` (used by `useCreateVault` + deploy dialog). Deposit/withdraw/gas-deposit hooks use viem's `usePublicClient().waitForTransactionReceipt`.
- **Realtime execution history (PEC-219)**: `ExecutionHistoryTable` consumes `GET /vaults/:address/executions` (unified UNION, offset paging, vault-wide or `automationId` filter). `useExecutionsSocket` connects to the `/executions` Socket.IO namespace with the JWT via the **function form** `auth: (cb)=>cb({token})` (read fresh on every reconnect — no expired-token loop), re-subscribes + gap-fill-refetches on every connect/reconnect, and toasts (`sonner`) + refetches page 1 on each `execution` event. `useIndexerStatus` polls `GET /indexer/status` every 10s (always) → `FreshnessIndicator` (connection dot + "updated Ns ago" from the cursor's block timestamp). While the socket is disconnected the table REST-polls every 15s; no heavy polling while it's healthy. The forms no longer POST optimistic events (history is indexer-owned).
- **StrictMode**: dev double-invokes effects — guard one-shot side effects (e.g. draft creation) with a `useRef` flag, not just state, since async state isn't set yet on the second invocation.
- **Chain switching**: `ConnectPage` uses `useSwitchChain` to force MetaMask to `config.chains[0]` on connect. SIWE `chainId` defaults to 31337 in dev, 56 in production.
- **Protected Routes**: `ProtectedRoute` component redirects to `/connect` if not authenticated.
- **DeFi action widgets** (`dynamic-form.tsx`, driven by `x-ui-widget`): `aave-amount-mode` (mode selector that conditionally shows the amount input / context-slot picker / a "full balance" note / a friendly `health-factor` input; `x-ui-modes` restricts the offered modes per action, `x-ui-max-label`/`x-ui-max-note` customise the MAX option), `fee-tier` (0.01/0.05/0.25/1%), `tick-range` (explicit min/max price ↔ preset ±% — computes `tickLower`/`tickUpper` or `tickDelta` via `lib/ticks.ts`, carried into raw params; friendly price inputs stripped), `percent` (1–100), `health-factor` (friendly `1.5` → `1.5e18` at the encode boundary). `token-selector` honours `x-ui-token-source` (`aave`/`pancakeswap`) to load the curated list from `/tokens?protocol=…`; those decimals are merged into the store `tokenDecimals` map.
- **Pool-existence validity check**: `usePoolValidity` (`hooks/use-pool-validity.ts`) reads `factory.getPool(tokenIn, tokenOut, fee)` for each Swap node (PCS factory address, `VITE_PCS_FACTORY_ADDRESS` override) and feeds a blocking error into the store's `externalErrors` slice (merged into `validationErrors` in `runValidation`) so the Deploy gate catches a missing pair+tier at config time. Pure helpers (`collectSwapPoolChecks`, `buildSwapPoolErrors`) live in `lib/pool-validity.ts`.

## Security Notes

- **Actions are delegatecall** — only use audited, stateless action contracts
- `_disableInitializers()` in vault constructor prevents direct-impl initialization
- CREATE2 salt mixes `msg.sender` to prevent vault address griefing
- `MAX_STEPS = 256` prevents infinite loop DoS
- `ReentrancyGuardTransient` on vault execution; `ReentrancyGuard` on FeeRegistry
- Gas compensation always paid to executor at full computed amount — never reduced
- Non-owner trigger failure reverts early with `TriggerNotMet` to save gas
- Owner-only automations revert with `CallerNotOwner` for non-owner callers
- **DeFi actions** call external protocols via regular `call` (never `delegatecall`), hold the registry as `immutable` (bytecode, not storage → stays stateless), and **reset every approval to 0** after a pull (Repay-MAX / Mint over-approve vs. consumed)
- **Aave oracle resolved at runtime** (never cached) so the action reads the same oracle Aave uses for the health factor; TARGET_HF target floored at `> 1.05e18`; MAX/TARGET_HF are best-effort and no-op rather than revert on wrong-direction / edge rounding
- **Swap/LP ship without price protection** (`amountOutMinimum = 0`, `amountMin = 0`) — a consciously accepted MEV/sandwich risk for a public executor (PRD); a future "protected swap" can enable it via the struct's optional fields without redeploy
- **LP NFT custody**: `StrategyBuilderVault.onERC721Received` returns the magic selector so positions are held safely
