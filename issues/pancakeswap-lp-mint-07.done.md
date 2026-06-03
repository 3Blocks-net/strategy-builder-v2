# PancakeSwap V3 LP Mint (+ NFT custody, tick-range widget)

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

A **"PancakeSwap LP Mint"** node that opens a new concentrated-liquidity position from the vault. Reuses the PCS registry + token list from #6 and adds the `NonfungiblePositionManager` interface, vault NFT custody, and the `tick-range` widget.

End-to-end behavior: investor picks the pair + fee tier and defines the position's price range either as explicit **min/max price** or as a **preset width** (e.g. ±10%) around the current price; on trigger the vault calls `NPM.mint(MintParams)` with `amount0Min = amount1Min = 0` and `deadline = block.timestamp`, and the new position **NFT token-id is written to a required context slot**. Token ordering and approvals are handled automatically.

Key behaviors (PRD _Tick range for Mint_, _The nine new action contracts_, _NFT custody_):
- **Two range modes** via on-chain `rangeMode` flag carried in raw params. `rangeMode = 0` (explicit): frontend computes `tickLower`/`tickUpper` off-chain from absolute prices, rounded **outward** to tick spacing; action uses as-is. `rangeMode = 1` (preset): frontend passes only a `tickDelta` constant; the **action** reads `pool.slot0().tick` (via `Factory.getPool`) and centers `tickLower/Upper = tick ∓ tickDelta`, rounded outward. **No `slot0` read in the frontend.**
- **Token ordering**: action sorts `token0 < token1` and matching amounts; for explicit ranges the frontend inverts price + swaps lower/upper to match the sort before computing ticks.
- **Approvals**: `forceApprove` both tokens, **reset to 0** after.
- **NFT custody**: implement `onERC721Received` **proactively and unconditionally** in `StrategyBuilderVault` (magic-selector return) so mint succeeds even if NPM switches to `_safeMint`.
- **Frontend `tick-range` widget**: `rangeMode` toggle exposing explicit min/max price inputs **or** a preset-width selector (±5/±10/±20%). `encode-boundary` carries `rangeMode` + computed `tickLower`/`tickUpper` **or** `tickDelta` into raw params (not stripped); strips only friendly display fields.
- **Backend**: `StepType` seed for the mint action; raw-mode guard rejects `tickLower >= tickUpper` (explicit mode).

## Acceptance criteria

- [ ] `StrategyBuilderVault.onERC721Received` returns the magic selector; a fork test asserts mint succeeds and the **vault owns the NFT** (holds even were NPM to use `_safeMint`).
- [ ] Forked-mainnet test (explicit range): ticks bracket the configured prices, rounded outward; position created; **token-id written to the expected context slot**.
- [ ] Forked-mainnet test (preset width): **on-chain `slot0` centering** — ticks bracket the current tick rounded outward; token-id written to slot.
- [ ] After Mint, allowances to NPM are back to **0** (approval hygiene assertion).
- [ ] Backend raw-mode guard rejects `tickLower >= tickUpper` (HTTP 400); encoding test covers `rangeMode`/`tickDelta` carried (not stripped).
- [ ] Frontend `tick-range` widget renders both modes and emits correct raw params (explicit ticks vs `tickDelta`); mapper/widget tests pass.
- [ ] Mint action < 24 KB (production profile); deployed + re-seeded.

## Blocked by

- Blocked by #6 (PCS spine: `PancakeSwapV3Registry`, `Factory` interface, pancakeswap token list, deploy/seed)

## User stories addressed

- User story 26
- User story 27
- User story 28
- User story 29
