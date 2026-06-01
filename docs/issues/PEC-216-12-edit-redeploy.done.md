# PEC-216-12: Edit + Re-Deploy Existing Automation

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

The edit flow for existing deployed automations: load saved editor state, modify the graph, and re-deploy with context-aware handling. Includes the draft reconciliation logic for browser-close recovery.

**Edit flow — Frontend:**
- Clicking an automation in the list navigates to `/vault/:address/automation/:id/edit`.
- Editor loads `editorState` from `GET /vaults/:address/automations/:id` and restores nodes, edges, viewport.
- User modifies the graph (add/remove nodes, change params, etc.).
- User clicks "Deploy" → calls `POST /vaults/:address/automations/:id/encode-update`.

**Edit flow — Backend encode-update:**
- `POST /vaults/:address/automations/:id/encode-update` — protected by VaultOwnerGuard.
- Request body: `{ contextOverrides?: Record<number, string> }` — optional hex values for slots the user wants to override.
- Same encoding logic as PEC-216-07's encode endpoint, but:
  - Returns calldata for `updateAutomationSteps(onChainId, newSteps)` instead of `createAutomation`.
  - `requiresContextTx` is true only if: (a) new slots are needed, OR (b) `contextOverrides` is non-empty.
  - If no new slots and no overrides → single TX, no `setContext` needed.
- Response shape matches PEC-216-07's encode response.

**Deploy dialog for edits:**
- Same deploy confirmation dialog as PEC-216-07, but:
  - Section 2 shows existing slots used by this automation with their **current on-chain values** (editable).
  - User can override values (e.g., reset IntervalCondition's next trigger time).
  - If user changes values, the dialog re-calls encode-update with `contextOverrides`.
  - TX stepper shows `updateAutomationSteps` instead of `createAutomation`.

**Draft reconciliation:**
- When loading a draft (`isDraft = true`, `onChainId = null`), the backend checks if it was already deployed but the confirmation was lost (browser-close scenario).
- Logic in `AutomationService`:
  1. Read `automationCount()` from the vault on-chain.
  2. For each on-chain automation ID not present in any DB record for this vault, read `getAutomation(id)`.
  3. Compare step count and step 0's target address against the draft's expected values (derived from editorState).
  4. If a match is found: set `onChainId` on the draft, mark `isDraft = false`.
  5. Return the reconciled automation to the frontend.
- Reconciliation runs on `GET /vaults/:address/automations/:id` when the automation is a draft.

## Acceptance criteria

- [ ] Clicking an automation in the list opens the editor with the saved graph
- [ ] Nodes, edges, and viewport are restored from `editorState`
- [ ] User can modify the graph and click Deploy
- [ ] `POST .../encode-update` returns calldata for `updateAutomationSteps`
- [ ] Encode-update correctly handles: no new slots (single TX), new slots (2 TXs), value overrides (2 TXs)
- [ ] Deploy dialog shows current on-chain values for existing slots
- [ ] User can override existing slot values in the dialog
- [ ] Overrides are included in the `setContext` calldata
- [ ] TX flow works: setContext (if needed) → updateAutomationSteps → confirmation
- [ ] After re-deploy, the on-chain automation has the new steps
- [ ] Draft reconciliation: if a draft's automation was already created on-chain, auto-links `onChainId` and marks deployed
- [ ] Draft reconciliation: no false positives (doesn't link to wrong automation)
- [ ] Draft reconciliation: works for fresh drafts (no match found, stays as draft)
- [ ] Unit tests for encode-update logic (with and without context changes)
- [ ] Unit test for draft reconciliation (match found vs no match)

## Blocked by

- PEC-216-07 (needs encoding service and deploy flow infrastructure)
- PEC-216-10 (needs automation list to navigate from)

## User stories addressed

- User story 20: edit existing automation by loading saved editor state
- User story 32: override current on-chain values when re-deploying
