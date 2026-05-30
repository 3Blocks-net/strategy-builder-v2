# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Strategy Builder V2

## Overview

On-chain automation protocol deployed on BSC. Users create **vaults** (ERC1967 proxies) and configure **automations** — directed graphs of Conditions and Actions. A public executor calls `executeAutomation`, the trigger condition gates execution, and actions run in sequence modifying the vault's shared context. Fees are charged at the vault boundary (deposit/withdraw), and executors receive gas compensation from a pre-funded deposit in FeeRegistry.

## Commands

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
StrategyBuilderVaultFactory  (Ownable, NOT upgradeable)
    │  owns _vaultImplementation (shared implementation)
    │  stores feeRegistry → forwarded to every new vault
    └─ deploys ERC1967Proxy instances via CREATE2
           │  proxy.implementation = StrategyBuilderVault
           └─ per-user isolated storage

FeeRegistry  (Ownable, NOT upgradeable)
    │  stores depositFeeBps / withdrawFeeBps (global flat rates)
    │  holds vaultDeposits (gas comp pre-funding)
    │  holds collectedFees (deposit/withdraw fees for owner withdrawal)
    └─ gas compensation via IPriceOracle

External contracts (pre-existing, read-only interfaces):
    IPriceOracle   — 18-decimal USD prices per token
```

### Execution Flow (`executeAutomation`)

1. Load vault context (`bytes[]`) into memory
2. Traverse directed graph starting at step 0 (always a CONDITION):
   - **Condition**: `staticcall` → `bool` → follow `nextOnTrue` or `nextOnFalse`
   - **Action**: `delegatecall` → apply context diff
3. Record `triggerFired` on the first step (step 0)
4. If `triggerFired`: call `afterExecution` (staticcall) on step 0 — applies context diff (e.g. IntervalCondition advances schedule)
5. Save context back to storage
6. If caller is not owner: measure `gasUsed = gasStart - gasleft()` → `_settleGasComp`

### Fee Model

```
Fees at vault boundary (deposit/withdraw):
  deposit():  fee = amount × depositFeeBps / 10_000 → FeeRegistry.collectFee()
  withdraw(): fee = amount × withdrawFeeBps / 10_000 → FeeRegistry.collectFee()
  ERC20TransferAction: reads withdrawFeeBps dynamically, deducts from transfer

Gas compensation (per automation execution):
  gasCompTokens = (gasUsed + overhead) × tx.gasprice × nativePriceUSD / 1e18
                  × (10_000 + executorMarkupBps) / 10_000
  → converted to deposit token via IPriceOracle
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
- `_automations` — mapping(uint32 → Automation)
- `_ctx` — shared `bytes[]` context, all automations read/write the same slots
- `_minFeeDeposit` — target balance in FeeRegistry (for FeeDepositAction)

**Constants:**
- `DONE = type(uint32).max` — terminates graph traversal
- `MAX_STEPS = 256` — per-execution step limit

**Key functions:**
- `deposit(token, amount)` — owner deposits tokens, deducts depositFee to FeeRegistry
- `withdraw(token, amount, recipient)` — owner withdraws, deducts withdrawFee from amount
- `depositFees(token, amount)` — moves vault tokens to FeeRegistry for gas comp pre-funding
- `executeAutomation(automationId)` — public, gas comp settled for non-owner callers

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

### FeeRegistry

**Setup sequence:**
1. `addAcceptedToken(token, decimals)` — register fee-payment ERC-20s
2. `setDepositFeeBps(bps)` / `setWithdrawFeeBps(bps)` — max 1000 bps (10%)
3. `setGasConfig(priceOracle, nativeToken, executorMarkupBps, overhead, maxGasPrice)` — optional

**Vault-facing:**
- `collectFee(token, amount)` — pulls fee via transferFrom, accumulates in `collectedFees`
- `deductGasComp(token, executor, gasUsed)` — computes gas comp, deducts from vault deposit, transfers to executor
- `depositFor(vault, token, amount)` — pre-fund gas comp deposit
- `withdrawDeposit(token, amount)` — vault withdraws its deposit

**Owner:**
- `withdrawFees(token)` — withdraw accumulated deposit/withdraw fees

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

## Security Notes

- **Actions are delegatecall** — only use audited, stateless action contracts
- `_disableInitializers()` in vault constructor prevents direct-impl initialization
- CREATE2 salt mixes `msg.sender` to prevent vault address griefing
- `MAX_STEPS = 256` prevents infinite loop DoS
- `ReentrancyGuardTransient` on vault execution; `ReentrancyGuard` on FeeRegistry
- Gas compensation never reduced — always paid to executor at full computed amount
