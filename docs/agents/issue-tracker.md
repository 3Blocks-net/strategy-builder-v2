# Issue-Tracker: Backlog.md

Issues und PRDs für dieses Repo leben als Backlog.md-Tasks — git-native Markdown-Dateien mit
Frontmatter. Nutze die `backlog`-CLI für alle Operationen, überall mit `--plain` für
nicht-interaktive, maschinenlesbare Ausgabe.

**Nur Solo-Modus.** Im Übergabe-Modus ist Backlog.md gesperrt (Begründung: siehe Schritt 0
im Haupt-Skill) — diese Datei wird nur geschrieben, wenn Modus `solo` gewählt wurde.

## Herkunft des `backlog`-Binaries

Shipcraft bevorzugt einen eigenen Fork von Backlog.md (deutsches UI, Dark-Theme,
Rechtsklick-Kontextmenü, Tooltip-Sweep — gleicher CLI-Vertrag wie Upstream; Quelle:
`https://github.com/IT-Studio-Rech/Backlog.md`). Ausgeliefert wird er als npm-Paket mit
vorkompilierten Binaries für macOS, Linux und Windows:

```
npm install -g @rechstudio/backlog.md
```

Der Fork trägt einen Versions-Marker: `backlog --version` enthält den Substring
`-rechstudio.` (z. B. `1.47.1-rechstudio.2`); reines Upstream-Backlog.md (via
`npm i -g backlog.md`) hat diesen Marker nicht. Beide Pakete installieren denselben Befehl
`backlog` — es läuft immer nur eines von beiden. `setup` installiert bzw. aktualisiert den
Fork bei Bedarf (Details: `skills/setup/SKILL.md`, Abschnitt „Backlog.md-Fork auflösen").
Kein Submodule, kein Binary im Shipcraft-Repo — der `git pull`-Update-Weg von Shipcraft
bleibt davon unberührt.

## Konventionen

- **Task anlegen**: `backlog task create "..." --description "..." --plain`
- **Task lesen**: `backlog task <id> --plain`
- **Tasks auflisten**: `backlog task list --plain` mit passenden Status-/Label-Filtern
- **Status ändern**: `backlog task edit <id> --status "In Progress" --plain`
- **Kommentieren**: als Notiz an die Task-Datei anhängen (kein separater Kommentar-Befehl in
  der CLI; Task-Datei direkt bearbeiten)

Integration läuft über CLI-Instruktionen, nicht über MCP (der Token-Overhead eines MCP-Servers
lohnt sich hier nicht) — dieselbe Abwägung wie bei GitHub (`gh` statt Remote-MCP).

## Status-Modell (`config.yml`)

Der Status-Array wird direkt in der Projekt-`config.yml` gepflegt (per CLI nicht setzbar):

```yaml
statuses:
  - Needs Triage
  - Ready for Agent
  - In Progress
  - Needs Info
  - In Review
  - Done
```

Als Array-Literal: `['Needs Triage','Ready for Agent','In Progress','Needs Info','In Review','Done']`.

**Der letzte Eintrag ist Terminal-Semantik** — `Done` schließt eine Task endgültig ab.
`wont-do` gehört **nie ans Ende des Arrays**; bilde es stattdessen als Label oder über Archiv
ab (z. B. Label `wont-do` + Status bleibt, wo er war, oder Task ins Archiv verschieben). Ein
zusätzlicher Terminal-Status im Array würde die Terminal-Prüfung des Plugins verwirren, die
nur den letzten Array-Eintrag als „fertig" liest.

## Abhängigkeiten (Dependencies)

Backlog.md prüft Dependencies nur auf **Existenz** — verweist eine Task auf eine
Dependency-ID, die es nicht gibt, schlägt der Befehl fehl. Es gibt **keinen Zyklus-Check**:
zirkuläre Abhängigkeiten (A blockiert B blockiert A) werden von der CLI nicht erkannt. Das
Plugin muss das selbst prüfen, bevor es sich auf eine Abhängigkeitskette verlässt (z. B. beim
Readiness-Gate).

Es gibt **keine eingebaute Unblocked-Abfrage** (kein Äquivalent zu „gib mir die nächste freie
Task") — `sequence` wurde im Fork wieder entfernt (upstream BACK-520/#727), auf beiden Seiten
also nicht verfügbar. Nutze stattdessen:

```
backlog task list --plain
```

Das listet alle Tasks (unsortiert nach Abhängigkeit); welche davon tatsächlich unblockiert
ist, muss das Plugin selbst ableiten: pro Task deren `dependencies`-Frontmatter lesen
(`backlog task <id> --plain`) und prüfen, ob jede dort genannte Dependency-ID im
Terminal-Status steht (siehe oben).

## Akzeptanzkriterien (AC-Sektion)

Jede Task trägt eine AC-Sektion. Prüfe sie mit:

```
backlog task <id> --check-ac
```

## Wenn ein Skill „in den Issue-Tracker publizieren" sagt

`backlog task create` ausführen.

Publiziert ein Skill ein Epic oder PRD „mit vollem Inhalt", gehört der komplette
Markdown-Inhalt ins Ticket (kein bloßer Verweis) plus Back-Link: Commit-Hash in den
Ticket-Text, Ticket-ID/URL ins `ticket:`-Feld im Frontmatter des Artefakts.

### Branding-Konventionen je Artefakt-Typ

Shipcraft-Begriffe finden sich 1:1 auf dem Board wieder — Titel-Präfix und Label pro
Artefakt-Typ, analog zum bestehenden Muster „Karte: …" bei Wayfinding (siehe
„Wayfinding-Operationen" unten):

| Artefakt | Titel-Präfix | Label | Beispiel |
|---|---|---|---|
| Epic | `Epic: <Name>` | `epic` | `backlog task create "Epic: <Name>" --description "<voller Epic-Text>" -l epic --plain` |
| PRD | kein Präfix (Titel bleibt der Feature-Name) | `prd` | `backlog task create "<Name>" --description "<voller PRD-Text>" -l prd,ready-for-agent --plain` |

Das PRD trägt bewusst keinen Titel-Präfix — es ist über die Label-Kombination `prd` +
`ready-for-agent` bereits eindeutig als Plan-Artefakt erkennbar (kein Umsetzungs-Issue, der
Bau-Loop zieht es nie, siehe `skills/to-prd/SKILL.md`). Das Label `prd` macht es zusätzlich
per Board-Filter von Umsetzungs-Issues unterscheidbar.

### Doku-Spiegelung (Dokumente ohne eigenes Ticket)

Nicht jedes Stations-Dokument wird als Ticket publiziert — der Prüf-Report aus Station 5
(`docs/pruefungen/<feature>.md`, `converge`) ist weder Umsetzungs-Issue noch Plan-Artefakt
und bleibt deshalb sonst unsichtbar auf dem Board. Spiegel ihn stattdessen über das native
Backlog.md-Dokument-Feature:

```
backlog doc create "Prüfbericht: <Name>" -p pruefungen/<feature> -t specification --plain
```

Der Doc-Titel trägt denselben Feature-/Epic-Namen wie das zugehörige Epic-Ticket, damit
Epic, PRD und Prüfbericht auf dem Board als zusammengehörig erkennbar sind. Backlog.md-Docs
kennen keine Labels (nur `type`: readme/guide/specification/other) — `specification` passt
für ein Prüfergebnis. Anders als beim Ticket-Publizieren oben muss der Doc-Inhalt NICHT den
vollen Report enthalten: eine kurze Statuszeile (bestanden / Anzahl offener Findings) plus
Pfad- und Commit-Verweis auf `docs/pruefungen/<feature>.md` genügt — das Repo-Artefakt
bleibt die kanonische Quelle, das Doc ist nur der Board-Spiegel.

## Wenn ein Skill „das passende Ticket holen" sagt

`backlog task <id> --plain` ausführen.

Multi-Dev-Regel: nur Tickets ohne Assignee ziehen — nie ein geclaimtes Ticket übernehmen.
Beim Ziehen setzt du dich selbst als Assignee (`backlog task edit <id> -a <name>`,
quellcode-geprüft cli.ts:1564). **Achtung:** git-nativ = kein atomares Claiming, für
Multi-Dev disqualifiziert — siehe `references/multi-dev.md`.

## Status-Workflow

Siehe „Status-Modell (`config.yml`)" oben — das `statuses`-Array trägt die sechs kanonischen
Status wörtlich: `Needs Triage`, `Ready for Agent`, `In Progress`, `Needs Info`, `In Review`,
`Done`. Letzter Eintrag = Terminal-Status; `wont-do` nie ans Array-Ende, sondern als Label
oder über Archiv abbilden.

## Wenn ein Skill „Status setzen" sagt

`backlog task edit <id> --status "<Status>" --plain` ausführen, `<Status>` einer der sechs
kanonischen Strings.

## Wenn ein Skill „auf Statuswechsel reagieren" sagt

Das Done-Gate läuft nicht über Tracker-Hooks, sondern über den Orchestrator: Der Bau-Loop
re-runt am Ende die „Automatisierte Prüfung" des Issues in einem frischen Prozess und
schreibt die Exit-Codes als doneCheck-Zeile in die Freigabe-Quittung — erst dann wird der
Status Done gesetzt. Ein Done ohne doneCheck-Zeile gilt als verwaist; `/weiter` meldet das
beim nächsten Aufruf als Konflikt (Polling — kein Push-Kanal nötig).

**onStatusChange (nativ, mit klaren Grenzen):** Backlog.md kann bei Statuswechseln ein
Kommando ausführen (`backlog/config.yml`, Schlüssel `onStatusChange`; Übergabe als
Umgebungsvariablen `$TASK_ID`, `$OLD_STATUS`, `$NEW_STATUS`; läuft via `sh -c`, also nur
Mac/Linux verlässlich). Quellcode-geprüft (v1.47.1): der Callback feuert NACH dem Wechsel
und dem Auto-Commit, sein Exit-Code blockiert nichts, und direkte Datei-Edits umgehen ihn —
er taugt als optionale Frühwarnung, nie als Gate. Das Gate bleibt die doneCheck-Quittung.

## Board

Backlog.md bringt eine Web-UI mit Drag-and-Drop-Board mit. `/weiter` startet sie beim Start
über `skills/weiter/scripts/board-starten.mjs` (deterministischer Port-Manager, siehe
`skills/weiter/SKILL.md` Schritt 4) als Hintergrundprozess und meldet die URL, unter der sie
erreichbar ist (`http://localhost:<port>`).

**Ein Board pro Repo, nicht pro Worktree:** Das Skript löst immer den Haupt-Worktree auf
(`git rev-parse --git-common-dir` → dessen Elternverzeichnis) — alle Worktrees eines Repos
landen so auf demselben Board, egal aus welchem Worktree `/weiter` läuft.

**Port:** deterministisch aus dem absoluten Haupt-Worktree-Pfad abgeleitet (Range
6421–6519), **nie** in `backlog/config.yml` persistiert — ein maschinenspezifischer Port in
einer git-getrackten Datei wäre auf anderen Rechnern falsch. Ein manuell gesetzter
`default_port` in der Projekt-`config.yml` wird als Override gelesen und respektiert, aber
vom Skript nie geschrieben.

**Cross-Worktree-Sichtbarkeit:** Damit das Ein-Repo-Board Task-Stände aus anderen Worktrees
zeigt, muss `checkActiveBranches: true` in `backlog/config.yml` stehen (Backlog.md liest
dafür Task-Zustände über aktive Branches hinweg, `checkActiveBranches`/`activeBranchDays`).
Verifiziert (Fork v1.47.1): `backlog init --defaults` schreibt diesen Schlüssel bereits
standardmäßig als `true` — `/setup` seedet ihn damit automatisch, ohne dass dieses Template
zusätzlich etwas erzwingen muss. Nur bei einer bestehenden, vor dieser Prüfung von Hand
editierten `config.yml` lohnt ein manueller Blick auf den Schlüssel.

**onStatusChange (nativ, mit klaren Grenzen):** Backlog.md kann bei Statuswechseln ein
Kommando ausführen (`backlog/config.yml`, Schlüssel `onStatusChange`; Übergabe als
Umgebungsvariablen `$TASK_ID`, `$OLD_STATUS`, `$NEW_STATUS`; läuft via `sh -c`, also nur
Mac/Linux verlässlich). Quellcode-geprüft (v1.47.1): der Callback feuert NACH dem Wechsel
und dem Auto-Commit, sein Exit-Code blockiert nichts, und direkte Datei-Edits umgehen ihn —
er taugt als optionale Frühwarnung, nie als Gate. Das Gate bleibt die doneCheck-Quittung.

**DoD-Defaults pro Task:** Backlog.md erlaubt, eine Definition-of-Done pro Task zu hinterlegen
(Default-Kriterien, die jede neue Task mitbekommt) — darüber lassen sich QA-/Security-Gates
erzwingen, statt sich auf reine Konvention zu verlassen.

## Übersicht exportieren/abfragen

Wenn ein Skill (z. B. `/status --export`) eine Board-Übersicht braucht, ohne selbst einen
Renderer zu bauen: `backlog board export --plain` ausführen und den rohen Output unverändert
übernehmen. Das ist der native Board-Export der CLI — kein Board-Eigenbau des Plugins.

## Diagramme

Backlog.md rendert Mermaid-Blöcke in Task-Beschreibungen nativ als Bild (Web-UI;
verifiziert mit v1.47.1 — ältere Installationen vorher aktualisieren). Die Link-Zeile
„Ablauf als Bild: <Link>" ist im Ticket deshalb optional; der Skill `diagramm` erzeugt den
Link, wo er gebraucht wird (z. B. für den Gate-Moment im Chat).

## Wayfinding-Operationen

Genutzt von `/erkunden`. Die **Karte** ist eine Task mit Label `wayfinder:map`; ihre
**Klärungsfragen** sind Tasks mit Label `wayfinder:<typ>` und Dependencies auf ihre Blocker.
Karten-Einträge stehen NIE im Status `Ready for Agent` — der Auto-Lauf und das Bau-Board
fassen sie nie an. Status-Zuordnung: offen = `Needs Info`, beansprucht = `In Progress`,
geklärt = `Done`.

- **Karte**: `backlog task create "Karte: <Vorhaben>" --description "<body>" -l wayfinder:map -s "Needs Info" --plain`
  — der Titel trägt das Präfix „Karte: ", damit die Needs-Info-Spalte lesbar bleibt.
- **Klärungsfrage**: `backlog task create "<Frage als Titel>" --description "<frage>" -l wayfinder:<typ> -s "Needs Info" --dep <blocker-id> --plain`
  (`--dep` mehrfach oder kommasepariert; Typ englisch: `research`/`prototype`/`grilling`/`task`).
- **Blockierung**: die Task-Dependencies (`--dep`). Achtung: Backlog.md prüft nur Existenz,
  keinen Zyklus — Ketten prüft das Plugin selbst (siehe „Abhängigkeiten" oben).
- **Frontier-Abfrage**: `backlog task list --plain` listet alle Tasks; unblockiert ist eine
  Klärungsfrage, wenn jede ihrer Dependencies (Frontmatter, `backlog task <id> --plain`) im
  Terminal-Status (`Done`) steht — das leitet das Plugin selbst ab. Beanspruchte (Assignee
  gesetzt) überspringen; die erste unblockierte, unbeanspruchte gewinnt.
- **Claim**: `backlog task edit <id> -a <name> -s "In Progress" --plain` — der erste
  Schreibzugriff der Session. Gleiches Nicht-atomar-Caveat wie beim Ticket-Claim
  (`references/multi-dev.md`; Backlog.md ist ohnehin solo-only).
- **Auflösen**: die Antwort als Datei-Nachtrag an die Task-Datei anhängen (Überschrift
  `## Antwort`), dann `backlog task edit <id> -s Done --plain`, dann ein Einzeiler (Titel,
  Kern der Antwort) an „Bisher entschieden" der Karten-Task (Datei-Nachtrag).
- **Erkundungs-Ansicht** (getrennt vom Bau-Fluss): die Needs-Info-Spalte des Boards —
  Karten-Einträge erkennbar am Titel-Präfix „Karte: " und den `wayfinder:*`-Labels — bzw.
  `backlog task list -s "Needs Info" --plain` im Terminal.
