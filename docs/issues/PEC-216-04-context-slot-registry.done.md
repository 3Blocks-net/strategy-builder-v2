# PEC-216-04: Context Slot Registry

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

The vault-level context slot registry: a backend service that manages named context slots per vault, reads current on-chain context values, and validates DB state against on-chain state. This is the foundation for context-aware step configuration and the deploy flow's context management.

**ContextService** (`src/automation/context.service.ts`):
- **Slot registry management**: CRUD operations on the `Vault.contextSlots` JSONB field. Assign next available index for new slot names. Track which automation created each slot (`createdByAutomationId`, informational only).
- **On-chain context reads**: read the vault's `getContext()` via ethers `Contract.staticCall` to get the current `bytes[]` array. Used for deploy dialog (showing current values) and validation (comparing DB vs on-chain length).
- **Slot allocation**: given a list of slot name references from a graph, resolve each to an existing index or allocate a new one. Return the name→index mapping.
- **Context expansion**: given current on-chain context + new slots with initial values + optional overrides for existing slots, build the expanded `bytes[]` for a `setContext()` call. Preserve all existing values that aren't explicitly overridden.
- **Validation**: compare `contextSlots` JSONB entry count against on-chain `getContext().length`. Return a warning if they differ (indicates out-of-band changes).

**API endpoint:**
- `GET /vaults/:address/context-slots` — returns the vault's slot registry merged with current on-chain values. Protected by `VaultOwnerGuard`.
  ```json
  {
    "slots": {
      "0": { "name": "next-trigger-time", "createdByAutomationId": "abc", "currentOnChainValue": "0x..." },
      "1": { "name": "transfer-amount", "createdByAutomationId": "abc", "currentOnChainValue": "0x" }
    },
    "contextLength": 2,
    "dbSlotCount": 2,
    "syncWarning": false
  }
  ```

**Testing:**
- Unit tests for slot allocation logic (next available index, idempotent re-allocation of existing names).
- Unit tests for context expansion (preserving existing values, appending new, applying overrides).
- Unit test for DB vs on-chain sync validation.
- Mock the ethers provider for on-chain reads.

## Acceptance criteria

- [ ] `ContextService.allocateSlots(vaultId, slotNames[])` returns a `Record<string, number>` mapping names to indices, allocating new indices for unknown names
- [ ] Allocating the same name twice returns the same index (idempotent)
- [ ] `ContextService.buildExpandedContext(currentCtx, newSlots, overrides)` preserves all existing values, appends new slots with specified initial values (default `0x`), applies overrides for existing slots
- [ ] `GET /vaults/:address/context-slots` returns slot registry with current on-chain values
- [ ] `GET /vaults/:address/context-slots` returns `syncWarning: true` when DB slot count differs from on-chain context length
- [ ] Endpoint is protected by VaultOwnerGuard
- [ ] Unit tests cover: fresh vault (no slots), adding first slot, adding to existing slots, re-allocating existing name, context expansion with no new slots, context expansion with new slots, context expansion with overrides, sync warning detection

## Blocked by

- PEC-216-01 (needs Vault.contextSlots field and Automation model)

## User stories addressed

- User story 16: name context slots with friendly labels at the vault level
- User story 17: pick from existing context slots or create new ones
