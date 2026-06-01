# PEC-216-09: Editor Interactions — Undo/Redo, Copy/Paste, Auto-Layout

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

Three editor interaction features that make the graph editor feel like a real design tool: undo/redo with keyboard shortcuts, copy/paste with ID remapping, and one-click auto-layout.

**Undo/Redo:**
- Snapshot-based: store `{ nodes, edges }` snapshots in `past[]` and `future[]` stacks in the Zustand store.
- Take a snapshot on semantic actions: node add, node remove, edge add, edge remove, `onNodeDragStop` (NOT during drag), node data update (param change in side panel).
- History depth capped at 50 snapshots.
- `undo()`: pop from `past`, push current state to `future`, restore the popped state.
- `redo()`: pop from `future`, push current state to `past`, restore the popped state.
- New actions clear the `future` stack.
- Toolbar buttons: Undo (disabled when `past` empty), Redo (disabled when `future` empty).
- Keyboard: Ctrl+Z (undo), Ctrl+Shift+Z (redo).

**Copy/Paste:**
- Copy: store selected nodes + edges between them in a clipboard (Zustand store field, not system clipboard).
- Paste: create new nodes with remapped IDs (`${id}-copy-${Date.now()}`), offset positions by (50, 50), remap edge source/target references. Deselect all existing, select pasted nodes.
- Keyboard: Ctrl+C (copy), Ctrl+V (paste).
- Pasting should take a snapshot for undo.

**Auto-Layout:**
- Toolbar button: "Auto-Layout" (or layout icon).
- Calls `autoLayout(nodes, edges, 'TB')` from PEC-216-02.
- Takes a snapshot before applying (so layout is undoable).
- After layout, calls `fitView()` to center the canvas on the result.

**Keyboard shortcut registration:**
- Single `useEffect` with `keydown` listener on `document`.
- Guard against firing when an input/textarea/select is focused (check `e.target.tagName`).
- Mac support: `metaKey` as alternative to `ctrlKey`.

## Acceptance criteria

- [ ] Ctrl+Z undoes the last action (node add, edge connect, node drag, param change)
- [ ] Ctrl+Shift+Z redoes an undone action
- [ ] Undo/redo buttons in toolbar reflect enabled/disabled state correctly
- [ ] History is capped at 50 snapshots (oldest dropped when exceeded)
- [ ] New actions after undo clear the redo stack
- [ ] Ctrl+C copies selected nodes + edges between them
- [ ] Ctrl+V pastes with new IDs, offset positions, and correct edge references
- [ ] Pasted nodes are selected; previously selected nodes are deselected
- [ ] Copy/paste of a single node (no edges) works
- [ ] Copy/paste of a subgraph (nodes + edges) works
- [ ] Paste is undoable
- [ ] Auto-Layout button repositions all nodes in a top-down DAG layout
- [ ] Auto-Layout is undoable
- [ ] Auto-Layout calls fitView after repositioning
- [ ] Keyboard shortcuts don't fire when typing in a form input
- [ ] Cmd+Z / Cmd+Shift+Z / Cmd+C / Cmd+V work on Mac

## Blocked by

- PEC-216-03 (needs editor canvas and Zustand store)

## User stories addressed

- User story 13: auto-layout with a single button click
- User story 14: undo and redo editing actions
- User story 26: keyboard shortcuts for undo/redo, delete, copy/paste
