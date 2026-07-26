---
created: 2026-07-26
last_verified: 2026-07-26
git_commit: 6c2be93
---

# Auto-Lauf: security-baseline (Nachlauf Walkthrough-Findings) · 2026-07-26

Zwei Issues aus der manuellen Prüfung des Nutzers (Station-5-Walkthrough), beide gebaut,
reviewt, per doneCheck belegt und nach `chore/shipcraft-migration` gemergt.

## Ergebnis pro Issue

### [TASK-9 — Indexer: fremdes topic-kollidierendes Log crasht jeden Tick](../../backlog/tasks) · gebaut → Done → gemergt
- Root-Cause: adressenloses `getLogs` + Decode VOR dem Vault-Gate + nicht-fehlertolerantes `parseVaultLog` → ein fremdes Log mit gleicher Event-Signatur, anderer indexed-Verteilung warf `BUFFER_OVERRUN`; Cursor advancte nie (Endlos-Retry, Indexing stand).
- Fix (Gürtel + Hosenträger): Adress-Gate vor dem Decode in `tick()`; `parseVaultLog` liefert bei Decode-Fehlern `null` + Debug-Log. 3 neue Regressionstests (erst rot mit exakt dem Live-Fehlerbild, dann grün), inkl. e2e-Fall „bekannter Vault emittiert kollidierendes Event" (Review-Finding, nachgeliefert).
- Belege: jest src/indexer 53/53, voller backend:test 336/336, lint=0. Commits ff54b77…0b9f9b2, Merge 8c52d18.
- Zählhinweis: Bau-Protokoll nannte „54 Tests" — Miscount des Bauers; verifiziert sind 53/53, Spec-Dateien Branch↔Merge byte-identisch.

### [TASK-8 — pnpm dev startet den Hardhat-Fork nicht (DX)](../../backlog/tasks) · gebaut → Done → gemergt
- Neu: `scripts/fork-check.mjs` (dependency-frei: RPC_URL-Auflösung env > backend/.env > Default, eth_chainId-Probe mit 2s-Timeout, wirft nie) + Verdrahtung in `dev.mjs`: `--check-fork-only`-Frühausstieg vor allen Seiteneffekten, nicht-blockierender Hinweis mit den drei Setup-Kommandos im Normal-Lauf.
- Review-Findings (2 minor/nit) direkt angewendet: Quote-/Inline-Kommentar-Stripping im .env-Parsing; AC-Häkchen. Kann-Kriterium `--fork` (Fork als Kind-Prozess) bewusst offen — Anpass-Weg: neues Issue bei Bedarf.
- Belege: check-fork-only negativ=0 mit Hinweis / positiv=0 ohne, lint=0. Commits 119a89a, f1429fb, Merge 6c2be93.

## Board-Stand danach

Done: task-2, task-4, task-6, task-8, task-9 · Needs Triage (Human/Entscheidung): task-1 (gitleaks), task-3 (Branch-Schutz), task-5 (gh), task-7 (Dev-Toolchain-CVEs).

## Nächster Schritt

Walkthrough fortsetzen (Backend-Watch lädt den Fix automatisch); danach Manual-Block aus
`docs/pruefungen/security-baseline.md` abschließen. Merge nach `main` bleibt Nutzer-Entscheidung.
