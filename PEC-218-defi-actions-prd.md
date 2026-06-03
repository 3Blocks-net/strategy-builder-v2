# PRD — PEC-218: DeFi-Aktionen (Actions)

> **Jira Epic:** [PEC-218 — DeFi-Aktionen (Actions)](https://3blocks-lab.atlassian.net/browse/PEC-218) · Project: Pecunity (PEC)
> **Source material:** `research.md` §6 + "PEC-218 Addendum — 8 Action Contracts" (re-verified 2026-06-03).
> **Status:** Draft for review. **Revised 2026-06-03 after design review** — see callouts marked _(Entscheidung Review)_; the most significant changes are: swap/LP price protection removed by design, Aave amount inputs expanded to a 4-mode model (incl. target-health-factor) across all four Aave actions, and `ActionLib` promoted from a sentinel helper to the central computation module.

---

## Problem Statement

A DeFi investor can already build an automation in the Strategy Builder — a graph of conditions and actions that a public executor runs against their vault. But today the only on-chain operations available are **ERC-20 Transfer** and **Fee Deposit**. An automation can *trigger* (interval, timer, balance threshold) yet has almost nothing meaningful to *do*. There is no way to lend, borrow, swap, or provide liquidity from inside a vault.

As a result, the core value proposition — "automate my recurring DeFi strategy" — is unreachable. An investor who wants to dollar-cost-average into a token, auto-supply idle stablecoins to Aave for yield, auto-repay a loan when a balance arrives, or rebalance an LP position cannot express any of it. The protocol triggers fire into a void.

## Solution

Ship a library of **stateless, delegatecall-executed DeFi action contracts** covering the two protocols that carry the majority of BSC DeFi volume — **Aave V3** (lending) and **PancakeSwap V3** (spot swaps + concentrated-liquidity LP) — plus the existing **ERC-20 Transfer**. Each action becomes a configurable node in the visual graph editor, wired into the same friendly-params → encode-boundary → calldata pipeline that the existing steps use.

Because actions run via `delegatecall` from the vault (`address(this) == vault`), tokens, approvals, debt positions, and LP NFTs all belong to the vault. Actions call the external protocols via regular `call` (never `delegatecall`), use `forceApprove`, and pass data between each other through the vault's shared context slots (e.g. a swap writes its output amount into a slot that a subsequent supply reads as its input).

From the investor's perspective: they drag an "Aave Supply" or "PancakeSwap Swap" node onto the canvas, pick a token from a curated list, and choose how the amount is determined — a fixed value, "full balance", a value from a previous step, or (for Aave) a target health factor / protocol maximum. For LP they pick a price range. Then they deploy, and the automation performs real on-chain DeFi operations on every trigger.

> **(Entscheidung Review):** Swaps and LP operations ship **without on-chain price/slippage protection** (`amountOutMinimum = 0`, LP `amountMin = 0`). The product priority is that a strategy step **executes** rather than reverting mid-strategy; the MEV/sandwich exposure on a public-executor swap is a consciously accepted risk, to be addressed later via a dedicated "protected swap" node. See _The nine new action contracts_ and _Out of Scope_.

To keep the contracts portable across chains, the protocol's contract addresses are not hardcoded into every action. Instead, two small **registry contracts** (one per protocol) hold the addresses; each action holds an immutable pointer to its registry and looks the addresses up at execution time. Deploying to a new chain means deploying the registries with that chain's addresses — the actions are unchanged. The Aave registry stores the **`PoolAddressesProvider`** (Aave's own canonical indirection) rather than a bare `Pool` address, so an Aave oracle re-point is followed automatically (see _Contract architecture_).

## User Stories

### ERC-20 Transfer (already exists — included for completeness / regression)

1. As a DeFi investor, I want to transfer an ERC-20 token from my vault to an address, so that I can automate payouts or moving funds.
2. As a DeFi investor, I want the transfer to optionally deduct the protocol withdraw fee, so that fee accounting stays correct when I move funds out.
3. As a DeFi investor, I want to transfer the full vault balance of a token via a toggle, so that I don't have to know the exact amount in advance.
4. As a DeFi investor, I want the transfer amount to come from a context slot written by a previous step, so that I can forward the proceeds of one action into a transfer.

### Aave V3 — Supply

5. As a DeFi investor, I want to supply a token from my vault to Aave V3 as collateral, so that I earn supply yield on idle assets automatically.
6. As a DeFi investor, I want to supply either a fixed amount, the full vault balance, or an amount read from a context slot, so that I can compose supply with earlier steps (e.g. supply what I just swapped).
7. As a DeFi investor, I want the supply action to set the approval safely with `forceApprove`, so that USDT-style non-standard approvals don't break the automation.
8. As a DeFi investor, I want to choose the supplied token only from tokens Aave actually supports on BSC, so that I can't accidentally configure a reserve that will revert.

### Aave V3 — Withdraw

9. As a DeFi investor, I want to withdraw a supplied token (collateral) from Aave back into my vault, so that I can reclaim assets as part of an automated strategy.
10. As a DeFi investor, I want a "withdraw everything" option, so that I can pull my entire aToken position without tracking the exact, interest-accruing balance.
11. As a DeFi investor, I want the *actual* withdrawn amount written to a context slot, so that a later step can act on the real number (which differs from the "max" sentinel).

### Aave V3 — Borrow

12. As a DeFi investor, I want to borrow a token from Aave against my vault collateral, so that I can automate leveraged or liquidity strategies.
13. As a DeFi investor, I want borrowing to always use the variable interest rate mode, so that the action never reverts on the deprecated stable-rate path.
14. As a DeFi investor, I want the borrowed amount written to a context slot, so that I can feed it into a subsequent swap or transfer.

### Aave V3 — amount-mode model _(Entscheidung Review — applies to Supply, Withdraw, Borrow, Repay)_

14a. As a DeFi investor, I want every Aave action to accept the amount as one of four **modes** — **FIXED** (exact value), **FROM_SLOT** (value from a previous step), **MAX_AVAILABLE** (the protocol-native maximum for that action), or **TARGET_HF** (compute the amount that moves my position to a target health factor) — so that I can express both simple and rebalancing strategies with one node.
14b. As a DeFi investor, I want the **TARGET_HF** mode to no-op (rather than revert) when my current health factor is already on the wrong side of the target, so that a rebalancing automation keeps running and simply does nothing when there's nothing to do.
14c. As a DeFi investor, I want the **MAX_AVAILABLE** mode to never revert from edge rounding (a small safety haircut on borrow/withdraw; repay capped at my balance), so that "do the maximum" is reliable.

### Aave V3 — Repay

15. As a DeFi investor, I want to repay an Aave loan from my vault, so that I can automate debt management (e.g. repay when a payment arrives).
16. As a DeFi investor, I want a "repay full debt" option, so that I can clear my position without knowing the exact accrued debt.
17. As a DeFi investor, I want to repay a partial fixed amount or an amount from a context slot, so that I can repay exactly what a previous step produced.
18. As a DeFi investor, I want the *actual* repaid amount written to a context slot, so that downstream steps see the true figure.

### PancakeSwap V3 — Swap

19. As a DeFi investor, I want to swap one token for another via PancakeSwap V3, so that I can automate DCA buys, rebalances, and conversions.
20. As a DeFi investor, I want to pick the pool fee tier (0.01% / 0.05% / 0.25% / 1%), so that my swap routes through the correct, most-liquid pool.
21. As a DeFi investor, I want my swap to **execute reliably without reverting mid-strategy** on price movement, so that a downstream step (supply/transfer/LP) always receives the swap's output. _(Entscheidung Review: ships with `amountOutMinimum = 0` — no slippage protection; sandwich risk consciously accepted, see Out of Scope.)_
22. As a DeFi investor, I want the system to be **forward-compatible with a future "protected swap"** so that price protection can be added later without redeploying contracts. _(The struct keeps an optional static `amountOutMinimum` + `minOutFromSlot`, default 0.)_
23. As a DeFi investor, I want the pool to actually exist for my chosen token pair + fee tier **before I deploy**, so that the automation doesn't silently die at execution. _(Frontend `factory.getPool` validity check blocks deploy.)_
24. As a DeFi investor, I want the swap output amount written to a context slot, so that I can chain it into a supply, transfer, or LP step.
25. As a DeFi investor, I want to swap the full vault balance of the input token via a toggle, so that I can sweep a token without knowing the exact balance.

### PancakeSwap V3 — LP Mint

26. As a DeFi investor, I want to open a new PancakeSwap V3 liquidity position from my vault, so that I can automate entering an LP for fees.
27. As a DeFi investor, I want to define the position's price range either as an explicit min/max price or as a preset width (e.g. ±10%) around the current price, so that I can choose between precise control and convenience.
28. As a DeFi investor, I want the position NFT token-id reliably written to a context slot, so that later automations can manage exactly that position.
29. As a DeFi investor, I want token ordering and approvals handled automatically, so that I never have to think about `token0 < token1` ordering or which token gets approved.

### PancakeSwap V3 — Increase Liquidity

30. As a DeFi investor, I want to add liquidity to an existing position identified by a token-id from a context slot, so that I can automate scaling into a position over time.

### PancakeSwap V3 — Decrease Liquidity

31. As a DeFi investor, I want to remove liquidity from a position and have the freed tokens actually delivered to my vault in one step, so that I don't have to remember that `decreaseLiquidity` requires a separate `collect`.
32. As a DeFi investor, I want to specify how much liquidity to remove (or all of it), so that I can partially or fully exit a position.

### PancakeSwap V3 — Collect

33. As a DeFi investor, I want to collect accrued fees (and any owed tokens) from a position into my vault, so that I can automate harvesting LP rewards.

### Cross-cutting

34. As a DeFi investor, I want every action to fail safely and revert (rather than silently mis-execute) if a token, slot, or amount is invalid, so that a misconfigured step never quietly loses funds.
35. As a protocol operator, I want all protocol addresses to live in per-protocol registry contracts, so that deploying to a new chain only requires deploying registries — not re-auditing or redeploying every action.
36. As a protocol developer, I want the actions to share a single audited helper for amount/slot resolution, so that the same sentinel logic isn't copy-pasted (and divergently bugged) across nine contracts.
37. As a DeFi investor, I want each new action to appear as a categorized node in the editor with inline field validation, so that I'm guided to a valid configuration before I can deploy.

## Implementation Decisions

### Contract architecture

- **Registry-per-protocol, addresses fixed at construction.** Two new contracts:
  - **`AaveV3Registry`** stores the **`PoolAddressesProvider`** (`0xff75…`) as `immutable`. In its constructor it resolves and **caches the `Pool`** (a stable proxy — Aave upgrades the implementation behind it transparently). It does **not** cache the price oracle: the oracle is resolved at **execution time** via `provider.getPriceOracle()`, and only by the modes that need it (MAX_AVAILABLE / TARGET_HF). _(Entscheidung Review:_ caching the oracle would defeat the AddressesProvider's purpose — Aave governance can re-point the oracle, and runtime resolution guarantees the action reads the **same** oracle Aave uses internally for the health factor, which is a correctness requirement for the TARGET_HF math.)
  - **`PancakeSwapV3Registry`** stores `SwapRouter`, `NonfungiblePositionManager`, and `Factory` as three direct `immutable`s. **No oracle** _(Entscheidung Review: removed — swaps ship without on-chain minimum-out, so no price reference is needed)._
  - Both registries are immutable — no owner, no setters. A protocol migration (new PCS router, full Aave pool migration) is handled by deploying a new registry and repointing actions (acceptable; trustless surface preferred over an admin key).
- **Actions hold an `immutable registry`.** Each action takes its registry address in its constructor and stores it as an `immutable`. Immutables live in the contract **bytecode**, not storage — so they are read correctly under `delegatecall` (the EVM executes the action's code) and **do not violate the "stateless / no storage slots" rule**. This is the mechanism that keeps actions both stateless *and* address-portable.
- **Actions call external protocols via regular `call`.** Never `delegatecall` into Aave/PancakeSwap — that would corrupt vault storage. Confirmed working pattern (research §6).
- **Approvals use `SafeERC20.forceApprove`** (OZ 5.6.1), matching the existing `ERC20TransferAction`. **After every external call that pulled tokens, the action resets the allowance to 0** (`forceApprove(target, 0)`) _(Entscheidung Review)_ — Repay-MAX and Mint/Increase approve more than is consumed and would otherwise leave a standing allowance to the Aave Pool / NPM.
- **`ActionLib` — the central computation module (NOT a small sentinel helper).** _(Entscheidung Review: this is a substantial reframe of the original "deep module" description.)_ A pure Solidity `library` of `internal` functions (inlined into each action's bytecode → delegatecall-safe), carrying **all** shared resolution and math:
  - amount resolution across the three conventions (`0 = full balance`, `type(uint256).max = "all"`, plain explicit) **kept strictly separate so they cannot leak between actions** — e.g. Borrow must never interpret `0` as `balanceOf`;
  - the **Aave 4-mode engine**: full-balance, `availableBorrows`, full-debt, max-safe-withdraw, and the **inverse target-health-factor math in four directions** (Supply/Repay raise HF, Withdraw/Borrow lower it);
  - **18-decimal normalization** of all Aave USD/base inputs (oracle price **and** `getUserAccountData` base values, each ×1e10), and the base→token conversion `tokenAmount = baseAmount18 × 10^assetDecimals / price18` (decimals read dynamically), flooring on the binding side;
  - context-slot read (`uint256`/`uint160`/`tokenId`, bounds-checked) and `(updatedSlots, updatedValues)` diff building.
  Because this module now carries non-trivial arithmetic with multiple decimal scales, it **must have isolated Solidity unit tests with hard numeric fixtures** (see Testing Decisions) — fork tests alone would not catch a 10ⁿ scaling error.

### The nine new action contracts

| Action | Registry | External call | Approval | Context I/O |
|---|---|---|---|---|
| `AaveV3SupplyAction` | Aave | `Pool.supply(asset, amt, vault, 0)` | ✅ pool (reset to 0 after) | 4-mode amount in; optional out-slot |
| `AaveV3WithdrawAction` | Aave | `Pool.withdraw(asset, amt, vault)` → actual | ❌ | 4-mode amount in; actual → slot |
| `AaveV3BorrowAction` | Aave | `Pool.borrow(asset, amt, 2, 0, vault)` | ❌ | 4-mode amount in; borrowed → slot |
| `AaveV3RepayAction` | Aave | `Pool.repay(asset, amt, 2, vault)` → actual | ✅ pool (reset to 0 after) | 4-mode amount in; actual → slot |
| `PancakeSwapV3SwapAction` | PCS | `SwapRouter.exactInputSingle(...)` → amountOut | ✅ router (reset to 0 after) | amountIn in (slot/static/full); **amountOut → slot**; `amountOutMinimum = 0`, `sqrtPriceLimitX96 = 0` |
| `PancakeSwapV3MintAction` | PCS | `NPM.mint(MintParams)` → (tokenId, …) | ✅ both (reset to 0 after) | ticks from `rangeMode` (explicit=static / preset=on-chain `slot0` centering); `amountMin = 0`; **tokenId → slot (required)** |
| `PancakeSwapV3IncreaseLiquidityAction` | PCS | `NPM.increaseLiquidity(...)` | ✅ both (reset to 0 after) | tokenId from slot; amounts in; `amountMin = 0` |
| `PancakeSwapV3DecreaseLiquidityAction` | PCS | `NPM.decreaseLiquidity(...)` **then** `NPM.collect(max,max)` | ❌ | tokenId from slot; **percentage** of liquidity (100% = all, reads live `positions().liquidity`); `amountMin = 0` |
| `PancakeSwapV3CollectAction` | PCS | `NPM.collect(amount0Max=amount1Max=type(uint128).max)` | ❌ | tokenId from slot |

- **Aave amount-mode model (all four Aave actions)** _(Entscheidung Review)_: each action accepts a `mode` ∈ {`FIXED`, `FROM_SLOT`, `MAX_AVAILABLE`, `TARGET_HF`}. `MAX_AVAILABLE` resolves per-action (its meaning differs by action and is **not** a single concept):

  | Action (HF direction) | `MAX_AVAILABLE` resolves to | `TARGET_HF` valid only when |
  |---|---|---|
  | Supply (HF ↑) | full vault balance `balanceOf(asset)` | current HF **<** target (capped by balance → best-effort) |
  | Withdraw (HF ↓) | max-safe (HF ≥ 1, minus haircut); `uint256.max` only if **no** debt | current HF **>** target |
  | Borrow (HF ↓) | `availableBorrowsBase` → token, minus haircut | current HF **>** target |
  | Repay (HF ↑) | `min(debt, balance)` (`uint256.max` if balance ≥ debt) — revert-free | current HF **<** target |

  - **TARGET_HF wrong-direction → no-op** (amount 0, step proceeds); **holdings cap → best-effort**, never revert.
  - **Haircut**: fixed conservative constant (~50 bps) in `ActionLib`, applied only to Borrow-MAX and Withdraw-MAX (the edge-binding cases). TARGET_HF needs none (target carries margin).
  - **Health-factor floor**: `targetHealthFactor` must be `> 1.05e18` (backend raw-mode guard).
  - MAX_AVAILABLE / TARGET_HF read `getUserAccountData` + `getAssetPrice` (oracle resolved at runtime); FIXED / FROM_SLOT / full-balance read neither.
- **Interest rate mode is always `2` (variable)** for Borrow/Repay — stable rate is disabled on every Aave V3 market.
- **`block.timestamp` is the deadline** for all swap/LP params (set inside the action).
- **Token ordering for Mint**: the action sorts the pair (`token0 < token1`) and the matching amounts before building `MintParams`. For **explicit-price** ranges the frontend inverts price and swaps lower/upper to match the sort *before* computing ticks; **preset-width** is symmetric and ordering-agnostic.
- **Decrease is two on-chain steps in one action**: `decreaseLiquidity` accrues tokens to the position, then `collect(max,max)` pulls them (incl. accrued fees) to the vault — bundled so the user sees one node.
- **NFT custody** _(Entscheidung Review)_: `onERC721Received` is implemented **proactively and unconditionally** in `StrategyBuilderVault` (a 4-line magic-selector return, zero downside) — immune to today's non-safe `_mint` *and* a future NPM switch to `_safeMint`. A hard fork test still asserts mint succeeds and the vault owns the NFT. (Existing vaults pick this up via `setVaultImplementation` — a protocol rollout step outside this Epic.)

### Swap / LP price protection — removed by design (key decision)

> _(Entscheidung Review — reverses the earlier oracle-based minimum-out design.)_

- Swaps run with **`amountOutMinimum = 0`** and **`sqrtPriceLimitX96 = 0`**; LP mint/increase/decrease run with **`amount0Min = amount1Min = 0`**. The product priority is **"the step executes"** over **"the step is price-protected"** — a revert mid-strategy is judged worse than the MEV loss.
- **Consciously accepted risk:** a public executor controls execution timing and can atomically sandwich a swap. For non-trivial trade sizes this is deterministic value extraction. Accepted for the MVP; the planned mitigation is a future dedicated **"protected swap"** node, not on-chain protection in these actions.
- **Forward-compatibility:** the swap struct keeps an **optional static `amountOutMinimum` (default 0) + `minOutFromSlot`**, and LP keeps optional `amountMin` (default 0), so protection can be switched on later **without a contract redeploy** — only a UI field needs unhiding.
- **No oracle, no QuoterV2** anywhere in the PCS path. The PancakeSwap token list is therefore **not** oracle-constrained.
- **⚠️ Epic conflict to resolve:** the Epic success criterion *"Swap erzwingt amountOutMinimum > 0"* is **contradicted** by this decision and must be formally renegotiated/rewritten with the Epic owner. The corresponding test is **inverted**: it must now prove a swap with `amountOutMinimum = 0` **executes** (rather than reverting).

### Tick range for Mint (on-chain preset centering)

> _(Entscheidung Review.)_

- **Two range modes**, distinguished by an on-chain `rangeMode` flag carried in the raw params:
  - **explicit price** (`rangeMode = 0`): the frontend computes `tickLower`/`tickUpper` from the absolute min/max price off-chain (price→tick `log`, decimals known), rounded **outward** to the fee tier's tick spacing; the action uses them as-is.
  - **preset width** (`rangeMode = 1`): the frontend passes only a **`tickDelta` constant** (a ±% band is a constant tick width regardless of price; `log` computed once off-chain). The **action** reads `pool.slot0().tick` at execution and centers: `tickLower/Upper = tick ∓ tickDelta`, rounded **outward**. This is robust to deploy→execution drift and is *cheaper* on-chain than off-chain (slot0 gives the tick directly — no on-chain `log`).
- Requires the PCS registry's `Factory`: Mint does `getPool(t0,t1,fee) → pool.slot0()`. Increase/Decrease/Collect need no centering (the position already carries its ticks).

### New external interfaces

Under `packages/contracts/contracts/interfaces/external/`: `IAaveV3Pool` (supply/withdraw/borrow/repay + `getUserAccountData`/`getReserveData`), `IPoolAddressesProvider` (`getPool`, `getPriceOracle`), `IAaveOracle` (`getAssetPrice`), `IPancakeV3SwapRouter` (`exactInputSingle` + `ExactInputSingleParams` incl. `deadline`), `INonfungiblePositionManager` (mint/increase/decrease/collect/`positions` + their param structs incl. `deadline`), `IPancakeV3Factory` (`getPool`), and the PCS pool `slot0()` read for on-chain tick centering. (The project's own `IPriceOracle` is **no longer** used by these actions — Aave HF math reads Aave's own oracle via the AddressesProvider.)

### Backend

- **`prisma/seed.ts`**: add one `StepType` row per new action (category `ACTION`) with its `abiFragment` (ABI tuple) and `paramSchema` (friendly UI schema), following the existing `ERC20TransferAction` row exactly. Addresses are read from `deployments/fork-latest.json`, same as today. Re-seed after redeploy (existing gotcha).
- **`EncodingService` raw-mode guards** (`shared` `validateParams(schema, params, { mode: 'raw' })`): reject fee tier not in `{100, 500, 2500, 10000}`; reject `tickLower >= tickUpper` (explicit-range mode); reject `targetHealthFactor <= 1.05e18` (TARGET_HF mode); reject zero token/recipient where required. Mirrors the existing `interval = 0` guard. _(Entscheidung Review: the `slippageBps ∈ (0, 10_000]` guard is **removed** — no slippage param exists anymore.)_
- **DB-backed curated token lists** _(Entscheidung Review — was a vague "backend-served allowlist")_: a new Prisma entity **`ProtocolToken`** (`protocol`, `address`, `decimals`, `symbol`, `enabled`) with a migration + seed (Aave reserves: WBNB, USDT, USDC, BTCB, ETH, CAKE, FDUSD, wstETH; PancakeSwap: the curated test pairs) and an endpoint `GET /tokens?protocol=aave|pancakeswap`. **Only standard ERC-20s** are listed — explicitly **no fee-on-transfer / rebasing / non-standard tokens**, because they break the context-slot amount accounting that the chaining feature relies on. The list lives **alongside** `/tokens/accepted` (fee tokens) and **its `decimals` feed the frontend `tokenDecimals` map** so the `token-amount → base-units` conversion is correct for protocol tokens too (otherwise the 18-vs-6-decimal bug resurfaces silently).
- **Protocol contract addresses are not stored in the DB**; they live in the on-chain registries. The backend only needs the action contract addresses (from `fork-latest.json` / deployment config) — exactly the existing model. (Only the *token* allowlists are DB-backed.)

### Frontend

- **New `dynamic-form.tsx` widgets:**
  - `fee-tier` — select over the four PancakeSwap fee tiers.
  - `aave-amount-mode` — a `mode` selector (FIXED / FROM_SLOT / MAX_AVAILABLE / TARGET_HF) that conditionally shows the amount field, the slot picker, nothing, or a **target-health-factor** input (friendly e.g. `1.5`). _(Entscheidung Review — replaces the removed `slippage` widget as the main new widget.)_
  - `tick-range` — a `rangeMode` toggle exposing **either** explicit min/max price inputs **or** a preset-width selector (e.g. ±5/±10/±20%). For explicit it computes `tickLower`/`tickUpper` off-chain (price→tick, rounded **outward** to tick spacing); for preset it computes a **`tickDelta` constant** (centering happens **on-chain** in the Mint action). **No `slot0` read in the frontend.**
- **`token-selector` per-protocol source**: a schema hint on the token field selects which DB-backed curated list to load (`GET /tokens?protocol=…`).
- **Pool-existence validity check** _(Entscheidung Review)_: for Swap and Mint the frontend calls `factory.getPool(t0,t1,fee)` at configure time and **blocks deploy / flags the field** if no pool exists for the chosen pair + fee tier — so an invalid combination is caught at config, not as a silent runtime revert. (This is a *validity* read, distinct from the eliminated tick-centering read.)
- **`encode-boundary.ts` mappings**: `mode` → raw mode enum + `targetHealthFactor` (`1.5` → `1.5e18`); `rangeMode` (0/1) + computed `tickLower`/`tickUpper` **or** `tickDelta` are **carried into raw params, not stripped** _(Entscheidung Review — `rangeMode`/`tickDelta` are now on-chain inputs)_; strip only the friendly display fields (percent-width label, price inputs in preset mode, zero-toggle helpers) before `POST /encode`. Reuse existing `token-amount` → base-units conversion (decimals from the loaded token list) and the `amountFromSlot`/`amountToSlot`/`NO_SLOT` conventions.
- **No on-chain reads are required to construct LP parameters** _(Entscheidung Review — corrects the earlier "slot0 read in scope")_: explicit ticks and the preset `tickDelta` are pure off-chain math; preset centering reads `slot0` **inside the action** at execution. The only frontend chain read is the pool-existence validity check above. Decorative/advisory reads (APY badge, health-factor warning, swap output preview) remain **deferred** (see Out of Scope).

### Deployment / fork

- **`scripts/deploy-fork.ts`**: deploy `AaveV3Registry` (pointing at the real BSC **`PoolAddressesProvider`** `0xff75…`) and `PancakeSwapV3Registry` (real `SwapRouter`/`NPM`/`Factory`) — the fork already has live state — then deploy the nine actions (each constructed with its registry address), and write all addresses to `deployments/fork-latest.json` (and the console summary). _(Entscheidung Review: no oracle is configured for PancakeSwap — swaps ship without minimum-out. The Aave HF math reads Aave's own live oracle resolved through the AddressesProvider, so no mock is needed for the Aave path either.)_
- **ABI extraction** (`scripts/extract-abis.js`) emits the new action ABIs to the frontend as today.

## Testing Decisions

A good test here verifies **external, observable behavior**, not internals: given a vault funded with real BSC reserves on a forked mainnet, after an automation runs, the **on-chain effects are correct** (aToken balance increased, debt changed, output token received, LP NFT owned by the vault, the right value landed in the expected context slot). Tests assert outcomes and revert conditions — never private storage layout or the exact sequence of internal calls. Prior art: `packages/contracts/test/StrategyBuilderVault.ts` (Hardhat 3, `await network.connect()`, ESM, top-level await) and the whale-impersonation pattern in `scripts/deploy-fork.ts` (USDT whale `0xF977814e90dA44bFA03b6295A0616a897441aceC`).

All four layers are tested:

1. **Forked-mainnet contract tests (core deliverable).** Per action, against live BSC Aave/PancakeSwap addresses, with the vault whale-funded:
   - Aave Supply/Withdraw/Borrow/Repay exercised against **≥ 3 different BSC reserves** (Epic criterion), across the **four amount modes** — incl. `MAX_AVAILABLE` per-action semantics and `TARGET_HF` reaching the target within tolerance, the **wrong-direction no-op**, and the **best-effort cap** cases.
   - Withdraw/Repay `type(uint256).max` path returns the **actual** amount into a context slot (assert it differs from the sentinel).
   - Swap **executes with `amountOutMinimum = 0`** _(Entscheidung Review — inverted from the old revert-on-zero test)_; **amountOut lands in the expected slot**.
   - LP Mint: **preset-width centering uses on-chain `slot0`** (assert ticks bracket the current tick, rounded outward); position **NFT token-id is written to the expected context slot** and the vault owns the NFT (Epic criterion). Assert the vault's `onERC721Received` is in place (mint succeeds even were NPM to use `_safeMint`).
   - Decrease (by **percentage**): tokens actually arrive in the vault (the bundled `collect` ran), not merely accrued to the position.
   - **Approval hygiene**: after Supply/Repay/Swap/Mint, the action's allowance to the target is back to **0**.
   - Context chaining: a swap's output slot feeds a supply's input (cross-action data flow).
2. **`ActionLib` unit tests — MANDATORY, not optional** _(Entscheidung Review — was "may be added if fork coverage insufficient")_: isolated Solidity tests with **hard numeric fixtures** for the 18-decimal normalization (price + `getUserAccountData` base values ×1e10), base→token conversion at non-18 decimals, the inverse target-HF math in all four directions, the haircut, and slot bounds. A 10ⁿ scaling error would slip past fork tests that happen to use 18-decimal tokens with loose assertions.
3. **Registry contract unit tests.** Constructor stores the AddressesProvider / PCS addresses; the Aave registry resolves+caches `Pool` and resolves the oracle at runtime; getters return them; zero-address construction reverts. (No setters — addresses are immutable.)
4. **Backend schema/encoding tests.** Each new `StepType` paramSchema encodes to correct calldata; raw-mode guards reject bad fee tiers, `tickLower ≥ tickUpper`, and `targetHealthFactor ≤ 1.05e18`. Prior art: existing `EncodingService` / interval-guard tests.
5. **Frontend mapper/widget tests.** `encode-boundary` mappings (`mode` + targetHF → `1e18`; `rangeMode` + price/width → ticks **or** `tickDelta`, carried not stripped) and the new widgets (`aave-amount-mode`, `tick-range`, `fee-tier`) render and emit correct raw params; the `factory.getPool` validity check blocks deploy on a missing pool. Prior art: `features/automation-editor/lib/__tests__` and `components/__tests__`.

## Out of Scope

- **Swap / LP price protection** _(Entscheidung Review)_ — **no** slippage / minimum-out / `amountMin` protection ships in the MVP (`= 0`). The accepted mitigation path is a future dedicated **"protected swap" node**; the struct keeps optional fields so it needs no contract redeploy. The MEV/sandwich exposure on a public-executor swap is a consciously accepted MVP risk.
- **Advisory / informational on-chain reads and their UI**: Aave supply/borrow **APY badge**, **health-factor & liquidation-risk warnings** on Withdraw/Borrow, and the **swap estimated-output preview**. The Epic lists these as nice-to-have hints; deferred to a follow-up. (The TARGET_HF *execution* math is in scope; the *display* warnings are not.)
- **On-chain QuoterV2 usage** — not used at all.
- **Subgraph / indexing** of the new actions' events (research §5) — separate Epic.
- **Multi-hop swaps** (`exactInput` with encoded path) — MVP is single-hop `exactInputSingle` only.
- **Aave stable-rate borrowing** — disabled on V3; not supported.
- **Arbitrary token-address entry** — rejected in favor of curated per-protocol allowlists for the MVP.
- **Registry admin / upgradeability** — registries are immutable; no owner, no setters.
- **New conditions** (e.g. APY threshold, health-factor trigger) — this Epic is actions only.
- **Mainnet deployment & seeding** of the new contracts — this PRD targets the build + forked-mainnet test deliverable; production deploy is a downstream step.

## Further Notes

- **BSC token decimals**: USDT/USDC are **18 decimals** on BSC (not 6). The `token-amount` → base-units conversion must use decimals from the loaded token list, never assume 6 (existing convention — reinforced here because Aave/PCS amounts are high-stakes).
- **18-decimal normalization in the Aave path** _(Entscheidung Review)_: Aave's base currency and `getAssetPrice` are **8 decimals** (`1e8`), while the project's own `IPriceOracle` is 18. `ActionLib` normalizes the Aave path to 18 decimals at the read boundary by scaling **both** the oracle price **and** all `getUserAccountData` base values ×1e10 — the easy-to-miss part is the base values (a different call), and scaling only the price yields a silent **1e10** error. Token decimals are read dynamically so the math holds on non-18-decimal chains.
- **aToken balances rebase** (continuously accrue) — never cache; the `MAX_AVAILABLE`/`TARGET_HF` modes and the `uint256.max` paths read live on-chain.
- **`decreaseLiquidity` ≠ withdrawal**: it only accrues to the position; the bundled `collect` (with `type(uint128).max` maxima) is what delivers tokens to the vault. This is the single most common LP integration bug — explicitly asserted in tests.
- **Registry + immutable pattern is the portability story**: re-targeting a chain = deploy two registries with that chain's addresses; the nine actions are byte-for-byte identical. Document the BSC addresses (research §6) as the canonical registry inputs.
- **Gas**: typical action 150k–600k gas, ~$0.03–0.13 on BSC; a multi-step DeFi automation (swap → supply → …) realistically runs **800k–1.5M gas**. _(Entscheidung Review)_ Because Hardhat-fork gas estimation is unreliable for proxy delegatecalls, both the owner-execute frontend hook and the keeper (`scripts/execute-automations.ts`) use a **fixed generous `executeAutomation` gas override (~2–3M)** — a too-low limit makes a public-executor automation silently never fire.
- **`minFeeDeposit` sizing**: heavier actions raise the per-execution gas-comp settled from the vault's `FeeRegistry` deposit (empty → `InsufficientFeeDeposit` revert). _(Entscheidung Review)_ Surfaced as **UI guidance only** (recommended reserve); not auto-managed in this Epic.
- **`viaIR: true`** is already required (stack-too-deep in `_executeAction`); the LP param structs are large and `ActionLib` is now sizeable — the new actions are compiled **under the production profile**, and a **contract-size check (< 24 KB, EIP-170)** is part of the Definition of Done, since `ActionLib` inlining inflates each action's bytecode.
- **Re-seed after redeploy**: the `StepType` table reads addresses from `fork-latest.json`; stale rows cause `ConditionCallFailed`/dead-address reverts. Delete old rows if addresses change (existing gotcha).
