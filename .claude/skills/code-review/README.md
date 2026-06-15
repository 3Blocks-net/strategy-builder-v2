# code-review

Multi-Agent Code Review Skill. Orchestriert spezialisierte Sub-Agents (code-explorer, code-reviewer, security-reviewer, architecture-reviewer, extended-reasoner, prd-reviewer, completeness-check, cross-reference-check, schema-form-consistency-check, test-coverage-check) für strukturierte PR-/Branch-Reviews.

## Inhalt

```
code-review/
  SKILL.md                  # Skill-Definition + Orchestrierungs-Flow
  _shared/
    severity-rubric.md      # Geteilte Severity-Klassifikation
  agents/                   # 10 Sub-Agent-Definitionen
```

## Installation in ein Ziel-Repo

Claude Code entdeckt Agents standardmäßig unter `.claude/agents/`, nicht unter `<skill>/agents/`. Damit der Skill funktioniert, müssen beide Teile am richtigen Ort liegen:

```bash
# Skill
cp -R code-review <ziel-repo>/.claude/skills/code-review

# Agents (sonst schlagen die subagent_type-Aufrufe in SKILL.md fehl)
cp code-review/agents/*.md <ziel-repo>/.claude/agents/
```

Alternativ Symlinks setzen, damit Updates in `team-skills` automatisch durchschlagen.

## Quelle

Ursprünglich aus `milomed-milocare/.claude/` rüberkopiert.
