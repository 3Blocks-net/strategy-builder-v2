# Ralph Loop (optional, advanced)

An autonomous loop that works the AFK items in `IMPLEMENTATION_PLAN.md` one at a time, each in a fresh context, until the plan is done. This is the autonomy step. Do not switch it on until you have run the manual pipeline a few times and trust your tests and review.

## Files

- `ralph.sh` — the loop. Picks the next unchecked item, runs one headless Claude turn, checks tests, repeats.
- `build-prompt.md` — the instruction each iteration follows (one item, TDD, commit).

## How the queue works

Ralph reads `IMPLEMENTATION_PLAN.md`, a plain checklist of AFK items derived from the local slices in the OpenSpec change's tasks.md. Example:

```markdown
# Implementation Plan (AFK only)

- [ ] GET /tasks returns all tasks as a list
- [ ] GET /tasks/:id returns one task by id
- [ ] GET /tasks/:id returns 404 for an unknown id
```

HITL items stay out of this file. They are handled by a human.

## Safety rules (non-negotiable)

- Always run on a dedicated branch, never on main:
  ```bash
  git checkout -b feature/list-tasks
  ```
- Review the resulting commits and open a PR for human review before merging.
- Run the code-review skill after the loop, before merging.

## Run it

```bash
# 1. on a feature branch, with IMPLEMENTATION_PLAN.md present
git checkout -b feature/list-tasks

# 2. run the loop (default 8 iterations max)
./scripts/ralph/ralph.sh

# or cap iterations explicitly
./scripts/ralph/ralph.sh 5
```

The loop stops when every item is checked off, when it hits the iteration cap, or when a Claude run fails.

## Note on usage limits

`claude -p` (headless) draws from a separate Agent SDK credit on subscription plans from 15 June 2026. Keep iteration counts modest while you are learning.

## After the loop

```bash
npm run test        # confirm green
# then in an interactive claude session:
#   starte review
#   /opsx:archive <change-name>
# then open a PR for human review.
```
