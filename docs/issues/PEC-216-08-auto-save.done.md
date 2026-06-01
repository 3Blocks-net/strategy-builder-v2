# PEC-216-08: Auto-Save

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

Debounced auto-save that persists the editor's graph state to the backend, so users can close the browser and resume editing later. No manual save button — the system saves automatically.

**Auto-save logic:**
- After any change to nodes, edges, label, or description, start a 5-second debounce timer.
- On timer expiry, call `PATCH /vaults/:address/automations/:id` with the current `editorState` (nodes, edges, viewport from `rfInstance.toObject()`), `label`, and `description`.
- Track a `isDirty` flag in the Zustand store: `true` after any change, `false` after successful save.
- Track a `saveStatus` in the store: `'idle' | 'saving' | 'saved' | 'error'`.

**UI indicator:**
- Subtle text in the toolbar: "Saving..." (during PATCH), "Saved" (on success, fades after 2s), "Save failed" (on error, persists until next attempt).
- No save button in the toolbar.

**Save on navigation:**
- When the user navigates away from the editor (React Router `beforeunload` or route change), trigger an immediate save if dirty.
- `window.onbeforeunload` prompt if dirty to warn about unsaved changes.

**Backend endpoint:**
- `PATCH /vaults/:address/automations/:id` — already created in PEC-216-07 for deployment confirmation. This slice adds support for partial updates: if `editorState` is in the body, update it. If `label`/`description` are in the body, update them. If `onChainId`/`txHash` are in the body, handle deployment confirmation. All fields are optional.

**Editor load:**
- On editor open for an existing automation (`/vault/:address/automation/:id/edit`), fetch `GET /vaults/:address/automations/:id` and restore the editor state: `setNodes(editorState.nodes)`, `setEdges(editorState.edges)`, `setViewport(editorState.viewport)`.

## Acceptance criteria

- [ ] Changing a node/edge/label triggers auto-save after 5 seconds of inactivity
- [ ] Rapid changes reset the debounce timer (only one save per quiet period)
- [ ] "Saving..." appears during the PATCH request
- [ ] "Saved" appears on success and fades after 2 seconds
- [ ] "Save failed" appears on error and persists
- [ ] No save button exists in the toolbar
- [ ] Navigating away triggers an immediate save if dirty
- [ ] Browser close/refresh shows a "you have unsaved changes" warning if dirty
- [ ] Opening an existing automation restores nodes, edges, and viewport from DB
- [ ] `PATCH` endpoint accepts partial updates (editorState only, label only, etc.)
- [ ] Auto-save does not interfere with the deployment confirmation PATCH (same endpoint, different fields)

## Blocked by

- PEC-216-03 (needs editor canvas and Zustand store)

## User stories addressed

- User story 27: auto-save draft graph to the backend
