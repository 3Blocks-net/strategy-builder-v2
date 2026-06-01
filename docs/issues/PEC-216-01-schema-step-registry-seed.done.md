# PEC-216-01: Schema Migration + Step Registry Seed

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

The database foundation for the automation editor. This slice delivers the Prisma schema changes and a working step type registry API seeded with the 5 official contracts.

**Schema migration:**
- Modify the existing `Automation` model: drop `steps`, `context`, `active` fields. Add `editorState` (JSONB), `stepCount` (int), `isDraft` (boolean, default true). Make `onChainId` nullable (null for drafts). Keep `label`, `description`, `ownerOnly`, `vaultId`, timestamps.
- Add `contextSlots` JSONB field to the `Vault` model (default `{}`). Structure: `Record<number, { name: string, createdByAutomationId: string }>`.
- Create new `StepType` model with fields as specified in the PRD's "Database Schema Changes" section. Unique constraint on `(contractAddress, selector)`.
- Create the `StepCategory` enum (CONDITION, ACTION).

**Step Registry Module:**
- `StepRegistryController` with two read-only endpoints: `GET /step-types` (list all) and `GET /step-types/:id` (single with full JSON Schema).
- `StepRegistryService` wrapping Prisma queries.
- No auth required on these endpoints (`@Public()` decorator).

**Seed script:**
- `prisma db seed` script that upserts the 5 official step types: TokenBalanceCondition, IntervalCondition, TimerCondition, ERC20TransferAction, FeeDepositAction.
- Each seed entry includes: name, description, category, contract address (from `deployments/fork-latest.json` or env vars), selector (`bytes4`), `afterExecutionSelector` (for IntervalCondition and TimerCondition), ABI fragment for the Params struct, and JSON Schema for UI form generation.
- Seed must be idempotent (upsert on unique constraint).

**JSON Schema design for the 5 types:**
- Each schema describes the Params struct fields with Solidity types mapped to JSON Schema types.
- UI hints encoded as custom `x-ui` properties: `x-ui-widget: "token-selector"` for address fields that represent tokens, `x-ui-widget: "context-slot"` for uint32 fields that are slot references, `x-ui-widget: "account-selector"` for address fields pre-filled with the vault address, `x-ui-widget: "amount"` for uint256 fields that should show vault balances.
- `x-ui-slot-access: "read" | "write" | "read-write"` on context slot fields so the backend knows the slot's usage pattern.

## Acceptance criteria

- [ ] Prisma migration runs cleanly on a fresh DB and on the existing dev DB
- [ ] `Automation` model has `editorState`, `stepCount`, `isDraft`, nullable `onChainId`; does NOT have `steps`, `context`, `active`
- [ ] `Vault` model has `contextSlots` JSONB field
- [ ] `StepType` model exists with all fields from the PRD
- [ ] `prisma db seed` creates 5 official step types (idempotent — running twice doesn't duplicate)
- [ ] `GET /step-types` returns all 5 types with name, description, category, contractAddress, selector
- [ ] `GET /step-types/:id` returns full JSON Schema in `paramSchema` field
- [ ] Each JSON Schema correctly describes the Params struct for its step type with appropriate `x-ui` hints
- [ ] Step registry endpoints are public (no auth required)
- [ ] Unit tests pass for StepRegistryService

## Blocked by

None — can start immediately.

## User stories addressed

- User story 25: register official step types in a backend registry
