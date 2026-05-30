# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Strategy Builder V2

## Overview

On-chain automation protocol deployed on BSC. Users create **vaults** (ERC1967 proxies) and configure **automations** — directed graphs of Conditions and Actions. A public executor calls `executeAutomation`, the trigger condition gates execution, and actions run in sequence modifying the vault's shared context. Fees are charged at the vault boundary (deposit/withdraw BPS), and executors receive gas compensation from a pre-funded deposit in FeeRegistry.

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
pnpm contracts:compile       # Compile contracts
pnpm contracts:test          # Run contract tests
pnpm contracts:clean         # Clean contract artifacts
pnpm backend:dev             # Start backend in watch mode
pnpm backend:build           # Build backend
pnpm backend:test            # Run backend unit tests
pnpm backend:test:e2e        # Run backend e2e tests
pnpm frontend:dev            # Start frontend dev server
pnpm frontend:build          # Build frontend for production
pnpm frontend:test           # Run frontend tests
```

**From `packages/contracts/`:**
```bash
npx hardhat compile          # Compile all contracts
npx hardhat test             # Run all tests
npx hardhat test test/StrategyBuilderVault.ts   # Run single test file
npx hardhat clean            # Clean artifacts
npx hardhat test --grep "pattern"  # Run tests matching pattern
```

**Deploy** (Hardhat Ignition):
```bash
npx hardhat ignition deploy --network bscTestnet ignition/modules/StrategyBuilderVault.ts
npx hardhat ignition deploy --network bscMainnet ignition/modules/StrategyBuilderVault.ts
```

**Hardhat 3** (`hardhat ^3.2.0`) — uses `defineConfig`, `network.connect()`, and ESM (`"type": "module"` in package.json). Tests use top-level `await` for network connection:
```typescript
const { ethers } = await network.connect();
```

**Compiler**: Solidity 0.8.28, `viaIR: true` (required — stack-too-deep in `_executeAction`), 200 optimizer runs in production profile. Target chain: BSC.

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
- `createAutomation(steps[])` — public automation, step 0 must be CONDITION
- `createOwnerAutomation(steps[])` — owner-only automation, step 0 can be ACTION
- `updateAutomationSteps(id, steps[])` — replace all steps (context unaffected)
- `setAutomationActive(id, bool)` — pause or resume
- `setContext(bytes[])` — replace entire shared context
- `setContextSlot(slot, value)` — update a single context slot
- `deposit(token, amount)` — owner deposits tokens, deducts depositFee to FeeRegistry
- `withdraw(token, amount, recipient)` — owner withdraws, deducts withdrawFee from amount
- `depositFees(token, amount)` — moves vault tokens to FeeRegistry for gas comp pre-funding
- `setMinFeeDeposit(amount)` — set target fee reserve for FeeDepositAction
- `withdrawETH(to, amount)` — recover accidentally sent ETH (amount=0 sends full balance)
- `executeAutomation(automationId)` — public; owner-only automations restricted to owner
- `isTriggerMet(automationId)` — view, checks if trigger condition is currently true

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
| `MockPriceOracle` | `setPrice(token, priceUSD18)` — reverts `OracleNotExist` if unset |
| `ERC1967ProxyHelper` | Proxy helper for tests |

## Security Notes

- **Actions are delegatecall** — only use audited, stateless action contracts
- `_disableInitializers()` in vault constructor prevents direct-impl initialization
- CREATE2 salt mixes `msg.sender` to prevent vault address griefing
- `MAX_STEPS = 256` prevents infinite loop DoS
- `ReentrancyGuardTransient` on vault execution; `ReentrancyGuard` on FeeRegistry
- Gas compensation always paid to executor at full computed amount — never reduced
- Non-owner trigger failure reverts early with `TriggerNotMet` to save gas
- Owner-only automations revert with `CallerNotOwner` for non-owner callers
