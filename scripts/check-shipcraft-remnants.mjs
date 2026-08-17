#!/usr/bin/env node
// Fails when artifacts of the retired shipcraft pipeline tooling reappear.
// The tracker moved to GitHub Issues on 2026-08-17; merges from older
// branches tend to silently re-add these paths (add/add brings files back
// without a conflict). Runs as part of `pnpm lint`.
import { existsSync } from 'node:fs';

const FORBIDDEN_PATHS = [
  'backlog',
  'docs/freigaben',
  'docs/auto-laeufe',
  'docs/pruefungen',
  'docs/agents/modus.md',
  '.shipcraft',
  'Backlog.md',
];

const found = FORBIDDEN_PATHS.filter((p) => existsSync(new URL(`../${p}`, import.meta.url)));

if (found.length > 0) {
  console.error('Shipcraft remnants detected (tracker lives in GitHub Issues since 2026-08-17):');
  for (const p of found) console.error(`  - ${p}`);
  console.error('Remove them before committing; see AGENTS.md ("Was vorher war").');
  process.exit(1);
}
