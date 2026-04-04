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
  - [Fee Reduction](#fee-reduction)
  - [Protocol Token](#protocol-token)
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

Vaults are deployed by the **StrategyBuilderVaultFactory** via CREATE2. The factory owner sets the shared `FeeRegistry` and `PriceOracle` that all new vaults inherit — vault creators choose only their `depositToken` (ERC-20 used to pay fees) and `creator` (strategy creator address for fee sharing).

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
- **No fees are charged** — owner executions bypass the fee settlement entirely.

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

Actions also return a `(volumeToken, volumeAmount)` pair used for fee tracking. The vault queries the price oracle to convert this to USD and accrues a per-step fee.

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
┌─────────────────────────────────────────────────────────────────┐
│                    Protocol (Factory Owner)                      │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              StrategyBuilderVaultFactory                  │   │
│  │  - _vaultImplementation  (shared implementation)         │   │
│  │  - feeRegistry            ──────────────────────────┐    │   │
│  │  - priceOracle            ──────────────────────┐   │    │   │
│  │  - isRegisteredVault()    (IVaultRegistry)      │   │    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                         │ CREATE2                │   │           │
│          ┌──────────────┘                        │   │           │
└──────────┼───────────────────────────────────────┼───┼───────────┘
           │                                       │   │
           ▼                                       │   │
  ┌─────────────────────┐  ┌───────────────────────▼───▼──────────┐
  │  ERC1967Proxy        │  │             FeeRegistry               │
  │  (per user)          │  │  - vaultDeposits[vault][token]        │
  │                      │  │  - ownerProtocolDeposits[owner][token]│
  │  ┌────────────────┐  │  │  - claimable[party][token]            │
  │  │StrategyBuilder │  │  │  - fee rates per (contract,selector)  │
  │  │    Vault        │  │  │  - gas comp (IPriceOracle)            │
  │  │  - automations │  │  │  - fee reduction (IFeeReduction)      │
  │  │  - context[]   │  │  │  - protocol token + discount          │
  │  │  - owner       │  │  └───────────────────────────────────────┘
  │  └────────────────┘  │
  └─────────────────────┘   External (pre-existing):
                             ┌──────────────────┐  ┌───────────────┐
                             │  IPriceOracle     │  │ IFeeReduction │
                             │  (USD prices)     │  │ (per-wallet   │
                             └──────────────────┘  │  reduction)   │
                                                    └───────────────┘
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
│       ├─ delegatecall → (slots, values, volumeToken, volumeAmount)
│       ├─ Apply context diff
│       ├─ Query price oracle → compute stepFeeUSD
│       └─ emit FeeAccrued
│
├─ triggerFired?
│   └─ staticcall afterExecution on step 0 (if IUpdatableCondition)
│       └─ Apply returned context diff (e.g. advance interval schedule)
│
├─ Save context to storage (only when modified)
│
├─ owner caller? → skip fees, done
│
├─ gasUsed = gasStart − gasleft()
└─ _settleFees → FeeRegistry.deductFees
    └─ emit FeesSettled
```

### Fee System

Fees consist of two components:

**1. Volume-based fee**

Each `(actionContract, functionSelector)` pair can have a fee rate (in basis points, max 10%) registered in FeeRegistry. When an action reports a non-zero `(volumeToken, volumeAmount)`:

```
volumeUSD  = volumeAmount × tokenPriceUSD / 1e18
stepFeeUSD = volumeUSD × feeBps / 10_000
```

All per-step fees accumulate over the automation run and are settled once at the end.

**2. Gas compensation**

Every execution reimburses the executor for gas. The gas price is capped at `maxGasPrice` to prevent executors from inflating reimbursement with an artificially high `tx.gasprice`:

```
effectiveGasPrice = min(tx.gasprice, maxGasPrice)   (if maxGasPrice > 0)
gasCostUSD        = (gasUsed + overhead) × effectiveGasPrice × nativeTokenPriceUSD / 1e18
gasCompUSD        = gasCostUSD × (10_000 + executorMarkupBps) / 10_000
gasCompTokens     = feeTokenAmount(gasCompUSD)
```

Gas compensation is the **minimum fee** — if the volume fee is smaller, gas comp wins:

```
totalTokens = max(volumeTokens, gasCompTokens)
```

**Token pricing**

When a price oracle is configured, `feeTokenAmount` converts USD to tokens using the deposit token's live market price:

```
tokenAmount = feeUSD × 10^decimals / tokenPriceUSD
```

If the oracle is unavailable or has no price for that token, it falls back to a 1-token-per-USD assumption adjusted for decimals.

**Distribution**

After deducting `gasCompTokens` for the executor (guaranteed), the remainder is split four ways:

| Party | Share |
|---|---|
| Protocol vault | `protocolBps` |
| Executor | `executorBps` (additional profit on top of gas comp) |
| Strategy creator | `creatorBps` |
| Burn contract | `burnBps` (direct transfer, not claimable) |

All bps must sum to 10,000. Protocol, executor, and creator accumulate claimable balances and pull them with `claim(token)`.

**Pre-funded deposits**

Fees are deducted from a vault's pre-funded deposit in FeeRegistry, not from the vault's live token balance (preventing automation actions from accidentally draining the fee reserve). Vault owners call `depositFor` or use `FeeDepositAction` to maintain this balance. Deposits can be recovered at any time via `withdrawDeposit`, even after the token has been removed from the accepted list.

**Owner executions**

When the vault owner calls `executeAutomation` directly, no fees are calculated or deducted — regardless of the automation type.

### Fee Reduction

Vault owners can qualify for a volume-fee discount via an external `IFeeReduction` contract. Reduction is expressed in basis points (0 = no reduction, 5000 = 50% off, 10000 = free).

**Security**: Only vaults created by the registered factory are eligible. The FeeRegistry reads the vault's `owner()` to identify who the reduction belongs to — a contract that is not in the factory's registry cannot claim anyone's discount.

Gas compensation is **never** reduced.

### Protocol Token

The protocol can designate a special ERC-20 as the **protocol token**. Vault owners deposit this token once — not per vault, but once for their entire owner address — and it covers fees for all their vaults at a discount.

**How it works:**

1. Protocol owner calls `setProtocolToken(token, discountBps)` — token must already be accepted.
2. Vault owner calls `depositProtocolToken(amount)` — funds credited to `ownerProtocolDeposits[owner][token]`.
3. On every `deductFees` call, FeeRegistry first checks if the vault's owner has enough protocol token balance to cover the fee (with discount applied to the volume component). If yes, it deducts from the owner's deposit instead of the vault's deposit-token balance.
4. If the protocol token balance is insufficient, it falls back to the vault's normal deposit-token balance.

**Discount:**

The discount applies only to the volume-based fee component, not to gas compensation:

```
discountedVolume = rawVolumeTokens × (10_000 − discountBps) / 10_000
totalProto       = max(discountedVolume, gasCompTokens)
```

**Withdrawal:**

Vault owners can reclaim unused protocol tokens at any time via `withdrawProtocolToken(token, amount)`. The token address is passed explicitly so withdrawals work correctly even if the protocol token was later changed to a different address.

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
| `depositToken_` | ERC-20 used to pay fees (`address(0)` = tracking only, no settlement) |
| `creator_` | Strategy creator receiving the creator fee share (`address(0)` = protocol) |
| `priceOracle_` | IPriceOracle for USD conversion (`address(0)` = no fee accrual) |

**Owner functions:**

| Function | Description |
|---|---|
| `createAutomation(steps[])` | Create a public automation (step 0 must be CONDITION) |
| `createOwnerAutomation(steps[])` | Create an owner-only automation (step 0 can be ACTION or CONDITION; no fees) |
| `updateAutomationSteps(id, steps[])` | Replace all steps (context unaffected) |
| `setAutomationActive(id, bool)` | Pause or resume an automation |
| `setContext(bytes[])` | Replace the entire shared context |
| `setContextSlot(slot, value)` | Update a single context slot |
| `setMinFeeDeposit(amount)` | Set target fee reserve for FeeDepositAction |
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
| `depositToken()` | ERC-20 token used for fee settlement |
| `creator()` | Strategy creator address for the creator fee share |
| `feeRegistry()` | Address of the FeeRegistry |
| `minFeeDeposit()` | Minimum fee deposit target |

**Limits:**
- `MAX_STEPS = 256` per execution (prevents infinite loops)
- `DONE = type(uint32).max` sentinel to terminate traversal

### StrategyBuilderVaultFactory

Deploys vaults. The factory owner controls which FeeRegistry and PriceOracle all vaults use.

**Owner functions:**

| Function | Description |
|---|---|
| `setVaultImplementation(addr)` | Set implementation for future vaults (existing vaults unaffected) |
| `setFeeRegistry(addr)` | FeeRegistry forwarded to all new vaults |
| `setPriceOracle(addr)` | PriceOracle forwarded to all new vaults |

**Public functions:**

```solidity
function createVault(
    address vaultOwner,    // who owns the vault
    address depositToken_, // ERC-20 for fee settlement (must be accepted by FeeRegistry)
    address creator_,      // strategy creator (address(0) = protocol receives creator share)
    bytes32 salt           // per-caller CREATE2 entropy
) external returns (address vault)
```

- `depositToken_` is validated against the FeeRegistry at creation time — if the token is not accepted, the call reverts with `FeeTokenNotAccepted`.
- CREATE2 salt is mixed with `msg.sender` → `keccak256(abi.encodePacked(msg.sender, salt))` — same salt from different callers always yields different vault addresses, preventing front-running.

**Views:**
- `getVault(index)` — vault address by creation index
- `vaultCount()` — total vaults ever created
- `isRegisteredVault(addr)` — O(1) check (used by FeeRegistry for fee reduction and protocol token gating)

### FeeRegistry

Custodian for all vault fee deposits. Tracks per-action fee rates, distributes fees, guarantees executor gas reimbursement, and supports owner-wide protocol token payments.

**Setup sequence (owner):**

```solidity
// 1. Register accepted fee tokens
feeRegistry.addAcceptedToken(token, decimals);

// 2. Set distribution (all bps must sum to 10_000)
feeRegistry.setDistribution(
    protocolVault, burnContract,
    5000,  // protocol 50%
    2000,  // executor 20%
    2000,  // creator  20%
    1000   // burn     10%
);

// 3. Configure gas compensation
feeRegistry.setGasConfig(
    priceOracle,      // IPriceOracle for native token price
    address(0),       // native token convention (e.g. address(0) = BNB)
    2000,             // 20% markup on top of raw gas cost
    50_000,           // overhead gas units covering settlement path
    500e9             // maxGasPrice cap in wei (0 = no cap)
);

// 4. Set fee rates per action
feeRegistry.setFee(actionContract, selector, 100); // 1% (100 bps)

// 5. Optional: fee reduction
feeRegistry.setFeeReductionConfig(feeReductionContract, factoryAddress);

// 6. Optional: protocol token
feeRegistry.setProtocolToken(protoTokenAddress, 5000); // 50% discount on volume fee
```

**Vault deposit:**

```solidity
// Vault owner pre-funds fees (or use FeeDepositAction for automation)
depositToken.approve(address(feeRegistry), amount);
feeRegistry.depositFor(vaultAddress, depositToken, amount);

// Withdraw deposit (e.g. when migrating or delisting a token)
// Called from the vault itself (msg.sender == vault)
feeRegistry.withdrawDeposit(token, amount); // 0 = full balance
```

**Protocol token deposit (owner-wide):**

```solidity
// Owner deposits once to cover all their vaults
protoToken.approve(address(feeRegistry), amount);
feeRegistry.depositProtocolToken(amount);

// Withdraw unused protocol tokens (explicit token address for safety)
feeRegistry.withdrawProtocolToken(protoTokenAddress, amount); // 0 = full balance
```

**Claiming:**

```solidity
// Any party with claimable balance calls:
feeRegistry.claim(token);
```

**deductFees priority:**

1. If `protocolToken` is set and the vault's owner has sufficient `ownerProtocolDeposits` → pay in protocol token (discounted volume fee)
2. Otherwise → deduct from `vaultDeposits[vault][depositToken]` (with any `IFeeReduction` discount applied)

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
        bytes[] memory updatedValues,
        address volumeToken,
        uint256 volumeAmount
    );
}
```

Called via `delegatecall`. Must be **stateless** (no storage variables). `updatedSlots` and `updatedValues` must have equal length. Return `(address(0), 0)` to report no fee-bearing volume.

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

**IFeeReduction** — returns a per-wallet fee reduction in basis points (0–10,000).

**IVaultRegistry** — `isRegisteredVault(address) → bool`. Implemented by the factory; used by FeeRegistry for fee reduction and protocol token gating.

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

**Example** — trigger when vault holds ≥ 100 USDC:

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

Transfers ERC-20 tokens from the vault to a recipient.

```solidity
struct Params {
    address token;
    address recipient;
    uint256 amount;          // 0 = transfer full vault balance
    uint32  amountFromSlot;  // read amount from context slot (NO_SLOT to use static)
    uint32  amountToSlot;    // write transferred amount to context slot (NO_SLOT to skip)
}
```

**Examples:**

```solidity
// Transfer exactly 50 USDC to a cold wallet
abi.encode(usdc, coldWallet, 50e6, NO_SLOT, NO_SLOT)

// Transfer full BNB balance, write the amount to slot 2
abi.encode(wbnb, recipient, 0, NO_SLOT, 2)

// Transfer whatever amount is stored in slot 2 (chained from previous step)
abi.encode(usdc, recipient, 0, 2, NO_SLOT)
```

Reports the transferred amount as fee-bearing volume. If no transfer occurs (e.g. zero balance), no fee is accrued for that step.

---

### FeeDepositAction

Automatically tops up the vault's fee deposit in FeeRegistry when it falls below the configured minimum.

```solidity
struct Params {
    address feeRegistry;
    address token;
    uint256 topUpAmount;   // 0 = fill exactly to minFeeDeposit
}
```

**Typical placement:** as the last action in an automation — after a fee-generating step, check if the deposit needs topping up.

The action reads `vault.minFeeDeposit()` to know the target. If the current deposit already meets or exceeds the minimum, it does nothing. The top-up itself does not generate a fee.

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
factory.setPriceOracle(priceOracleAddress)

# 5. Configure FeeRegistry
feeRegistry.addAcceptedToken(token, decimals)
feeRegistry.setDistribution(protocolVault, burnContract, pBps, eBps, cBps, burnBps)
feeRegistry.setGasConfig(oracle, nativeToken, markupBps, overhead, maxGasPrice)
feeRegistry.setFee(actionContract, selector, feeBps)

# 6. Optional: fee reduction
feeRegistry.setFeeReductionConfig(feeReductionContract, factoryAddress)

# 7. Optional: protocol token (token must be added first)
feeRegistry.setProtocolToken(protoTokenAddress, discountBps)
```

### Creating a Vault (User)

```solidity
address vault = factory.createVault(
    msg.sender,      // vault owner
    depositToken,    // ERC-20 to pay fees with (e.g. USDT; must be accepted by FeeRegistry)
    creator,         // address(0) if no strategy creator
    bytes32(0)       // salt (use different values to create multiple vaults)
);

// Pre-fund the fee deposit
depositToken.approve(feeRegistry, depositAmount);
feeRegistry.depositFor(vault, depositToken, depositAmount);

// Optional: deposit protocol tokens for owner-wide fee coverage
protoToken.approve(feeRegistry, protoAmount);
feeRegistry.depositProtocolToken(protoAmount);
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
        data:        abi.encode(usdc, coldWallet, 100e6, NO_SLOT, NO_SLOT)
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
        data:        abi.encode(usdc, owner, 0, NO_SLOT, NO_SLOT) // amount=0 → full balance
    })
]);

// Only the vault owner can call this — no fees charged
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
│       ├── IPriceOracle.sol
│       └── IFeeReduction.sol
├── examples/
│   ├── conditions/
│   │   ├── TokenBalanceCondition.sol
│   │   ├── IntervalCondition.sol
│   │   └── TimerCondition.sol
│   └── actions/
│       ├── ERC20TransferAction.sol
│       └── FeeDepositAction.sol
└── test/                             # Mock contracts for testing
    ├── MockERC20.sol
    ├── MockPriceOracle.sol
    └── MockFeeReduction.sol
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
        bytes[] memory updatedValues,
        address volumeToken,
        uint256 volumeAmount
    ) {
        Params memory p = abi.decode(params, (Params));
        // address(this) == vault — access vault's tokens directly

        // return empty diff if no context updates needed
        updatedSlots  = new uint32[](0);
        updatedValues = new bytes[](0);

        // report no fee-bearing volume
        volumeToken  = address(0);
        volumeAmount = 0;
    }
}
```

> **Important:** Action contracts must have **no storage variables**. They run via `delegatecall` inside the vault's storage context — any `sstore` writes to the vault's storage slots, potentially corrupting it.
