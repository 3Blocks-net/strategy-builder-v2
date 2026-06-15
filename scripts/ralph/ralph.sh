#!/usr/bin/env bash
set -uo pipefail

# Ralph loop: works one AFK task at a time with a fresh context each iteration,
# until the implementation plan is fully checked off.
#
# Backpressure: each iteration must leave the tests green. If tests fail,
# the next iteration sees the failure and fixes it. Memory persists via
# git history and IMPLEMENTATION_PLAN.md.
#
# Run from the project root:  ./scripts/ralph/ralph.sh
#
# SAFETY (universal, keep these):
#   - Always run on a dedicated git branch, not on main.
#   - Always review the resulting PR before merging.
#   - Tests are the only backpressure; weak tests = unsafe loop.

PLAN="IMPLEMENTATION_PLAN.md"
PROMPT_FILE="scripts/ralph/build-prompt.md"
MAX_ITERATIONS="${1:-8}"
TEST_CMD="${TEST_CMD:-npm run test}"

if [ ! -f "$PLAN" ]; then
  echo "ABORT: $PLAN not found. Create the plan from the AFK issues first."
  exit 1
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "ABORT: claude not found."
  exit 1
fi

echo "==> Ralph starting. Max $MAX_ITERATIONS iterations. Test cmd: $TEST_CMD"
echo "==> Branch: $(git branch --show-current 2>/dev/null || echo 'unknown')"

i=0
while [ "$i" -lt "$MAX_ITERATIONS" ]; do
  i=$((i+1))

  # Stop condition: no unchecked AFK items left.
  if ! grep -qE '^\s*-\s*\[ \]' "$PLAN"; then
    echo "==> All plan items checked off. Ralph done after $((i-1)) iterations."
    exit 0
  fi

  echo ""
  echo "===== Iteration $i ====="

  # Fresh context every iteration: a brand new headless run reading the prompt + plan.
  claude -p "$(cat "$PROMPT_FILE")" \
    --permission-mode dontAsk \
    --allowedTools "Read,Write,Edit,Bash,Grep,Glob" \
    --max-turns 25 \
    || { echo "==> claude run failed on iteration $i, stopping."; exit 1; }

  # Backpressure: tests must pass. If not, log and let next iteration fix it.
  if $TEST_CMD; then
    echo "==> Tests green on iteration $i."
  else
    echo "==> Tests RED on iteration $i. Next iteration will see the failure."
  fi
done

echo "==> Reached max iterations ($MAX_ITERATIONS). Check $PLAN for remaining items."
