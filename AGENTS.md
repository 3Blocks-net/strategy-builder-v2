# AGENTS.md

Werkzeug-neutrale Anweisungs-Datei für alle Coding-Agenten in diesem Repo. `CLAUDE.md`
importiert sie über `@AGENTS.md` und enthält zusätzlich die Projekt-Konventionen (Stack,
Definition of Done, Encode-Boundary-Regel).

## Agenten-Skills

### Sprechweise

Rede von Haus aus klar und verständlich — auch für Nicht-Entwickler: keine Fachbegriffe in
Klammern erklären, keine internen Skill-Namen nach außen, in Schritten sprechen. Verbindliche
Hausregel: `references/uebersetzung.md` (Teil 1, im Plugin). Sprache, Länge und Anrede aus
`docs/agents/ton-profil.md` — jede Sitzung lesen und befolgen.

### Vorrang

Vorrang: shipcraft führt den Entwicklungsprozess in diesem Projekt exklusiv. Beschreibt der
Nutzer ein Feature, einen Bug oder eine Änderung, starte den shipcraft-Einstieg /weiter
(Skill „weiter") — nie einen Prozess-Skill eines anderen Plugins (brainstorming, feature-dev
o. ä.) und nie direkt losimplementieren. shipcraft-Helfer wie tdd, research, grilling oder
code-review laufen nur innerhalb einer Station, nie als Einstieg auf eine Nutzer-Anfrage.

### Betriebsmodus

solo (Projekt-Eigenschaft — bei Übergabe gälte derselbe Modus für Fachseite und Dev-Seite).
Siehe `docs/agents/modus.md`.

### Issue-Tracker

Issues leben als Backlog.md-Tasks im Repo (`backlog/`-Ordner, `backlog`-CLI, Web-Board);
externe PRs sind keine Anfrage-Oberfläche. Siehe `docs/agents/issue-tracker.md`.

### Triage-Labels

Die fünf kanonischen Rollen heißen wie ihre Default-Namen (needs-triage, needs-info,
ready-for-agent, ready-for-human, wontfix). Siehe `docs/agents/triage-labels.md`.

### Domain-Doku

Ein Kontext — eine `CONTEXT.md` + `docs/adr/` im Repo-Root (träge angelegt durch
domain-modeling). Siehe `docs/agents/domain.md`.
