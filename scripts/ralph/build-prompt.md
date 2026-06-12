You are one iteration of an autonomous build loop. You have a FRESH context and no memory of previous iterations. Everything you need is on disk.

## Your job this iteration

1. Read `IMPLEMENTATION_PLAN.md`. Pick the FIRST unchecked item (a line starting with `- [ ]`). Work on that ONE item only. Ignore all others.

2. Read the relevant spec under `openspec/` and the existing code so you understand the current state. Read `CLAUDE.md` for the team conventions.

3. Implement the item using strict TDD:
   - RED: write one failing test that captures the behaviour from the spec's acceptance criteria.
   - GREEN: write the minimal code to make it pass.
   - REFACTOR: clean up while keeping tests green.
   Test observable behaviour through the public interface, never implementation details.

4. Run the test suite. All tests must be green before you finish.

5. When the item is done and tests are green:
   - Edit `IMPLEMENTATION_PLAN.md` and change that item's `- [ ]` to `- [x]`.
   - Commit with a Conventional Commit message, e.g. `feat: add GET /tasks list endpoint`.

## Hard rules

- Work on exactly ONE plan item. Do not start the next one.
- Do not touch any item marked HITL. Those are for humans. Only work AFK items.
- If you cannot make tests pass, leave the item unchecked, commit nothing, and write a short note into `IMPLEMENTATION_PLAN.md` under the item describing what blocked you. The next iteration or a human will pick it up.
- Never edit files under `openspec/specs/` (the living spec). You read it, you don't change it here.

Keep the change small and focused. One item, one commit, tests green.
