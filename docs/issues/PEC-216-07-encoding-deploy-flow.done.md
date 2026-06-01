# PEC-216-07: Encoding Service + Deploy Flow

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

The end-to-end tracer bullet: a user can build a graph in the editor and deploy it as a live on-chain automation. This slice connects the frontend editor to the backend encoding service, adds the deploy confirmation dialog, and handles the multi-TX submission flow.

**Backend — EncodingService** (`src/automation/encoding.service.ts`):
- Takes the editor graph (nodes + edges from editorState), the step type registry, and the vault's slot registry.
- Runs server-side validation (same rules as frontend `validateGraph`).
- Resolves context slot names → `uint32` indices via `ContextService.allocateSlots()`.
- For each node: looks up the step type by the node's `stepTypeId`, encodes the node's params into `bytes data` using `ethers.AbiCoder.encode()` with the step type's `abiFragment`.
- Converts the graph to a flat `Step[]` array (BFS from start node, same algorithm as frontend `graphToSteps` but with real encoded data and resolved slot indices).
- Builds full function calldata: `vault.interface.encodeFunctionData('createAutomation', [steps])` or `'createOwnerAutomation'` based on `ownerOnly`.
- If new slots are needed or user overrides values: builds `setContext` calldata via `ContextService.buildExpandedContext()`.

**Backend — Encode endpoint:**
- `POST /vaults/:address/automations/:id/encode` — protected by VaultOwnerGuard.
- Response shape as defined in the PRD's "API Contract Details" section: `automationCalldata`, `contextCalldata?`, `functionName`, `steps`, `ownerOnly`, `stepCount`, `requiresContextTx`, `contextChanges[]`.
- `contextChanges` includes: `slotIndex`, `slotName`, `isNew`, `currentValue?`, `newValue`, `usedByActiveAutomations[]`.

**Frontend — Deploy confirmation dialog:**
- Modal triggered by "Deploy" button in toolbar (disabled when validation errors exist).
- **Section 1 — Automation summary**: step count, owner-only badge, automation label.
- **Section 2 — Context changes**: lists new slots (with initial value inputs, default `0x`), existing slots used by this automation (current on-chain value displayed, editable). Warning icon + text on slots where `usedByActiveAutomations` is non-empty. If no context changes, this section shows "No context changes needed."
- **Section 3 — Transaction steps**: shows "This requires N transaction(s)". Stepper UI tracking progress: idle → submitting setContext → confirmed → submitting createAutomation → confirmed → done.
- User can edit initial values for new slots and override existing slot values before confirming.
- "Confirm & Deploy" button starts the TX flow. If user-edited values differ from defaults, re-calls encode with `contextOverrides`.

**Frontend — TX submission flow:**
1. If `requiresContextTx`: submit `setContext` TX via `writeContractAsync`, wait for receipt.
2. Submit `createAutomation`/`createOwnerAutomation` TX via `writeContractAsync`, wait for receipt.
3. Parse `AutomationCreated` event from receipt to get `onChainId`.
4. Call `PATCH /vaults/:address/automations/:id` with `{ onChainId, txHash }` to mark deployed.
5. Navigate to automation list or show success state.

**Backend — Deployment confirmation:**
- `PATCH /vaults/:address/automations/:id` accepts `{ onChainId, txHash }` — sets `isDraft = false`, stores `onChainId`.
- Updates vault `contextSlots` JSONB with any newly allocated slots.

**Backend — Draft creation:**
- `POST /vaults/:address/automations` — creates a draft automation record (`isDraft = true`, `onChainId = null`). Used by the editor on first open of a new automation. Returns the automation `id` for subsequent auto-save and encode calls.

## Acceptance criteria

- [ ] `POST /vaults/:address/automations` creates a draft and returns `{ id }`
- [ ] `POST /vaults/:address/automations/:id/encode` returns valid calldata for a simple condition → action graph
- [ ] Encoding correctly resolves context slot names to indices
- [ ] Encoding produces correct ABI-encoded bytes for all 5 step types (verified against known expected output)
- [ ] Server-side validation rejects invalid graphs (returns 400 with errors)
- [ ] `requiresContextTx` is `true` when new slots are needed, `false` otherwise
- [ ] `contextChanges` correctly identifies new vs existing slots and lists active automations using each slot
- [ ] Deploy dialog shows automation summary, context changes, and TX count
- [ ] User can edit initial values for new slots in the dialog
- [ ] Warning icon appears on slots used by active automations
- [ ] "Confirm & Deploy" is disabled while validation errors exist
- [ ] TX 1 (setContext) submits and confirms before TX 2 starts (when required)
- [ ] TX 2 (createAutomation or createOwnerAutomation) submits and confirms
- [ ] `AutomationCreated` event is parsed from receipt to get `onChainId`
- [ ] `PATCH` with `onChainId` marks the automation as deployed (`isDraft = false`)
- [ ] Vault `contextSlots` JSONB is updated with newly allocated slots after deployment
- [ ] EncodingService unit tests cover all 5 step types with known input/output pairs
- [ ] Full flow works on local BSC fork: create vault → open editor → build graph → deploy → automation exists on-chain

## Blocked by

- PEC-216-02 (graph conversion algorithm)
- PEC-216-04 (context slot resolution + context expansion)
- PEC-216-05 (configured node params to encode)
- PEC-216-06 (validation gate on deploy button)

## User stories addressed

- User story 18: deploy automation to the blockchain
- User story 19: deploy confirmation dialog with summary, context changes, TX steps
- User story 23: auto-classify as owner-only when step 0 is action
- User story 24: auto-classify as public when step 0 is condition
- User story 32: set initial values for new context slots in deploy dialog
