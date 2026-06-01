# PEC-216-11: Activate/Deactivate + Delete

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

Automation lifecycle management actions on the list view: toggling active/inactive on-chain and deleting DB metadata for deactivated automations.

**Activate/Deactivate:**
- Toggle button on each automation in the list (only for deployed automations, not drafts).
- Clicking the toggle:
  1. Frontend calls `POST /vaults/:address/automations/:id/encode-toggle` with `{ active: !currentActive }`.
  2. Backend returns calldata for `vault.setAutomationActive(onChainId, bool)`.
  3. Frontend submits TX via `writeContractAsync`, waits for confirmation.
  4. On success, the trigger status auto-refresh picks up the new on-chain state.
- Optimistic UI: immediately flip the badge to the target state, revert on TX failure.

**Backend — Encode toggle endpoint:**
- `POST /vaults/:address/automations/:id/encode-toggle` — protected by VaultOwnerGuard.
- Request body: `{ active: boolean }`.
- Response: `{ calldata: string, functionName: "setAutomationActive" }`.
- Loads the automation from DB to get `onChainId`, encodes `vault.interface.encodeFunctionData('setAutomationActive', [onChainId, active])`.

**Delete:**
- Delete button on each automation in the list.
- Disabled (grayed out with tooltip "Deactivate before deleting") when the automation is active on-chain.
- Clicking when enabled shows a confirmation dialog: "This will remove the automation from your list. The on-chain automation data will remain until overwritten. Continue?"
- On confirm: `DELETE /vaults/:address/automations/:id`.

**Backend — Delete endpoint:**
- `DELETE /vaults/:address/automations/:id` — protected by VaultOwnerGuard.
- Before deleting: check on-chain active status via TriggerStatusService. If active, return 409 Conflict with `"Automation must be deactivated on-chain before deletion"`.
- On success: delete the DB record. Do NOT modify the vault's `contextSlots` JSONB (slots may be shared by other automations).
- Drafts (no `onChainId`) can be deleted without the active check.

## Acceptance criteria

- [ ] Toggle button appears on deployed automations in the list
- [ ] Toggle button does not appear on drafts
- [ ] Clicking toggle calls encode-toggle endpoint and submits TX
- [ ] Active badge updates after TX confirms
- [ ] Optimistic UI: badge flips immediately, reverts on failure
- [ ] Delete button is disabled for active automations
- [ ] Delete button tooltip explains "Deactivate before deleting" when disabled
- [ ] Delete button is enabled for inactive and draft automations
- [ ] Delete confirmation dialog shown before deletion
- [ ] `DELETE` endpoint returns 409 if automation is active on-chain
- [ ] `DELETE` endpoint succeeds for inactive automations and drafts
- [ ] Deleted automation disappears from the list
- [ ] Vault `contextSlots` is NOT modified on delete
- [ ] Unit tests for encode-toggle calldata generation
- [ ] Unit test for delete rejection when active

## Blocked by

- PEC-216-07 (needs deployed automations to toggle/delete)
- PEC-216-10 (needs automation list UI to place the buttons)

## User stories addressed

- User story 21: activate or deactivate from the list view
- User story 22: delete automation's DB metadata after deactivating
