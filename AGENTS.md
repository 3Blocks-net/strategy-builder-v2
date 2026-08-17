# AGENTS.md

Werkzeug-neutrale Anweisungen für Coding-Agenten in diesem Repo. Claude Code liest sie
über den `@AGENTS.md`-Import in `CLAUDE.md`.

## Sprechweise

Rede von Haus aus klar und verständlich, auch für Nicht-Entwickler: keine Fachbegriffe in
Klammern erklären, keine internen Werkzeug-Namen nach außen, in Schritten sprechen.
Gespräch auf Deutsch; Code, Kommentare, Commit-Messages und Dateinamen auf Englisch.

## Arbeitsweise

Der Ablauf von der Idee bis zur geprüften Funktion läuft über einzeln aufgerufene Skills,
nicht über eine durchgehende Pipeline:

`/grill-with-docs` (Plan schärfen, Begriffe und Entscheidungen festhalten) ->
`/to-spec` (Gespräch zur Spezifikation verdichten) ->
`/to-tickets` (in senkrechte Schnitte zerlegen) ->
`/implement` (bauen, an vereinbarten Nähten test-getrieben) ->
`/code-review` (vor dem Commit).

Für Vorhaben, die größer sind als eine Sitzung, steht `/wayfinder` darüber: eine Karte aus
Entscheidungs-Tickets, die einzeln aufgelöst werden, bis der Weg klar ist.

Es gibt keinen Zwang, mit einem bestimmten Skill einzusteigen. Bei kleinen, klaren
Änderungen darf direkt gebaut werden.

## Konfiguration für die Skills

Drei Dateien, die die Skills selbst lesen. Sie sind die Quelle, nicht diese Datei; bei
Widerspruch gewinnen sie.

| Datei | Was drin steht |
|---|---|
| `docs/agents/issue-tracker.md` | GitHub Issues über die `gh`-Kommandozeile, Repo `3Blocks-net/strategy-builder-v2`, dazu die Konventionen dieses Projekts (Fundstellen-Abschnitt, Akzeptanzkriterien, Sprache) |
| `docs/agents/triage-labels.md` | Das Label-Vokabular: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` |
| `docs/agents/domain.md` | Wo Begriffe und Entscheidungen liegen (`CONTEXT.md`, `docs/adr/`), träge angelegt |

Kurz gefasst: `ready-for-agent` heißt, ein Agent kann das direkt bauen. `ready-for-human`
heißt, es braucht vorher eine Entscheidung eines Menschen. Neue, von einem Agenten
angelegte Issues bekommen `needs-triage`, solange Florian sie nicht gesehen hat.

Die Coding-Regeln, gegen die `/code-review` prüft, stehen in `CODING_STANDARDS.md`.

## Definition of Done

Ein Issue ist erst fertig, wenn alle Akzeptanzkriterien erfüllt und durch Tests
verifiziert sind, die Tests grün sind, der Lint sauber ist und ein Review ohne offene
Hard Blocker abgeschlossen wurde. Eine gescheiterte Prüfung ist nie grün.

## Was vorher war

Bis August 2026 lief der Entwicklungsprozess über ein Pipeline-Werkzeug (shipcraft) mit
eigenem Tracker (Backlog.md) und eigenen Artefakten (Gate-Quittungen, Auto-Lauf-Protokolle,
Prozess-Konfiguration). Beides wurde am 2026-08-17 entfernt. Der neue Tracker (GitHub
Issues) startet bewusst leer; die noch offenen Punkte aus dem alten Tracker stehen in
`docs/offene-punkte.md`.

Was aus der Zeit erhalten geblieben ist, weil es echtes Wissen trägt: die Reverse-Specs
und fachlichen Pakete unter `docs/discovery/`, das PRD unter `docs/prd/` und der
Doku-Altbestand unter `docs/legacy-specs/`. Wo etwas liegt, steht in `CLAUDE.md` unter
"Wo was liegt".

Alles Entfernte steht vollständig in der Git-Historie
(`git log --diff-filter=D --name-only -- backlog docs/agents docs/freigaben docs/auto-laeufe docs/pruefungen`).
Der Lint-Guard `scripts/check-shipcraft-remnants.mjs` verhindert, dass Merges aus alten
Branches diese Pfade konfliktfrei zurückbringen.
