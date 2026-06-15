#!/usr/bin/env bash
set -euo pipefail

# Applies ONLY the AI workflow (skills, agents, CLAUDE.md, WORKFLOW.md, OpenSpec)
# to an EXISTING project folder. You create the project itself (NestJS, Next,
# Expo, whatever) beforehand.
#
# Run from the develop folder:
#   ./3blocks-dev-template/scripts/new-project.sh <target-folder>
#
# Example:
#   nest new workflow-lab --package-manager npm      # create the project first
#   ./3blocks-dev-template/scripts/new-project.sh workflow-lab

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage: ./3blocks-dev-template/scripts/new-project.sh <target-folder>"
  echo "Note: the folder is created if missing. You can also scaffold first (nest new, npx create-next-app, etc.)."
  exit 1
fi

if [ ! -d "$TARGET" ]; then
  echo "==> Folder '$TARGET' does not exist, creating it."
  mkdir -p "$TARGET"
fi

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ -d "$TARGET/.claude" ]; then
  echo "ERROR: '$TARGET' already has a .claude folder. Aborting to avoid overwriting."
  exit 1
fi

echo "==> Adding workflow template to '$TARGET'"
cp -R "$TEMPLATE_DIR/.claude" "$TARGET/"
cp -R "$TEMPLATE_DIR/scripts" "$TARGET/"
cp "$TEMPLATE_DIR/CLAUDE.md" "$TARGET/"
cp "$TEMPLATE_DIR/WORKFLOW.md" "$TARGET/"
cp "$TEMPLATE_DIR/.gitignore" "$TARGET/" 2>/dev/null || true
chmod +x "$TARGET/scripts/"*.sh

echo "==> Setting up OpenSpec in the project"
cd "$TARGET"
command -v openspec >/dev/null 2>&1 || npm install -g @fission-ai/openspec@latest
openspec init --tools claude

cat <<DONE

==> Done. Next steps:
    cd $TARGET
    claude
    # once per machine, inside the session:
    #   /plugin marketplace add obra/superpowers-marketplace
    #   /plugin install superpowers@superpowers-marketplace
    # then follow WORKFLOW.md.

DONE
