#!/usr/bin/env bash
set -euo pipefail

# Bootstrap for the 3Blocks Dev Template.
# Run once after cloning: ./scripts/bootstrap.sh

echo "==> 3Blocks Dev Template bootstrap"

# 1. Check Node version (OpenSpec needs >= 20.19)
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
NODE_MINOR=$(node -v | sed 's/v[0-9]*\.\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; }; then
  echo "ERROR: Node 20.19+ required. Found: $(node -v)"
  exit 1
fi
echo "==> Node $(node -v) ok"

# 2. Check Claude Code
if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: Claude Code not found."
  echo "       npm install -g @anthropic-ai/claude-code"
  exit 1
fi
echo "==> Claude Code found"

# 3. Install OpenSpec globally
if ! command -v openspec >/dev/null 2>&1; then
  echo "==> Installing OpenSpec globally"
  npm install -g @fission-ai/openspec@latest
else
  echo "==> OpenSpec already installed ($(openspec --version 2>/dev/null || echo 'version unknown'))"
fi

# 4. Initialize OpenSpec in the repo (creates .claude/commands/opsx/ if missing)
if [ ! -d "openspec/specs" ]; then
  echo "==> Initializing OpenSpec in the repo"
  openspec init --tools claude
else
  echo "==> OpenSpec already initialized in the repo"
fi

# 5. Skills check
SKILL_COUNT=$(find .claude/skills -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')
echo "==> Found $SKILL_COUNT project skills under .claude/skills/"

# 6. Superpowers note (plugin, per machine, inside the Claude session)
cat <<'NOTE'

==> Almost done. One manual step remains:

    Start a Claude Code session:   claude

    Then install Superpowers in the session (once per machine):
      /plugin marketplace add obra/superpowers-marketplace
      /plugin install superpowers@superpowers-marketplace

    Verify with /help that /opsx: and brainstorm/write-plan appear.

    Then read WORKFLOW.md and get started.

NOTE

echo "==> Bootstrap complete"
