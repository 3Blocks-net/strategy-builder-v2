# Offene Punkte

Stand: 2026-08-17. Beim Wechsel des Trackers auf GitHub Issues (siehe `AGENTS.md`, "Was
vorher war") wurden die erledigten Tickets verworfen; diese vier Punkte waren noch offen
und sind hier gesichert, bis sie als GitHub Issues angelegt oder erledigt werden.

## 1. Secret-Scan über die Git-History nachholen (ehem. TASK-1)

Der Security-Baseline-Scan über die komplette Git-History lief nie, weil weder gitleaks
noch trufflehog installiert waren. Self-Custody-Projekt mit Keystores und Chain-Keys:
ein historisch committetes Secret bleibt auch nach dem Löschen der Datei lesbar.

- [ ] gitleaks installieren (`brew install gitleaks`)
- [ ] `gitleaks git --no-banner .` über die volle History
- [ ] Findings bewerten: echte Treffer rotieren + aus der History entfernen,
      False-Positives in `.gitleaksignore`

Prüfung: `gitleaks git --no-banner .` endet mit Exit 0.

## 2. Branch-Schutz auf main verifizieren/aktivieren (ehem. TASK-3)

Repo-Einstellung bei GitHub (`3Blocks-net/strategy-builder-v2`) war mangels gh-CLI nie
prüfbar. Ohne Branch-Schutz kann ein Force-Push oder Direkt-Commit den Review-Prozess
umgehen. Falls der GitHub-Plan keine Branch-Protection hergibt: lokale Merge-Gates
dokumentieren (Vorbild: `docs/BRANCHING.md` im Schwester-Repo blockbilanz).

- [ ] Branch-Protection-Rule auf `main` aktiv (kein Force-Push, PR-Pflicht nach Ermessen)

Prüfung: `gh api repos/3Blocks-net/strategy-builder-v2/branches/main/protection` → 200.

## 3. Dev-Toolchain-CVEs: Entscheidung warten vs. overrides (ehem. TASK-7)

Nach den CVE-Fixes vom Juli 2026 verbleiben ~20 Advisories (11 high, 4 moderate, 5 low)
ausschließlich in Dev-Ketten: hardhat/mocha (`packages/contracts`) und `@nestjs/cli`,
u. a. serialize-javascript (RCE, patched >=7.0.3), lodash-es, undici, adm-zip,
brace-expansion, elliptic (kein Patch). `pnpm audit --prod` ist 0; nichts davon läuft in
Produktion. Fixes sind innerhalb der deklarierten Ranges nicht möglich; Overrides
riskieren die Hardhat-/Nest-Toolchain.

- [ ] Entscheidung dokumentieren: Option A (auf Upstream-Bumps von hardhat/@nestjs/cli
      warten, Empfehlung des damaligen Security-Checks) oder Option B (gezielte
      `pnpm.overrides` + volle contracts-/backend-Suiten grün)
- [ ] Bei Option B: `pnpm audit` ohne high-Findings, `pnpm contracts:test` +
      `pnpm backend:build` grün

Prüfung: `pnpm audit --prod` bleibt Exit 0.

## 4. Verwaiste Vaults nach Fork-Neustart erkennen und melden (ehem. TASK-10)

Nach einem Fork-Neustart zeigen DB-Vaults ins Leere (`eth_getCode` = `0x`); der
ValuationService loggt dann pro Vault und Request `could not decode result data
(value="0x", method depositToken, BAD_DATA)` (`fee.service.ts:154`). Funktional
degradiert das sauber, aber die Meldung sieht nach ABI-Bug aus und wiederholt sich bei
jedem Fork-Neustart (DB überlebt, Chain-State nicht). Live erlebt am 2026-07-27, damals
manuell per SQL bereinigt (2 Vaults + 77 abhängige Zeilen).

Gewünschtes Verhalten: Backend prüft per `eth_getCode` (beim Start, danach gecacht), ob
jede bekannte Vault-Adresse auf der aktuellen Chain Code trägt. Codelose Vaults werden
genau EINMAL klar geloggt ("existiert auf dieser Chain-Instanz nicht, vermutlich
Fork-Neustart") und von Gas-Reserve-/Valuation-Reads übersprungen. Kein automatisches
Löschen von DB-Zeilen.

- [ ] Vault mit Code: Verhalten unverändert (bestehende Tests grün)
- [ ] Vault ohne Code: keine BAD_DATA-Warning mehr; einmalige, verständliche WARN mit
      Adresse/Label und Fork-Neustart-Hinweis
- [ ] Gas-Reserve-/Valuation-Reads überspringen codelose Vaults (Antwort degradiert pro
      Zeile wie bisher)
- [ ] Tests: Codelos-Fall gemockt (`getCode` → `0x`) auf beiden Konsumenten-Pfaden

Out of scope: automatisches Löschen/Archivieren, Indexer-Änderungen, Frontend-UI.

Prüfung: `pnpm --filter backend exec jest src/cockpit src/blockchain` → Exit 0.
