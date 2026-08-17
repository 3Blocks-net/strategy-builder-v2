# Coding Standards

Verbindliche Regeln für diesen Codebestand. `/code-review` prüft die Standards-Achse
gegen diese Datei; was hier steht, gewinnt gegen allgemeine Faustregeln.

Was bereits ein Werkzeug prüft, steht hier nicht: Formatierung und die offensichtlichen
Fehler macht Biome (`pnpm lint`, Config `biome.jsonc` im Root, deckt alle fünf TS-Pakete
ab, Solidity ausgenommen).

## Sprache

- Gespräch und nutzer-sichtbare Texte auf Deutsch; Code, Kommentare, Commit-Messages und
  Dateinamen auf Englisch.
- Deutsche Nutzer-Texte sind auch für Nicht-Entwickler verständlich: keine Fachbegriffe,
  die in Klammern erklärt werden müssen.
- Commits: Conventional Commits (feat, fix, chore, docs, refactor, test, perf).

## Modul-Zuschnitt

- **Tiefe Module bevorzugen**: kleine Schnittstelle, viel Implementierung dahinter. Ein
  Modul, dessen Schnittstelle fast so groß ist wie seine Implementierung, verdient
  Nachdenken.
- TypeScript strict in allen Paketen.

## Architektur-Invarianten

Diese drei Regeln sind die Nähte des Systems; Verstöße sind Merge-Blocker.

- **Eine Quelle für die Encode-Boundary**: `mapGraphToRaw` & Co. leben ausschließlich in
  `packages/shared`; Frontend und MCP konsumieren sie. Keine Zweitimplementierung, keine
  Drift.
- **Step-Semantik schema-getrieben**: Token/Betrag/Empfänger/Richtung über
  `x-ui-role`/`x-ui-widget` aus dem Schema auflösen, nie per-step-type-Sondercode.
- **Self-Custody/Security**: Key-Material und Secrets nie loggen, serialisieren oder ins
  Repo committen (Keystores sind git-ignored). Schreibende/signierende MCP-Aktionen
  laufen durch das server-erzwungene Confirm-Gate (PolicyGate); es wird nie clientseitig
  umgangen oder abgeschwächt.

## Tests

- Gegen **beobachtbares Verhalten über die öffentliche Schnittstelle**, nie gegen
  Implementierungsdetails. Ein Test, der nach einem Refactoring ohne Verhaltensänderung
  rot wird, war falsch geschrieben.
- Nachbilden (mocken) nur an Systemgrenzen (Provider, Chain, DB), nie innerhalb der
  eigenen Logik.
- Eine gescheiterte Prüfung ist nie grün. Wenn ein Test nicht entscheiden kann, ob etwas
  stimmt, meldet er das, statt durchzuwinken.
- Test-Runner sind gemischt: Backend = Jest, alles andere = Vitest. Fork-Tests der
  Contracts brauchen einen laufenden Fork (`pnpm contracts:fork:bsc`).

## Generierter Code

Niemals reviewen oder editieren: `**/generated/**`, `**/dist/**`, `**/build/**`,
`**/.next/**`, `node_modules`, Lockfiles, `*.min.*`, `packages/contracts/types/`.
