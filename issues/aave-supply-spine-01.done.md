# Aave V3 Supply — end-to-end spine (simple amount modes)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

The first tracer bullet for the whole Epic. It builds the complete vertical path for a single DeFi action and, in doing so, stands up **all shared infrastructure** every later slice reuses.

End-to-end behavior: an investor drags an **"Aave Supply"** node onto the canvas, picks a token from the Aave-curated list, chooses an amount as `FIXED`, `FROM_SLOT`, or `MAX_AVAILABLE` (= full vault balance for Supply), deploys, and on each trigger the vault supplies that token to Aave V3 as collateral (the vault's aToken balance increases).

Shared infrastructure established here (reused by slices #2–#10):
- **External Aave interfaces** (`packages/contracts/contracts/interfaces/external/`): `IAaveV3Pool` (`supply` + `getUserAccountData`/`getReserveData`), `IPoolAddressesProvider` (`getPool`, `getPriceOracle`). See PRD _New external interfaces_.
- **`AaveV3Registry`**: stores `PoolAddressesProvider` as `immutable`, resolves and caches `Pool` in constructor; does **not** cache the oracle. Immutable — no owner/setters. See PRD _Contract architecture_.
- **`ActionLib` v1**: pure `library` of `internal` functions for amount resolution across the three conventions **kept strictly separate** (`0 = full balance`, `type(uint256).max = all`, plain explicit) + context-slot read and `(updatedSlots, updatedValues)` diff building. HF/oracle math is **out of scope** here (slice #5). See PRD _ActionLib_.
- **`AaveV3SupplyAction`**: holds `immutable registry`, calls `Pool.supply(asset, amt, vault, 0)` via regular `call`, `forceApprove` then **reset allowance to 0** after. Stateless.
- **`StrategyBuilderVault`** holds the `onERC721Received` proactively? No — defer to #7.
- **Backend**: new Prisma `ProtocolToken` entity (`protocol`, `address`, `decimals`, `symbol`, `enabled`) + migration + seed (Aave reserves: WBNB, USDT, USDC, BTCB, ETH, CAKE, FDUSD, wstETH); `GET /tokens?protocol=aave`; its `decimals` feed the frontend `tokenDecimals` map. `StepType` seed row for `AaveV3SupplyAction` (category `ACTION`, `abiFragment` + `paramSchema`). Raw-mode guard: reject zero token. See PRD _Backend_.
- **Frontend**: `aave-amount-mode` widget (mode selector showing FIXED / FROM_SLOT / MAX_AVAILABLE — `TARGET_HF` mode option may be present but disabled until #5); `token-selector` per-protocol source hint (`GET /tokens?protocol=aave`); `encode-boundary.ts` mode → raw enum mapping; new categorized node. See PRD _Frontend_.
- **Deploy/fork**: `scripts/deploy-fork.ts` deploys `AaveV3Registry` (real BSC `PoolAddressesProvider` `0xff75…`) + `AaveV3SupplyAction`, writes addresses to `deployments/fork-latest.json`; `extract-abis.js` emits the action ABI.

## Acceptance criteria

- [ ] `AaveV3Registry` resolves+caches `Pool` from the AddressesProvider; zero-address construction reverts (registry unit test).
- [ ] `ActionLib` amount-resolution + slot I/O has isolated Solidity unit tests; the three amount conventions cannot leak between actions.
- [ ] Forked-mainnet test: a whale-funded vault supplies to Aave across **≥ 3 BSC reserves**; aToken balance increases for FIXED, FROM_SLOT, and MAX_AVAILABLE (full balance) modes.
- [ ] After Supply, the action's allowance to the Pool is back to **0** (approval hygiene assertion).
- [ ] `ProtocolToken` migration + seed applied; `GET /tokens?protocol=aave` returns the curated reserves with correct `decimals`.
- [ ] Backend encoding test: the Supply `paramSchema` encodes to correct calldata; raw-mode guard rejects a zero token (HTTP 400).
- [ ] Frontend: `aave-amount-mode` + per-protocol `token-selector` render and emit correct raw params; `encode-boundary` maps `mode` → raw enum; the Supply node appears as a categorized editor node with inline validation.
- [ ] `deploy-fork.ts` deploys registry + action and records addresses in `fork-latest.json`; ABI extracted to frontend; `StepType` re-seeded.
- [ ] Each new action contract is < 24 KB (EIP-170), compiled under the production profile.

## Blocked by

None — can start immediately.

## User stories addressed

- User story 5
- User story 6
- User story 7
- User story 8
- User story 14a (partial — FIXED / FROM_SLOT / MAX_AVAILABLE-as-full-balance only)
- User story 34
- User story 35
- User story 36
- User story 37
