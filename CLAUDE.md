# Strategy Builder V2 — CLAUDE.md

## Overview

On-chain automation protocol deployed on BSC. Users create **vaults** (ERC1967 proxies) and configure **automations** — directed graphs of Conditions and Actions. A public executor calls `executeAutomation`, the trigger condition gates execution, and actions run in sequence modifying the vault's shared context. Fees are tracked per-action via a price oracle and settled at the end via FeeRegistry.

## Commands

```bash
npx hardhat compile          # Compile all contracts
npx hardhat test             # Run all tests
npx hardhat test test/StrategyBuilderVault.ts   # Run single test file
npx hardhat clean            # Clean artifacts
```

**Compiler**: Solidity 0.8.28, `viaIR: true` (required — stack-too-deep in `_executeAction`), 200 optimizer runs in production profile. Target chain: BSC (EVM cancun).

## Architecture

### Deployment Topology

```
StrategyBuilderVaultFactory  (Ownable, NOT upgradeable)
    │  owns _vaultImplementation (shared implementation)
    │  stores feeRegistry + priceOracle → forwarded to every new vault
    └─ deploys ERC1967Proxy instances via CREATE2
           │  proxy.implementation = StrategyBuilderVault
           └─ per-user isolated storage

FeeRegistry  (Ownable, NOT upgradeable)
    │  stores per-action fee rates
    │  holds vaultDeposits + claimable balances
    └─ called by vaults at end of execution

External contracts (pre-existing, read-only interfaces):
    IPriceOracle   — 18-decimal USD prices per token
    IFeeReduction  — per-wallet volume-fee reduction in bps
```

### Execution Flow (`executeAutomation`)

1. Load vault context (`bytes[]`) into memory
2. Traverse directed graph starting at step 0 (always a CONDITION):
   - **Condition**: `staticcall` → `bool` → follow `nextOnTrue` or `nextOnFalse`
   - **Action**: `delegatecall` → apply context diff + accumulate `stepFeeUSD`
3. Record `triggerFired` on the first step (step 0)
4. If `triggerFired`: call `afterExecution` (staticcall) on step 0 — applies context diff (e.g. IntervalCondition advances schedule)
5. Save context back to storage
6. Measure `gasUsed = gasStart - gasleft()` → `_settleFees`

### Fee Flow

```
Action returns (volumeToken, volumeAmount)
  → vault queries IPriceOracle for USD price
  → volumeUSD = volumeAmount × price / 1e18
  → stepFeeUSD = volumeUSD × feeBps / 10_000

At settlement (FeeRegistry.deductFees):
  gasCompTokens  = (gasUsed + overhead) × tx.gasprice × nativePriceUSD / 1e18
                   × (10_000 + executorMarkupBps) / 10_000
  volumeTokens   = feeTokenAmount(feeUSD)  ← with per-owner reduction applied
  totalTokens    = max(volumeTokens, gasCompTokens)   ← gas is minimum

  gasCompTokens  → executor (guaranteed)
  remaining = totalTokens - gasCompTokens:
    protocolBps  → protocolVault (claimable)
    executorBps  → executor     (claimable)
    creatorBps   → referral     (claimable)
    burnBps      → burnContract (direct transfer)
```

Fee reduction applies only to `volumeTokens`, never to `gasCompTokens`. Only factory-registered vaults qualify.

## Key Interfaces

### IAction (`execute`)

```solidity
function execute(bytes calldata params, bytes[] calldata ctx)
    external
    returns (uint32[] memory updatedSlots, bytes[] memory updatedValues,
             address volumeToken, uint256 volumeAmount);
```

- Called via **delegatecall** — runs in vault's storage context
- **Must be stateless** (no state variables)
- Returns a context diff as two parallel arrays
- `volumeToken = address(0)` / `volumeAmount = 0` = no fee for this step

### ICondition (`check`)

```solidity
function check(bytes calldata params, bytes[] calldata ctx)
    external view returns (bool met);
```

- Called via **staticcall** — read-only
- Context is read-only here

### IUpdatableCondition (`afterExecution`)

```solidity
function afterExecution(bytes calldata params, bytes[] calldata ctx)
    external view returns (uint32[] memory updatedSlots, bytes[] memory updatedValues);
```

- Extends ICondition
- Called via **staticcall** on step 0 after successful execution
- Vault applies returned diff before saving context
- Silently skipped if condition doesn't implement it (try/catch)

## Contract Reference

### StrategyBuilderVault

**State** (set once at `initialize`, immutable-by-convention — no setters):
- `_feeRegistry` — IFeeRegistry; address(0) = fees disabled
- `_feeToken` — ERC-20 for fee settlement; address(0) = tracking only
- `_referral` — creator fee recipient
- `_priceOracle` — IPriceOracle; address(0) = fee accrual disabled

**Other state:**
- `_automations` — mapping(uint32 → Automation)
- `_ctx` — shared `bytes[]` context, all automations read/write the same slots
- `_minFeeDeposit` — target balance in FeeRegistry (for FeeDepositAction)

**Constants:**
- `DONE = type(uint32).max` — terminates graph traversal
- `MAX_STEPS = 256` — per-execution step limit

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

**Validation rules:**
- `steps[0]` must be `CONDITION`
- No zero target or zero selector
- All `nextOnTrue`/`nextOnFalse` must be `< steps.length` or `DONE`
- ACTION steps must have `nextOnFalse == DONE`

### StrategyBuilderVaultFactory

**Protocol-controlled (owner only):**
- `setVaultImplementation(address)` — implementation for future vaults
- `setFeeRegistry(address)` — forwarded to all new vaults
- `setPriceOracle(address)` — forwarded to all new vaults

**Vault creation:**
```solidity
function createVault(
    address vaultOwner,
    address feeToken_,   // address(0) = tracking only
    address referral_,   // address(0) = protocol receives creator share
    bytes32 salt
) external returns (address vault)
```
Effective CREATE2 salt: `keccak256(abi.encode(msg.sender, salt))` — prevents front-running griefing.

**`isRegisteredVault(address)`** — used by FeeRegistry to gate fee reduction.

### FeeRegistry

**Setup sequence:**
1. `addAcceptedToken(token, decimals)` — register fee-payment ERC-20s
2. `setDistribution(protocolVault, burnContract, pBps, eBps, cBps, burnBps)` — bps must sum to 10_000
3. `setGasConfig(priceOracle, nativeToken, executorMarkupBps, overhead)` — address(0) oracle disables gas comp
4. `setFee(actionContract, selector, feeBps)` — per-function fee rates (max 1000 bps = 10%)
5. `setFeeReductionConfig(feeReduction, trustedFactory)` — optional per-owner reduction

**Vault deposits**: `depositFor(vault, token, amount)` pre-funds a vault's fee balance.
**Invariant**: `physicalBalance(token) == Σ vaultDeposits[*][token] + Σ claimable[*][token]`

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

Time-based trigger. Fires when `block.timestamp >= ctx[timeSlot]`. After execution, advances `ctx[timeSlot] += interval` (drift-free — relative to schedule, not `block.timestamp`).

```solidity
struct Params {
    uint256 interval;   // seconds between executions
    uint32 timeSlot;    // context slot holding next trigger time (uint256)
}
```

**Setup:**
```solidity
vault.setContext([abi.encode(startTimestamp)]);   // initialise slot 0
// step 0: IntervalCondition, data = abi.encode(3600, 0)
```

### ERC20TransferAction

Transfers ERC-20 from vault to recipient.

```solidity
struct Params {
    address token;
    address recipient;
    uint256 amount;           // 0 = full vault balance
    uint32 amountFromSlot;    // type(uint32).max = use static amount
    uint32 amountToSlot;      // type(uint32).max = no context write
}
```

Reports `(volumeToken=token, volumeAmount=transferAmount)` for fee tracking.

### FeeDepositAction

Tops up vault's fee deposit when below `vault.minFeeDeposit()`.

```solidity
struct Params {
    address feeRegistry;
    address token;
    uint256 topUpAmount;    // 0 = fill exactly to minFeeDeposit
}
```

No fee for the top-up itself (`volumeToken = address(0)`).

## Test Helpers (TypeScript)

```typescript
const CHECK_SEL      = id("check(bytes,bytes[])").slice(0, 10);
const EXECUTE_SEL    = id("execute(bytes,bytes[])").slice(0, 10);
const AFTER_EXEC_SEL = id("afterExecution(bytes,bytes[])").slice(0, 10);

encodeBalanceParams(token, account, minBalance, aboveOrEqual, minBalanceFromSlot?)
encodeTransferParams(token, recipient, amount, amountFromSlot?, amountToSlot?)
encodeIntervalParams(interval, timeSlot)

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
| `MockFeeReduction` | `setFeeReduction(wallet, bps)` — returns 0 by default |

## Security Notes

- **Actions are delegatecall** — only use audited, stateless action contracts
- `_disableInitializers()` in vault constructor prevents direct-impl initialization
- CREATE2 salt mixes `msg.sender` to prevent vault address griefing
- Fee reduction gated to factory-registered vaults (prevents impersonation)
- Gas compensation never reduced (only volume fees eligible for reduction)
- `MAX_STEPS = 256` prevents infinite loop DoS
- `ReentrancyGuardTransient` on vault execution; `ReentrancyGuard` on FeeRegistry
