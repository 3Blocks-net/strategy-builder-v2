---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: c8a4818
---

# Auto-Lauf: security-baseline · 2026-07-25

Orchestrierter Bau-Lauf (Station 4) über die agent-fertigen Tickets aus dem Brownfield-Audit.
Basis-Branch bewusst `chore/shipcraft-migration` statt `main` (Board + Konfiguration existieren
nur dort) — Merge der Feature-Branches erfolgt am Epic-Ende (Station 5).

## Ergebnis pro Issue

### [TASK-4 — Postgres-Port in docker-compose auf localhost binden](../../backlog/tasks) · gebaut → Done
- Branch `feature/task-4` (48e9855, 2cef275, d0f97c2). Port-Mapping auf `127.0.0.1:5432:5432`; db-test/Credentials unangetastet.
- doneCheck: grep=0, compose-config=0 (Quittung `docs/freigaben/security-baseline.md` auf dem Branch).
- Review: 2 Minor, beide ohne Fix-Bedarf (offenes AC ist Umgebungsblocker, `.gitignore`-Zeile ist Loop-Vorgabe).
- **Offen (manuell, Anpass-Weg: Häkchen im Ticket):** `pnpm db:up` + Backend-Start real verifizieren — blockiert durch fremden Container `blockbilanz-postgres` (belegt Port 5432 auf 0.0.0.0 seit ~2 Wochen). Container stoppen oder umziehen, dann prüfen.

### [TASK-6 — Lint-Setup einrichten (Biome)](../../backlog/tasks) · gebaut → Done
- Branch `feature/task-6` (7 Commits, HEAD d23c88f + Quittung 7b53bee). Biome ^2.5.5, `biome.jsonc` fürs Monorepo, Root-Script `pnpm lint` (Exit 0, Stichprobe verifiziert), 76 Error-Findings echt behoben, begründete `biome-ignore`-Kommentare statt Pauschal-Abschaltungen, Steckbrief aktualisiert.
- doneCheck: lint=0 (frischer Re-Run). Review: 0 Findings.
- **Hinweis (Anpass-Weg: neues Issue bei Bedarf):** 872 Warnings/53 Infos auf Biome-Default-Severity bewusst offen gelassen (Repo-weiter Umbau wäre eigener Scope); CSS-Linting ausgenommen.
- **Vorbestehend, nicht angefasst (Anpass-Weg: neues Issue):** 2 Frontend-Test-Suiten laden nicht (`e2e/automation-editor.spec.ts` Playwright-in-Vitest-Konflikt; `src/pages/connect.test.tsx` wagmi-Mock-Lücke) — per stash-Vergleich als vorbestehend belegt.

### [TASK-2 — CVE-Audit: 39 verwundbare Dependencies beheben](../../backlog/tasks) · gebaut → Done
- Branch `feature/task-2` (7 Commits, HEAD 079f7bd). Audit 12 high/26 moderate/1 low → **0/0/0** („No known vulnerabilities found"). Kleinster Eingriff via `pnpm.overrides` wo möglich; Major-Grenzen (react-router 7→8, uuid→11, @hono/node-server→2) nur nach grüner Spike-Verifikation überschritten; kein Quellcode angefasst.
- doneCheck: audit=0 (frischer Re-Run). Review: 1 Minor → gefixt (d17a86e: `engines.node >=22.22.0` dokumentiert — von react-router 8 verlangt).
- **Offen (manuell, Anpass-Weg: Häkchen im Ticket):** lokale Node-Version ist 22.20.0 (< 22.22) — pnpm warnt nur; bei Gelegenheit Node aktualisieren. `pnpm backend:test` wegen Port-Konflikt nicht gelaufen (Ersatz: backend:build + DB-freier Indexer-Spec grün).

## Nicht gebaut (Human-Tasks, Label ready-for-human)

- [TASK-1 — Secret-Scan über die Git-History nachholen](../../backlog/tasks): `brew install gitleaks`, Scan, Treffer bewerten.
- [TASK-3 — Branch-Schutz auf main verifizieren/aktivieren](../../backlog/tasks): GitHub-Repo-Einstellung.
- [TASK-5 — gh-CLI installieren](../../backlog/tasks): `brew install gh` + `gh auth login`.

## Nächster Schritt

Die drei Feature-Branches sind ungemergt. Station 5 (Prüfen/converge — volles Code-Review,
E2E, Security-Gate, Merge-Bündelung) ist sinnvoll, sobald die Human-Tasks erledigt sind —
oder auf Zuruf schon vorher für die drei gebauten Branches.
