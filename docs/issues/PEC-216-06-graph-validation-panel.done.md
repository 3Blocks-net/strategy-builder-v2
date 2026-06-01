# PEC-216-06: Graph Validation Panel

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

Real-time graph validation integrated into the editor, with a dedicated error panel and visual highlighting of invalid nodes. Validation runs continuously as the user builds the graph, providing immediate feedback on structural problems.

**Real-time validation:**
- Call `validateGraph(nodes, edges)` from PEC-216-02 on every `onNodesChange` / `onEdgesChange`, debounced at 300ms.
- Store `validationErrors: ValidationError[]` in the Zustand store.
- Infer `ownerOnly` from the graph: if the start node (no incoming edges) is an ACTION, set `ownerOnly = true`. Pass this to `validateGraph` so it skips the "public automation must start with condition" rule for owner-only automations.

**Validation panel:**
- Dedicated panel (bottom or collapsible side section) showing the list of validation errors.
- Each error shows the error message and, if `nodeId` is present, a clickable link that selects and centers the offending node on the canvas (using `fitView` or `setCenter` from `useReactFlow()`).
- Error count badge visible in the toolbar (e.g., "3 errors").
- Panel collapses when there are no errors.

**Visual highlighting:**
- Nodes referenced in validation errors get a red border via conditional CSS class (`.validation-error` or similar).
- Red border clears when the error is resolved (next validation cycle).

**Deploy gate:**
- The Deploy button (added in PEC-216-07) should be disabled when `validationErrors.length > 0`. This slice prepares the state; the actual button is wired in PEC-216-07.

## Acceptance criteria

- [ ] Validation runs automatically on node/edge changes (debounced 300ms)
- [ ] Validation panel lists all current errors
- [ ] Clicking an error with a `nodeId` selects and centers that node on canvas
- [ ] Error count badge shows in the toolbar area
- [ ] Nodes with errors have a visible red border
- [ ] Red border clears when the error is resolved
- [ ] Empty graph shows "Automation must have at least one step" error
- [ ] Graph with cycle shows cycle error
- [ ] Graph with multiple start nodes shows error
- [ ] Public automation with action at step 0 shows error
- [ ] Owner-only automation (action at step 0) does NOT show the "must start with condition" error
- [ ] Orphan nodes show "unreachable from start" error
- [ ] Condition node with no outgoing edges shows error
- [ ] Action node with >1 outgoing edge shows error
- [ ] `validationErrors` array is available in Zustand store for deploy gating

## Blocked by

- PEC-216-02 (needs `validateGraph` function)
- PEC-216-03 (needs editor canvas to integrate with)

## User stories addressed

- User story 7: validate graph in real-time
- User story 8: validation errors highlighted on nodes and listed in a panel
