# PEC-216-02: Graph Logic Library

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

A set of pure TypeScript functions with no React or React Flow dependency that handle graph-to-steps conversion, validation, auto-layout, and cycle detection. These are the algorithmic core of the editor, fully testable without browser APIs or mocks.

All functions live in `packages/frontend/src/features/automation-editor/lib/`.

**`graphToSteps(nodes, edges, startNodeId)`:**
- BFS from the start node to assign step indices.
- Builds adjacency from edges using `sourceHandle` ('true', 'false', 'out') to determine `nextOnTrue`/`nextOnFalse`.
- Action nodes always get `nextOnFalse = DONE`.
- Context slot fields in node data contain slot **names** (strings), not indices — the backend resolves these. The frontend conversion passes them through as-is.
- Returns a `Step[]`-shaped array (minus ABI encoding — that's the backend's job).

**`validateGraph(nodes, edges)`:**
- Single start node (no incoming edges). Error if 0 or >1.
- Public automation: step 0 must be CONDITION.
- No cycles (DFS with gray/black coloring).
- Condition nodes must have at least one outgoing edge.
- Action nodes must have at most one outgoing edge.
- No orphan/unreachable nodes (BFS from start).
- Max 256 steps.
- Returns `ValidationError[]` with optional `nodeId` for per-node errors.

**`autoLayout(nodes, edges, direction)`:**
- Wraps `@dagrejs/dagre` v3.
- Top-down (`TB`) layout by default.
- Uses `node.measured?.width/height` with fallback defaults.
- Converts dagre center coordinates to React Flow top-left origin (`x - width/2`, `y - height/2`).
- Returns layouted nodes + unchanged edges.

**`isValidConnection(connection, nodes, edges)`:**
- O(V+E) cycle detection: DFS from potential target back to source.
- Returns `false` if connecting would create a cycle.
- Also rejects self-connections.

## Acceptance criteria

- [ ] `graphToSteps` correctly converts: single condition, single action, linear chain (condition → action), branching condition (true → action, false → DONE), diamond (condition → two paths → merge), max 256 nodes
- [ ] `graphToSteps` places the start node at index 0
- [ ] `graphToSteps` sets `nextOnFalse = DONE` for all action nodes
- [ ] `validateGraph` detects: cycles, multiple start nodes, no start node, public automation with action at step 0, orphan nodes, condition with no outgoing edges, action with >1 outgoing edge, >256 nodes
- [ ] `validateGraph` returns empty array for valid graphs
- [ ] `autoLayout` produces valid positions (no NaN, no overlapping nodes at same coordinates)
- [ ] `autoLayout` correctly converts dagre center coordinates to top-left origin
- [ ] `isValidConnection` rejects cycle-creating connections
- [ ] `isValidConnection` rejects self-connections
- [ ] `isValidConnection` allows valid connections
- [ ] All functions are pure (no side effects, no React imports, no DOM access)
- [ ] All tests pass with `pnpm frontend:test`

## Blocked by

None — can start immediately. (Parallel with PEC-216-01.)

## User stories addressed

- User story 6: prevent cycles in the graph
- User story 13: auto-layout (the library function; UI button is in PEC-216-09)
