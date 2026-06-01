# PEC-216-05: Node Configuration Side Panel

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

A right-side inspector panel (Figma-style) that opens when a node is selected, rendering a dynamic form generated from the step type's JSON Schema. This is where users configure each step's parameters — token addresses, amounts, thresholds, intervals, and context slot references — without writing code.

**Side panel component:**
- Opens when `selectedNodeId` changes in the Zustand store. Closes when selection is cleared.
- Header shows the step type name and category badge (Condition/Action).
- Body renders a dynamic form based on the step type's `paramSchema` (JSON Schema fetched from `GET /step-types/:id`).

**Dynamic form generation from JSON Schema:**
- Standard fields: text input for `address` type, number input for `uint256`/`uint32` type, checkbox for `bool` type.
- Custom widgets based on `x-ui-widget` hints from the schema:
  - `"token-selector"`: dropdown of known tokens (fetched from backend's accepted tokens or a static BSC token list). Shows symbol + truncated address. Selecting sets the address value.
  - `"context-slot"`: dropdown showing existing vault slots (fetched from `GET /vaults/:address/context-slots`) plus "Create new slot" option. Existing slots show `name (Slot N, created by <automation-label>)`. "Create new" prompts for a name. The form stores the slot **name** (string), not the index.
  - `"account-selector"`: address input pre-filled with the vault address. Editable but default is vault.
  - `"amount"`: number input with the vault's current balance for the selected token shown below as helper text (fetched from the existing portfolio API).
- `NO_SLOT` sentinel: context slot fields that support "use static value" (e.g., `minBalanceFromSlot`, `amountFromSlot`) show a toggle: "Use static value" vs "Read from context slot". When static, the slot field is hidden and the static value field is shown. When context, the slot dropdown is shown and the static field is hidden.

**Form interaction patterns:**
- All inputs use `className="nodrag"` to prevent node dragging when interacting.
- `defaultValue` + `onBlur` pattern to avoid focus loss from node data updates (per PRD research).
- Form values stored in node data via `updateNodeData(nodeId, { params: { ... } })` in the Zustand store.
- Heavy form content wrapped in a separate `React.memo()` inside the node component to prevent re-renders.

## Acceptance criteria

- [ ] Selecting a node opens the side panel; deselecting closes it
- [ ] Panel renders a form matching the selected step type's JSON Schema
- [ ] TokenBalanceCondition form shows: token selector, account selector (pre-filled with vault address), minBalance input, aboveOrEqual checkbox, minBalanceFromSlot toggle (static value vs context slot)
- [ ] IntervalCondition form shows: interval input (seconds), timeSlot context slot dropdown
- [ ] TimerCondition form shows: delta input (seconds), timeSlot context slot dropdown
- [ ] ERC20TransferAction form shows: token selector, recipient address, amount input (with balance helper), amountFromSlot toggle, amountToSlot toggle, feeRegistry address
- [ ] FeeDepositAction form shows: feeRegistry address, token selector, topUpAmount input
- [ ] Context slot dropdown shows existing vault slots fetched from the API + "Create new slot" option
- [ ] Creating a new slot prompts for a name and adds it to the dropdown
- [ ] Token selector shows token symbols and addresses
- [ ] Amount fields show current vault balance as helper text
- [ ] Form values persist in node data (survive deselect/reselect)
- [ ] Typing in form fields does not drag the node
- [ ] Typing in form fields does not lose focus

## Blocked by

- PEC-216-03 (needs editor canvas with node selection)
- PEC-216-04 (needs context slot dropdown data from `GET /vaults/:address/context-slots`)

## User stories addressed

- User story 9: configure step parameters in a side panel
- User story 10: parameter forms generated dynamically from step type schema
- User story 28: token selectors with symbol and address
- User story 29: vault's current token balances in the side panel
