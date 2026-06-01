# PEC-216-03: Minimal Editor Canvas

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

The first visual piece of the automation editor: a React Flow canvas where users can add condition and action nodes from a toolbar dropdown, connect them with edges, and see the graph take shape. This is the editor shell that all subsequent slices build on.

**Route:**
- `/vault/:address/automation/new/edit` — new automation (empty canvas)
- `/vault/:address/automation/:id/edit` — edit existing (loads editorState from DB, but loading logic is placeholder in this slice)
- Protected route (same as other vault pages).

**React Flow canvas:**
- `ConditionNode` component: blue border/header, source handles for "True" (green) and "False" (red), target handle at top. Displays step type name. Wrapped in `React.memo()`.
- `ActionNode` component: amber border/header, single source handle "Next" (gray), target handle at top. Displays step type name. Wrapped in `React.memo()`.
- `nodeTypes` and `edgeTypes` defined at module scope (stable references).
- All ReactFlow callback props wrapped in `useCallback`, all object props in `useMemo`.
- Edge labels: "True" (green), "False" (red), "Next" (gray) using custom edge label styling.
- Cycle prevention: `isValidConnection` prop using the function from PEC-216-02.

**Toolbar dropdown:**
- "Add Step" button opens a dropdown categorized into Conditions and Actions.
- Fetches available step types from `GET /step-types` on editor mount.
- Each entry shows name and short description.
- Clicking an entry adds a node at a default position on the canvas.

**Zustand store skeleton:**
- `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `onConnect`.
- `addNode(stepType, position)`, `removeSelected()`.
- `selectedNodeId` for future side panel integration.
- Metadata: `label`, `description` (editable fields, placeholder UI).

**CSS integration:**
- Import `@xyflow/react/dist/style.css` in `src/index.css` after `@import "tailwindcss"`.
- Install `@xyflow/react` ^12.11.0 and `@dagrejs/dagre` ^3.0.0 as frontend dependencies.

## Acceptance criteria

- [ ] Route `/vault/:address/automation/new/edit` renders a full-screen React Flow canvas
- [ ] Toolbar dropdown shows 5 step types fetched from the backend API, categorized by Conditions/Actions
- [ ] Clicking a step type in the dropdown adds a node to the canvas
- [ ] Condition nodes have True (green) and False (red) source handles + target handle
- [ ] Action nodes have Next (gray) source handle + target handle
- [ ] Nodes are color-coded: blue for conditions, amber for actions
- [ ] Dragging from a source handle to a target handle creates an edge with the correct label
- [ ] Creating a cycle-forming connection is rejected (edge not created)
- [ ] Selecting a node updates `selectedNodeId` in the store
- [ ] Deleting a selected node (Delete/Backspace key) removes it and its edges
- [ ] React Flow styles render correctly (nodes and edges visible, not broken by Tailwind v4)
- [ ] `@xyflow/react` and `@dagrejs/dagre` installed as frontend dependencies
- [ ] No console errors from zustand version conflicts

## Blocked by

- PEC-216-01 (needs `GET /step-types` endpoint for the toolbar dropdown)

## User stories addressed

- User story 3: create a new automation by opening a visual graph editor
- User story 4: add condition and action nodes from a toolbar dropdown
- User story 5: connect nodes with edges
- User story 11: browse available step types in a categorized dropdown
- User story 12: see description of step types before adding
- User story 30: edge labels (True/False/Next)
- User story 31: nodes color-coded by type
