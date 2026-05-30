# Strategy Builder V2

An on-chain automation protocol for the BNB Smart Chain. Users deploy personal vaults and configure **automations** — composable graphs of Conditions and Actions that execute trustlessly by any caller when their trigger fires.

---

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
  - [Vault](#vault)
  - [Automations](#automations)
  - [Owner Automations](#owner-automations)
  - [Conditions](#conditions)
  - [Actions](#actions)
  - [Shared Context](#shared-context)
- [Architecture](#architecture)
  - [Contract System](#contract-system)
  - [Execution Flow](#execution-flow)
  - [Fee System](#fee-system)
  - [Interval Scheduling](#interval-scheduling)
- [Contracts](#contracts)
  - [StrategyBuilderVault](#strategybuildervault)
  - [StrategyBuilderVaultFactory](#strategybuildervaultfactory)
  - [FeeRegistry](#feeregistry)
- [Interfaces](#interfaces)
- [Example Contracts](#example-contracts)
  - [TokenBalanceCondition](#tokenbalancecondition)
  - [IntervalCondition](#intervalcondition)
  - [TimerCondition](#timercondition)
  - [ERC20TransferAction](#erc20transferaction)
  - [FeeDepositAction](#feedepositaction)
- [Deployment](#deployment)
- [Development](#development)

---

## Overview

Strategy Builder V2 lets users automate on-chain operations without writing contracts. A **vault** is a personal smart contract wallet. Inside it, the user configures **automations**: each automation has a trigger condition and a chain of actions. Anyone can call `executeAutomation` — the trigger condition decides whether the actions actually run.

Typical use cases:

- **Recurring transfers** — send tokens every 24 hours to a cold wallet
- **Balance rebalancing** — swap or transfer whenever a token balance crosses a threshold
- **Auto fee top-up** — refill the fee deposit whenever it runs low
- **Chained operations** — read the output of one action as the input to the next
- **Owner-triggered operations** — manually execute a sequence of actions without a condition

---

## Core Concepts

### Vault

Each user gets their own **StrategyBuilderVault** — an ERC1967 proxy with isolated storage. The vault holds the user's tokens, manages their automations, and is the address from which all actions execute.

Vaults are deployed by the **StrategyBuilderVaultFactory** via CREATE2. The factory owner sets the shared `FeeRegistry` that all new vaults inherit — vault creators choose only their `depositToken` (ERC-20 used to pre-fund gas compensation).

### Automations

An automation is a **directed graph** of steps stored inside a vault. By default, step 0 must be a **Condition** (the trigger). Steps connect via `nextOnTrue` and `nextOnFalse` indices. The sentinel value `DONE` (`type(uint32).max`) terminates traversal.

```
Step 0: Condition (trigger)
   ├─ true  → Step 1: Action
   │              └─ Step 2: Action → DONE
   └─ false → DONE
```

Automations are identified by a `uint32 ID` assigned at creation. Multiple automations share the same vault context (see [Shared Context](#shared-context)).

**Early revert on false trigger:** when a non-owner caller finds the trigger condition false at step 0, `executeAutomation` reverts immediately with `TriggerNotMet` — saving gas for both the caller and the vault.

### Owner Automations

Owner automations are created with `createOwnerAutomation(steps[])`. They differ from public automations in two ways:

- **Step 0 can be an ACTION** — no condition is required. The automation runs unconditionally when the owner calls it.
- **Only the vault owner can execute them** — any other caller reverts with `CallerNotOwner`.
- **No gas compensation is charged** — owner executions bypass gas compensation entirely.

This is useful for manual one-shot operations (e.g. emergency withdrawals, owner-controlled rebalances) that should not be callable or payable by the public.

```
Step 0: Action (no trigger needed)
   └─ Step 1: Action → DONE
```

### Conditions

Conditions are read-only checks. They receive the current vault context and return a single `bool`. The vault calls them via **staticcall**, so they cannot modify any state. A condition's result determines which branch of the graph to follow next.

A condition can optionally implement `IUpdatableCondition` to also provide an `afterExecution` hook — the vault calls this after a successful execution to let the condition update the context (e.g. advance a timer).

### Actions

Actions are executable operations. They receive the vault context, perform work (token transfers, approvals, etc.), and return a **context diff** — two parallel arrays of slot indices and new values. The vault applies the diff immediately, so the next step sees the updated context.

Actions run via **delegatecall**: `address(this)` inside an action is the vault, so actions operate directly on the vault's token balances. **Actions must be stateless** (no storage variables).

### Shared Context

Every vault has a single `bytes[]` array — the **context** — shared by all automations. Each slot holds arbitrary ABI-encoded data. Automations can read from and write to any slot:

- A condition can read a threshold stored in slot 3
- An action can write its output amount to slot 0
- A later action (or a future automation) can read slot 0 as its input

This allows data to flow between steps within a single execution, and between separate automations across different transactions.

---

## Architecture

### Contract System

```
┌─────────────────────────────────────────────────────────┐
│                Protocol (Factory Owner)                   │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │           StrategyBuilderVaultFactory                │ │
│  │  - _vaultImplementation  (shared implementation)    │ │
│  │  - feeRegistry            ─────────────────────┐    │ │
│  │  - isRegisteredVault()    (IVaultRegistry)     │    │ │
│  └─────────────────────────────────────────────────────┘ │
│                      │ CREATE2                    │       │
│       ┌──────────────┘                            │       │
└───────┼───────────────────────────────────────────┼───────┘
        │                                           │
        ▼                                           │
  ┌─────────────────────┐  ┌────────────────────────▼─────┐
  │  ERC1967Proxy        │  │          FeeRegistry          │
  │  (per user)          │  │  - depositFeeBps              │
  │                      │  │  - withdrawFeeBps             │
  │  ┌────────────────┐  │  │  - vaultDeposits[vault][tkn]  │
  │  │StrategyBuilder │  │  │  - collectedFees[token]       │
  │  │    Vault        │  │  │  - gas comp (IPriceOracle)    │
  │  │  - automations │  │  └─────────────────────────────────┘
  │  │  - context[]   │  │
  │  │  - owner       │  │  External (pre-existing):
  │  └────────────────┘  │    ┌──────────────────┐
  └─────────────────────┘    │  IPriceOracle     │
                              │  (USD prices)     │
                              └──────────────────┘
```

### Execution Flow

```
executeAutomation(automationId)
│
├─ ownerOnly automation + non-owner caller? → revert CallerNotOwner
│
├─ Load context from storage into memory
│
├─ LOOP (max 256 steps):
│   ├─ Step is CONDITION?
│   │   ├─ staticcall → bool result
│   │   ├─ Record triggerFired if step 0
│   │   ├─ If step 0 false + non-owner caller → revert TriggerNotMet
│   │   └─ Follow nextOnTrue or nextOnFalse
│   │
│   └─ Step is ACTION?
│       ├─ delegatecall → (updatedSlots, updatedValues)
│       ├─ Apply context diff
│       └─ Follow nextOnTrue
│
├─ triggerFired?
│   └─ staticcall afterExecution on step 0 (if IUpdatableCondition)
│       └─ Apply returned context diff (e.g. advance interval schedule)
│
├─ Save context to storage (only when modified)
│
├─ owner caller? → skip gas comp, done
│
├─ gasUsed = gasStart − gasleft()
└─ _settleGasComp → FeeRegistry.deductGasComp
    └─ emit GasCompSettled
```

### Fee System

Fees consist of two independent mechanisms:

**1. Deposit/withdraw fees (flat BPS)**

When a vault owner deposits or withdraws tokens, a flat percentage fee is deducted and sent to FeeRegistry:

```
deposit():  fee = amount × depositFeeBps / 10_000  → FeeRegistry.collectFee()
withdraw(): fee = amount × withdrawFeeBps / 10_000 → FeeRegistry.collectFee()
```

ERC20TransferAction also reads `withdrawFeeBps` dynamically and deducts the fee from the transfer amount when `feeRegistry` is set.

Collected fees accumulate in `collectedFees[token]`. The FeeRegistry owner withdraws them via `withdrawFees(token)`.

**2. Gas compensation (per automation execution)**

Every execution by a non-owner caller reimburses the executor for gas. The gas price is capped at `maxGasPrice` to prevent inflation:

```
effectiveGasPrice = min(tx.gasprice, maxGasPrice)   (if maxGasPrice > 0)
gasCostUSD        = (gasUsed + overhead) × effectiveGasPrice × nativeTokenPriceUSD / 1e18
gasCompUSD        = gasCostUSD × (10_000 + executorMarkupBps) / 10_000
gasCompTokens     = feeTokenAmount(gasCompUSD)
```

Gas compensation is deducted from the vault's pre-funded deposit in FeeRegistry and transferred directly to the executor.

**Token pricing**

When a price oracle is configured, `feeTokenAmount` converts USD to tokens using the deposit token's live market price:

```
tokenAmount = feeUSD × 10^decimals / tokenPriceUSD
```

If the oracle is unavailable or has no price for that token, it falls back to a 1-token-per-USD assumption adjusted for decimals.

**Pre-funded deposits**

Gas compensation is deducted from a vault's pre-funded deposit in FeeRegistry, not from the vault's live token balance (preventing automation actions from accidentally draining the gas reserve). Vault owners call `depositFor` or use `FeeDepositAction` to maintain this balance. Deposits can be recovered at any time via `withdrawDeposit`.

**Owner executions**

When the vault owner calls `executeAutomation` directly, no gas compensation is calculated or deducted — regardless of the automation type.

### Interval Scheduling

`IntervalCondition` implements `IUpdatableCondition` to enable recurring automations:

1. Owner sets `ctx[slot] = startTimestamp` via `setContextSlot`
2. `check()` returns true when `block.timestamp >= ctx[slot]`
3. After execution, `afterExecution()` sets `ctx[slot] = previousNextTime + interval`

The schedule is **drift-free** — it advances relative to the planned time, not `block.timestamp`. If a beat is missed, the next execution is still `startTime + N × interval`, not `missedTime + interval`.

---

## Contracts

### StrategyBuilderVault

The core vault. Each user owns one (or more) vault proxies.

**Initialization** (called once by factory via `initialize`, immutable afterwards):

| Parameter | Description |
|---|---|
| `initialOwner` | Address that owns and controls this vault |
| `feeRegistry_` | FeeRegistry for fee settlement (`address(0)` = disabled) |
| `depositToken_` | ERC-20 used for gas comp pre-funding (`address(0)` = gas comp disabled) |

**Owner functions:**

| Function | Description |
|---|---|
| `createAutomation(steps[])` | Create a public automation (step 0 must be CONDITION) |
| `createOwnerAutomation(steps[])` | Create an owner-only automation (step 0 can be ACTION or CONDITION; no gas comp) |
| `updateAutomationSteps(id, steps[])` | Replace all steps (context unaffected) |
| `setAutomationActive(id, bool)` | Pause or resume an automation |
| `setContext(bytes[])` | Replace the entire shared context |
| `setContextSlot(slot, value)` | Update a single context slot |
| `setMinFeeDeposit(amount)` | Set target fee reserve for FeeDepositAction |
| `deposit(token, amount)` | Deposit tokens into vault, deducts depositFee to FeeRegistry |
| `withdraw(token, amount, recipient)` | Withdraw tokens, deducts withdrawFee from amount |
| `depositFees(token, amount)` | Move tokens from vault balance into FeeRegistry deposit |
| `withdrawETH(to, amount)` | Recover accidentally sent ETH from the vault |

**Public functions:**

| Function | Description |
|---|---|
| `executeAutomation(id)` | Execute the automation (owner-only automations: only the vault owner) |
| `isTriggerMet(id)` | View — check if trigger condition is currently true |

**Views:**

| Function | Returns |
|---|---|
| `getAutomation(id)` | `(bool active, bool ownerOnly, Step[] steps)` |
| `getContext()` | `bytes[]` — the full shared context |
| `automationCount()` | Total automations created |
| `depositToken()` | ERC-20 token used for gas compensation |
| `feeRegistry()` | Address of the FeeRegistry |
| `minFeeDeposit()` | Minimum fee deposit target |

**Limits:**
- `MAX_STEPS = 256` per execution (prevents infinite loops)
- `DONE = type(uint32).max` sentinel to terminate traversal

### StrategyBuilderVaultFactory

Deploys vaults. The factory owner controls which FeeRegistry all vaults use. Implements `IVaultRegistry` so FeeRegistry can verify a vault was created by a trusted factory.

**Owner functions:**

| Function | Description |
|---|---|
| `setVaultImplementation(addr)` | Set implementation for future vaults (existing vaults unaffected) |
| `setFeeRegistry(addr)` | FeeRegistry forwarded to all new vaults |

**Public functions:**

```solidity
function createVault(
    address vaultOwner,    // who owns the vault
    address depositToken_, // ERC-20 for gas comp pre-funding (must be accepted by FeeRegistry)
    bytes32 salt           // per-caller CREATE2 entropy
) external returns (address vault)
```

- `depositToken_` is validated against the FeeRegistry at creation time — if the token is not accepted, the call reverts with `FeeTokenNotAccepted`.
- CREATE2 salt is mixed with `msg.sender` → `keccak256(abi.encodePacked(msg.sender, salt))` — same salt from different callers always yields different vault addresses, preventing front-running.

**Views:**
- `getVault(index)` — vault address by creation index
- `vaultCount()` — total vaults ever created
- `isRegisteredVault(addr)` — O(1) check (IVaultRegistry)

### FeeRegistry

Custodian for vault fee deposits. Collects flat deposit/withdraw fees and reimburses executors for gas costs.

**Setup sequence (owner):**

```solidity
// 1. Register accepted fee tokens
feeRegistry.addAcceptedToken(token, decimals);

// 2. Set deposit/withdraw fee rates (max 1000 bps = 10%)
feeRegistry.setDepositFeeBps(50);   // 0.5%
feeRegistry.setWithdrawFeeBps(50);  // 0.5%

// 3. Configure gas compensation (optional)
feeRegistry.setGasConfig(
    priceOracle,      // IPriceOracle for native token price
    address(0),       // native token convention (e.g. address(0) = BNB)
    2000,             // 20% markup on top of raw gas cost
    50_000,           // overhead gas units covering settlement path
    500e9             // maxGasPrice cap in wei (0 = no cap)
);
```

**Vault deposit:**

```solidity
// Vault owner pre-funds gas compensation (or use FeeDepositAction)
depositToken.approve(address(feeRegistry), amount);
feeRegistry.depositFor(vaultAddress, depositToken, amount);

// Withdraw deposit
// Called from the vault itself (msg.sender == vault)
feeRegistry.withdrawDeposit(token, amount); // 0 = full balance
```

---

## Interfaces

### IAction

```solidity
interface IAction {
    function execute(
        bytes calldata params,
        bytes[] calldata ctx
    ) external returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    );
}
```

Called via `delegatecall`. Must be **stateless** (no storage variables). `updatedSlots` and `updatedValues` must have equal length. Return both arrays empty to signal no context change.

### ICondition

```solidity
interface ICondition {
    function check(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view returns (bool met);
}
```

Called via `staticcall`. Must be `view`. Context is read-only.

### IUpdatableCondition

```solidity
interface IUpdatableCondition is ICondition {
    function afterExecution(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    );
}
```

Optional extension. Called via `staticcall` on step 0 after a successful execution. Returns a context diff (e.g. advance an interval). Silently skipped if not implemented.

### External Interfaces

**IPriceOracle** — returns 18-decimal USD price for a token address. Reverts with `OracleNotExist(token)` when no price is set.

**IVaultRegistry** — `isRegisteredVault(address) → bool`. Implemented by the factory.

---

## Example Contracts

### TokenBalanceCondition

Fires when a wallet's ERC-20 balance crosses a threshold.

```solidity
struct Params {
    address token;
    address account;
    uint256 minBalance;         // static threshold
    bool    aboveOrEqual;       // true: balance >= threshold | false: balance < threshold
    uint32  minBalanceFromSlot; // read threshold from context slot instead (NO_SLOT to disable)
}
```

**Example** — trigger when vault holds >= 100 USDC:

```solidity
abi.encode(usdcAddress, vaultAddress, 100e6, true, NO_SLOT)
```

---

### IntervalCondition

Time-based trigger for recurring automations.

```solidity
struct Params {
    uint256 interval;  // seconds between executions
    uint32  timeSlot;  // context slot holding the next scheduled timestamp
}
```

**Setup:**

```solidity
// 1. Initialise the context slot with the first execution time
vault.setContext([abi.encode(startTimestamp)]);

// 2. Create automation with IntervalCondition at step 0
vault.createAutomation([
    Step({
        stepType:    CONDITION,
        target:      address(intervalCondition),
        selector:    ICondition.check.selector,
        nextOnTrue:  1,       // proceed to action
        nextOnFalse: DONE,
        data:        abi.encode(3600, 0)  // every hour, slot 0
    }),
    // ... action steps ...
]);
```

After each successful execution the vault calls `afterExecution`, which advances `ctx[0]` by `interval` — the schedule never drifts regardless of when the execution actually happened.

---

### TimerCondition

One-shot trigger that fires once after a configurable delay from an externally set start time. After firing, the timer automatically resets to stopped — it will not fire again until manually restarted.

**Contrast with IntervalCondition:** `IntervalCondition` recurs automatically every `interval` seconds. `TimerCondition` fires exactly once per manual start.

```solidity
struct Params {
    uint256 delta;    // seconds after startTime before the timer fires (must be > 0)
    uint32  timeSlot; // context slot holding the start timestamp (0 = stopped)
}
```

**Lifecycle:**

```
Stopped (slot == 0)  ──[owner sets slot]──▶  Running (slot == startTime)
      ▲                                               │
      │                               block.timestamp >= startTime + delta
      │                                               │
      └──[afterExecution resets slot to 0]──◀   check() == true
```

**Setup:**

```solidity
// Slot 0 will hold the start timestamp. Initialize to 0 (stopped).
vault.setContext([abi.encode(uint256(0))]);

vault.createAutomation([
    Step({
        stepType:    CONDITION,
        target:      address(timerCondition),
        selector:    ICondition.check.selector,
        nextOnTrue:  1,
        nextOnFalse: DONE,
        data:        abi.encode(600, uint32(0))  // 10-minute delay, slot 0
    }),
    // ... action steps ...
]);

// Trigger the timer whenever needed:
vault.setContextSlot(0, abi.encode(block.timestamp));
```

Once the timer fires and the actions run, `afterExecution` resets slot 0 to `0`. A subsequent `executeAutomation` call does nothing until the owner writes a new start time.

---

### ERC20TransferAction

Transfers ERC-20 tokens from the vault to a recipient. Optionally deducts a withdraw fee.

```solidity
struct Params {
    address token;
    address recipient;
    uint256 amount;          // 0 = transfer full vault balance
    uint32  amountFromSlot;  // read amount from context slot (NO_SLOT to use static)
    uint32  amountToSlot;    // write transferred amount to context slot (NO_SLOT to skip)
    address feeRegistry;     // address(0) = no fee deduction
}
```

When `feeRegistry != address(0)`, reads `withdrawFeeBps()` dynamically, deducts the fee from the transfer amount, and sends the fee to FeeRegistry via `collectFee`.

**Examples:**

```solidity
// Transfer exactly 50 USDC to a cold wallet (no fee)
abi.encode(usdc, coldWallet, 50e6, NO_SLOT, NO_SLOT, address(0))

// Transfer full BNB balance, write the amount to slot 2
abi.encode(wbnb, recipient, 0, NO_SLOT, 2, address(0))

// Transfer whatever amount is stored in slot 2 (chained from previous step)
abi.encode(usdc, recipient, 0, 2, NO_SLOT, address(0))
```

---

### FeeDepositAction

Automatically tops up the vault's gas compensation deposit in FeeRegistry whenever it drops below the configured minimum.

```solidity
struct Params {
    address feeRegistry;
    address token;
    uint256 topUpAmount;   // 0 = fill exactly to minFeeDeposit
}
```

**Typical placement:** as the last action in an automation — after a fee-generating step, check if the deposit needs topping up.

The action reads `vault.minFeeDeposit()` to know the target. If the current deposit already meets or exceeds the minimum, it does nothing.

---

## Deployment

### Protocol Setup

```bash
# 1. Deploy StrategyBuilderVault implementation
# 2. Deploy FeeRegistry
# 3. Deploy StrategyBuilderVaultFactory
# 4. Configure factory
factory.setVaultImplementation(vaultImplAddress)
factory.setFeeRegistry(feeRegistryAddress)

# 5. Configure FeeRegistry
feeRegistry.addAcceptedToken(token, decimals)
feeRegistry.setDepositFeeBps(50)    # 0.5%
feeRegistry.setWithdrawFeeBps(50)   # 0.5%
feeRegistry.setGasConfig(oracle, nativeToken, markupBps, overhead, maxGasPrice)
```

### Creating a Vault (User)

```solidity
address vault = factory.createVault(
    msg.sender,      // vault owner
    depositToken,    // ERC-20 for gas comp pre-funding (must be accepted by FeeRegistry)
    bytes32(0)       // salt (use different values to create multiple vaults)
);

// Pre-fund the gas compensation deposit
depositToken.approve(feeRegistry, depositAmount);
feeRegistry.depositFor(vault, depositToken, depositAmount);
```

### Creating a Public Automation

```solidity
IStrategyBuilderVault vault = IStrategyBuilderVault(vaultAddress);
uint32 DONE = type(uint32).max;

// Example: transfer 100 USDC every 24 hours
vault.setContext([abi.encode(block.timestamp)]); // slot 0 = start now

vault.createAutomation([
    // Step 0: IntervalCondition — every 24 h
    Step({
        stepType:    CONDITION,
        target:      intervalConditionAddr,
        selector:    bytes4(keccak256("check(bytes,bytes[])")),
        nextOnTrue:  1,
        nextOnFalse: DONE,
        data:        abi.encode(86400, uint32(0))
    }),
    // Step 1: Transfer 100 USDC to cold wallet
    Step({
        stepType:    ACTION,
        target:      erc20TransferActionAddr,
        selector:    bytes4(keccak256("execute(bytes,bytes[])")),
        nextOnTrue:  DONE,
        nextOnFalse: DONE,
        data:        abi.encode(usdc, coldWallet, 100e6, NO_SLOT, NO_SLOT, address(0))
    })
]);
```

### Creating an Owner Automation

```solidity
// Example: emergency drain — immediately transfer all tokens to owner (no condition)
vault.createOwnerAutomation([
    Step({
        stepType:    ACTION,
        target:      erc20TransferActionAddr,
        selector:    bytes4(keccak256("execute(bytes,bytes[])")),
        nextOnTrue:  DONE,
        nextOnFalse: DONE,
        data:        abi.encode(usdc, owner, 0, NO_SLOT, NO_SLOT, address(0))
    })
]);

// Only the vault owner can call this — no gas comp charged
vault.executeAutomation(automationId);
```

---

## Development

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Compile

```bash
npx hardhat compile
```

### Test

```bash
npx hardhat test
npx hardhat test test/StrategyBuilderVault.ts        # vault tests only
npx hardhat test test/StrategyBuilderVaultFactory.ts  # factory tests only
```

### Project Structure

```
contracts/
├── StrategyBuilderVault.sol          # Core vault logic
├── StrategyBuilderVaultFactory.sol   # Vault deployment factory
├── FeeRegistry.sol                   # Fee management
├── interfaces/
│   ├── IAction.sol
│   ├── ICondition.sol
│   ├── IUpdatableCondition.sol
│   ├── IFeeRegistry.sol
│   ├── IVaultRegistry.sol
│   └── external/
│       └── IPriceOracle.sol
├── examples/
│   ├── conditions/
│   │   ├── TokenBalanceCondition.sol
│   │   ├── IntervalCondition.sol
│   │   └── TimerCondition.sol
│   └── actions/
│       ├── ERC20TransferAction.sol
│       └── FeeDepositAction.sol
└── test/                             # Mock contracts for testing
    ├── ERC1967ProxyHelper.sol
    ├── MockERC20.sol
    └── MockPriceOracle.sol
test/
├── StrategyBuilderVault.ts
└── StrategyBuilderVaultFactory.ts
```

### Writing a Custom Condition

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/ICondition.sol";

contract MyCondition is ICondition {
    struct Params {
        // your parameters
    }

    function check(
        bytes calldata params,
        bytes[] calldata ctx
    ) external view override returns (bool met) {
        Params memory p = abi.decode(params, (Params));
        // your logic — view only, no state writes
        met = /* ... */;
    }
}
```

To also advance state after execution, implement `IUpdatableCondition` and add an `afterExecution` function that returns a context diff.

### Writing a Custom Action

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IAction.sol";

// NO state variables — actions are delegatecalled into the vault's context
contract MyAction is IAction {
    struct Params {
        // your parameters
    }

    function execute(
        bytes calldata params,
        bytes[] calldata ctx
    ) external override returns (
        uint32[] memory updatedSlots,
        bytes[] memory updatedValues
    ) {
        Params memory p = abi.decode(params, (Params));
        // address(this) == vault — access vault's tokens directly

        // return empty diff if no context updates needed
        updatedSlots  = new uint32[](0);
        updatedValues = new bytes[](0);
    }
}
```

> **Important:** Action contracts must have **no storage variables**. They run via `delegatecall` inside the vault's storage context — any `sstore` writes to the vault's storage slots, potentially corrupting it.
