---
created: 2026-07-26
last_verified: 2026-07-26
git_commit: 11e48e3
---

# Prüf-Report: security-baseline (Station 5)

Geprüft wurde der zusammengeführte Stand der drei Baseline-Tickets (TASK-4, TASK-6, TASK-2)
auf `chore/shipcraft-migration`, Diff-Basis `80cb48c`.

**Ehrliche Scope-Grenze:** Für diese Tickets existiert kein eingefrorenes Epic und kein PRD
(sie stammen aus dem Brownfield-Audit, Rückkanal 1) — der PRD-/Epic-Gap-Abgleich und die
Abnahme-pro-Rolle-Tabelle entfallen deshalb ersatzlos (Findings-JSON der Gap-Taxonomie ist
bewusst leer). Geprüft wurde stattdessen gegen die Ticket-Verträge (Agent Briefs).

## Checkliste (Ticket-Kriterien)

| Kriterium | Status | Beleg |
|---|---|---|
| TASK-4: db nur auf localhost | **erfüllt** | `"127.0.0.1:5432:5432"` — docker-compose.yml:10, grep=0, compose-config=0 |
| TASK-4: db:up + Backend-Start unverändert | **teilweise** | blockiert durch fremden Container `blockbilanz-postgres` auf Port 5432 (manuelles Häkchen) |
| TASK-6: `pnpm lint` Exit 0 | **erfüllt** | frischer Re-Run lint=0; Stichprobe (absichtlicher Fehler schlägt an) im Bau verifiziert |
| TASK-6: alle 5 TS-Pakete geprüft, Generated ausgeschlossen | **erfüllt** | biome.jsonc includes/excludes; 367 Dateien geprüft |
| TASK-6: Steckbrief aktualisiert | **erfüllt** | docs/agents/projekt-steckbrief.md, Zeile „Lint" |
| TASK-2: `pnpm audit --prod` 0 high | **erfüllt** | „No known vulnerabilities found" (vorher 12 high/26 mod/1 low) |
| TASK-2: moderate/low triagiert | **erfüllt** | alle 39 behoben statt akzeptiert (Task-Datei, Abschnitt Triage) |
| TASK-2: Tests betroffener Pakete grün | **erfüllt** | shared 120/120, mcp 116/116, frontend 134/134 (2 vorbestehende Suite-Load-Fehler unverändert); backend:test umgebungsblockiert (Ersatz: backend:build=0 + DB-freier Indexer-Spec 11/11) |

## Nachbar-Läufe

**Code-Review (nicht-interaktiv):** Kein Merge-Blocker, 0 Critical. 1 systemisches Warning
(db-test-Port) auto-gefixt (c37d1d9); 2 Infos (Biome-Config-Schicht bestätigt;
Decorator-Flag-Scoping probiert und revertiert — Override-Match ändert die Regel-Auswertung).
Apply-Schritt zusätzlich: eindeutige React-Keys für Chart-Marker/Positions-Zeilen (acf3ac7).
Voll-Report: `<TMP>/shipcraft-review-chore-shipcraft-migration.md` (+ .json).
Fallow-Baseline: nicht verfügbar (keine devDependency) — Reviewer haben manuell verifiziert.

**E2E-Ausführung: NICHT AUSGEFÜHRT — Umgebung blockiert.** Die Playwright-Suite braucht den
vollen Stack (DB + Fork + Backend); Port 5432 ist durch den fremden Container
`blockbilanz-postgres` belegt. Zusätzlich vorbestehend: `e2e/automation-editor.spec.ts`
kollidiert mit der Vitest-Config (Suite lädt nicht). → Human-Task im Manual-Block. Kein
stilles Grün.

**Security-Gate:** 5 Findings — 1 auto-gefixt (db-test-Bind, c37d1d9), 1 auto-gefixt im
Apply-Schritt (vitest/vite-Refresh, 11e48e3; Dev-Audit 26→20, prod bleibt 0), 1 → Ticket
(TASK-7: ~20 Dev-Toolchain-Advisories in hardhat/nest-cli-Ketten, Entscheidung nötig),
1 Werkzeug-Lücke (Secret-Scan NICHT AUSGEFÜHRT — gitleaks/trufflehog fehlen; bereits TASK-1),
1 Scope-Notiz (keine Rollen-Matrix vorhanden → AuthZ-Runde degradiert gegen Diff-Flächen
gelaufen: VaultOwnerGuard/KeeperIngestGuard/APP_GUARD verifiziert, kein IDOR im Diff;
Prompt-Injection-Schritt übersprungen — Diff berührt keine Prompt-Pfade).
JSON: `<TMP>/shipcraft-security-chore-shipcraft-migration.json`.

## Auto-Fix-Protokoll

**10 Findings gesamt (über alle Quellen), 4 automatisch behoben, 1 braucht deine
Entscheidung (TASK-7), Rest = dokumentierte Infos/bekannte Human-Tasks.**

Auto-Fixes (je: Fix → Tests+Lint grün → Commit): db-test-Bind (c37d1d9) · React-Keys
(acf3ac7) · vitest/vite (11e48e3) · Decorator-Scoping **revertiert** nach Fehlschlag der
Prüfkette (Apply-Regel: bei Fail zurücknehmen und offen melden — als Kommentar in
biome.jsonc dokumentiert).

## Release-Notes-Anhang (Vorschlag, kein Deploy)

Seit Beginn der Historie (kein Tag vorhanden), Nutzersprache:

- **Behoben:** Die lokale Entwicklungs-Datenbank (und die Test-Datenbank) sind nicht mehr
  aus dem Netzwerk erreichbar, nur noch vom eigenen Rechner. (task-4, c37d1d9)
- **Behoben:** Alle 39 bekannten Sicherheitslücken in den Produktions-Abhängigkeiten sind
  geschlossen; zusätzlich zwei Lücken in den Entwickler-Werkzeugen. (task-2, 11e48e3)
- **Behoben:** Zwei Anzeige-Robustheitsprobleme (Wertverlauf-Chart, Positions-Liste) bei
  gleichzeitigen Ein-/Auszahlungen bzw. gleichnamigen Tokens. (acf3ac7)
- **Intern neu:** Repo-weites Lint-Sicherheitsnetz (Biome) — Codequalität wird jetzt
  maschinell geprüft. (task-6)

**SemVer-Vorschlag:** PATCH → `1.0.1` (nur fix/chore, kein nutzersichtbares Feature; der
react-router-Major-Bump ist ein internes Dependency-Detail). Zum Abnicken — kein Tag gesetzt.

## Offene Punkte (kein stilles Grün)

1. E2E nicht ausgeführt (Umgebung blockiert, s. o.).
2. Secret-Scan nie gelaufen (gitleaks fehlt — TASK-1).
3. Branch-Schutz unverifiziert (gh fehlt — TASK-3/TASK-5).
4. `pnpm backend:test` gegen echte DB steht aus (Port-Konflikt).
5. Lokale Node-Version 22.20.0 < engines 22.22.0 (pnpm warnt nur).
