# PEC-216-10: Automation List + Trigger Status

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

A new section on the vault detail page showing all automations for the vault, with live trigger status and active state read from on-chain. This is the management hub for automations — users see their automations at a glance and navigate to the editor.

**Backend — TriggerStatusService** (`src/automation/trigger-status.service.ts`):
- Reads vault on-chain state: `automationCount()`, `getAutomation(id)` for each, `getContext()`, and `isTriggerMet(id)`.
- Interprets trigger status based on step 0's target address (matched against the step type registry):
  - **IntervalCondition**: decode `ctx[timeSlot]` as `uint256` timestamp. If `block.timestamp >= nextTime`: "Ready to fire". Else: "Fires in X" (human-readable countdown). If slot is 0 or empty: "Not initialized".
  - **TimerCondition**: decode `ctx[timeSlot]`. If 0: "Stopped". Else compute `startTime + delta` and show countdown or "Ready to fire".
  - **TokenBalanceCondition**: call `isTriggerMet(automationId)` via staticcall. Show "Condition met" or "Condition not met".
  - **Unknown step 0 (owner-only with action at step 0)**: show "Owner-only (no trigger)".
- Results cached in-memory with 30-second TTL per vault.
- Returns `active` status per automation (from `getAutomation(id).active`).

**Backend — Endpoint:**
- `GET /vaults/:address/automations/trigger-statuses` — protected by VaultOwnerGuard.
- Response shape as defined in PRD's API Contract: `statuses[]` with `automationId`, `onChainId`, `active`, `triggerStatus { type, met, description, nextFireAt? }`.
- Only returns statuses for deployed automations (not drafts).

**Backend — List endpoint:**
- `GET /vaults/:address/automations` — returns DB automations (label, description, stepCount, isDraft, ownerOnly, onChainId) merged with trigger status data from TriggerStatusService.

**Frontend — Automation list section on vault detail page:**
- New section on `/vault/:address` below the existing portfolio/history sections.
- Table or card list showing for each automation:
  - Label (or "Untitled" if none)
  - Step count
  - Owner-only badge (if applicable)
  - Active/Inactive badge (green/gray, from on-chain)
  - Trigger status text (e.g., "Fires in 2h 15m", "Condition met", "Inactive")
  - Draft badge (if `isDraft = true`)
- "Create Automation" button → navigates to `/vault/:address/automation/new/edit`.
- Clicking an automation row → navigates to `/vault/:address/automation/:id/edit`.
- Trigger status auto-refreshes every 30-60 seconds (polling via TanStack Query `refetchInterval`).

## Acceptance criteria

- [ ] Vault detail page shows an "Automations" section
- [ ] Section lists all automations for the vault (drafts and deployed)
- [ ] Each automation shows: label, step count, active badge, owner-only badge, trigger status
- [ ] Drafts show a "Draft" badge and no trigger status
- [ ] IntervalCondition trigger shows countdown ("Fires in X") or "Ready to fire"
- [ ] TimerCondition trigger shows countdown or "Stopped"
- [ ] TokenBalanceCondition trigger shows "Condition met" or "Condition not met"
- [ ] Owner-only automations with action at step 0 show "Owner-only (no trigger)"
- [ ] Active/inactive badge reflects on-chain state (not DB)
- [ ] "Create Automation" button navigates to editor for new automation
- [ ] Clicking an automation navigates to its editor
- [ ] Trigger status auto-refreshes (visible countdown updates)
- [ ] TriggerStatusService caches results with 30s TTL
- [ ] `GET /vaults/:address/automations` returns merged DB + on-chain data
- [ ] `GET /vaults/:address/automations/trigger-statuses` returns correct statuses
- [ ] Unit tests for TriggerStatusService cover all 3 condition types + owner-only

## Blocked by

- PEC-216-01 (needs Automation model and StepType registry for address matching)

## User stories addressed

- User story 1: see a list of all automations on my vault
- User story 2: see trigger status (condition met, when it will fire)
- User story 15: give automation a label (displayed in list)
