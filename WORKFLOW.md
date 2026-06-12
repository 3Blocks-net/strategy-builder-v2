# WORKFLOW.md

Der genaue Ablauf pro Feature, von der Idee bis Produktion. Alle Befehle laufen in einer Claude-Code-Session, außer den `openspec`-CLI-Befehlen, die du auch direkt im Terminal nutzen kannst.

Zwei Sorten Befehle:

- `/opsx:...` und Superpowers-Commands laufen über das Modell und erzeugen Inhalte.
- `openspec ...` (init, list, validate, archive) sind deterministisch, ohne Modell, für Struktur und Prüfung.

---

## Die acht Stufen

### 1. Epic anlegen

```
Beschreibe die Initiative. Die epic-builder-Skill erzeugt ein strukturiertes Epic
mit Problem, Zielen, Hypothesen und Erfolgsmetriken.
```

Gate: Mensch (Produktentscheidung). Mittelfristig legt hier die AI das Epic an.

### 2. Research (nur bei externer Abhängigkeit)

```
Beschreibe die externe Abhängigkeit (z.B. Zahlungsdienstleister).
Die research-Skill erzeugt research.md plus learning-tests.
```

research.md hat ein Verfallsdatum. Nach dem Feature löschen, sonst Code gegen veraltete APIs.

### 3. Klären

```
Lass uns das Feature durchdenken.
```

brainstorming liest die Codebase und schlägt Optionen mit Trade-offs vor. `grill-me` befragt den Plan, bis ein gemeinsames Verständnis steht. Gate: Mensch gibt die Design-Richtung frei.

### 4. Spec schreiben

```
/opsx:propose <change-name>
```

Erzeugt proposal.md, specs/ (mit Acceptance Criteria), design.md, tasks.md und ein ADR. Wenn du alle Planungsdokumente auf einmal willst statt schrittweise, nutze den Fast-Forward-Command. Gate: Mensch reviewt die Intent im PR.

### 5. In Slices schneiden (lokal)

```
Nutze die prd-to-issues-Skill, um die tasks.md in vertikale Tracer-Bullet-Slices
zu zerlegen. Die Slices bleiben lokal in der tasks.md, nicht in Linear.
```

Jeder Slice wird als HITL oder AFK markiert:

- AFK (Away From Keyboard): kann ohne Menschen implementiert und gemergt werden. Der Loop darf das.
- HITL (Human In The Loop): braucht eine menschliche Entscheidung oder ein Review.

Gate: Mensch prüft Schnitt und Tagging.

### 6. Bauen (TDD)

```
/opsx:apply
```

Arbeitet die tasks.md ab. Pro Slice: RED (fehlschlagender Test), GREEN (minimaler Code), REFACTOR. Eine vertikale Schicht nach der anderen, nie alle Tests zuerst. Gate: Tests grün (automatisch).

### 7. Review

```
starte review
```

Das code-review-Skill prüft den Diff über spezialisierte Sub-Agents (code, security, architecture, tests). Liefert Severity-Buckets und ein Merge-Verdict. Gate: Verdict automatisch, plus Mensch bei HITL.

### 8. Archivieren

```
/opsx:archive <change-name>
```

Synchronisiert die Delta-Specs zurück in die Haupt-Specs. Die Wissensbasis ist aktuell für den nächsten Change.

Zusätzlich vor dem Merge, deterministisch:

```
openspec validate
```

Diesen Schritt auch in die CI einbauen, damit keine schwachen Spec-Dateien ins Repo kommen.

---

## Seiteneingang: Bug

```
Beschreibe den Bug. Die triage-issue-Skill findet die Root Cause und erzeugt
eine lokale Issue-Datei mit TDD-Fix-Plan.
```

Mündet danach in Stufe 6.

---

## Beispiel: Aufgaben-Endpoint

Ein bewusst kleines Feature zum Durchspielen: ein Endpoint, der eine Aufgabe anlegt (Titel Pflicht, max. 100 Zeichen).

1. Epic: "Aufgabenverwaltung", Ziel "Nutzer koennen Aufgaben anlegen und abrufen".
2. Research: entfaellt, keine externe Abhaengigkeit.
3. Klaeren: brainstorming liest die Codebase, grill fragt nach leerem Titel, zu langem Titel, Antwortformat, doppelter Anlage.
4. Spec: `/opsx:propose create-task-endpoint`, mit Acceptance Criteria und einem ADR zur Validierungs-Strategie.
5. Slicing: "Endpoint mit Validierung" als AFK (klar definiert, mit Tests verifizierbar). Falls eine Architekturentscheidung noetig waere, als HITL.
6. Build: per TDD, erst der Test "leerer Titel wird abgelehnt", dann der Code.
7. Review: code-review prueft Validierung und Tests, Verdict.
8. Archive: die Spec wird Teil der Wissensbasis.

## Der Weg zur Autonomie

Heute fährst du alle Gates manuell. Das ist gewollt, du lernst dabei, wo der Agent ohne Aufsicht falsch abbiegt.

Erst wenn ein AFK-Slice mehrfach sauber durch die Stufen 6 bis 8 gelaufen ist, lockerst du das erste Gate. Mittelfristig läuft der Loop autonom über die AFK-Slices, HITL-Slices bleiben bei dir.

Fang an einem unkritischen, gut getesteten Modul an.
