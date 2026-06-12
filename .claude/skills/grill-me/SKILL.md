---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Two modes - quick (5-7 questions for a PR-sized change) and deep (15+ recursive questions for a new capability). Use when user wants to stress-test a plan, get grilled on their design, before writing a spec, or mentions "grill me".
---

# Grill Me

Befrage den Plan systematisch, bis Nutzer und Agent ein gemeinsames Verstaendnis haben. Ziehe offene Fragen in die Klaerung, BEVOR die Spec geschrieben wird, statt sie spaeter im Code zu entdecken.

Wenn eine Frage durch Erkunden der Codebase beantwortet werden kann, erkunde die Codebase statt zu fragen.

## Modus waehlen

- **quick** (Default, ~5 Min): 5 bis 7 Fragen. Fuer einen PR-grossen Change. Fokus auf Scope, Acceptance Criteria und Konflikte mit bestehenden Specs.
- **deep** (~15 bis 30 Min): 15+ rekursive Fragen. Fuer eine neue Capability oder Architekturentscheidung. Fokus auf Problem, Scope, Non-Goals, Erfolgskriterien, Constraints und Risiken.

Frage den Nutzer zu Beginn, welcher Modus, wenn unklar. Bei Contract-relevanten Themen immer deep.

## Vorgehen

1. Stelle EINE Frage nach der anderen. Nicht mehrere auf einmal.
2. Gehe jeden Ast des Design-Baums durch. Wenn eine Antwort eine neue Entscheidung aufmacht, verfolge sie, bevor du zum naechsten Ast gehst.
3. Loese Abhaengigkeiten zwischen Entscheidungen einzeln auf.
4. Decke mindestens ab: Was genau ist das Problem? Was ist explizit NICHT im Scope? Woran erkennen wir Erfolg (messbar)? Welche Edge Cases (leere Eingabe, Fehlerfall, Nebenlaeufigkeit, doppelte Ausfuehrung)? Welche Annahmen treffen wir? Welche bestehenden Specs koennten in Konflikt geraten?
5. Wenn ein gemeinsames Verstaendnis steht, fasse die geklaerten Punkte als kurze Liste zusammen, die direkt in die Spec wandern kann.

## Anti-Patterns

- Nicht mehrere Fragen in einer Nachricht buendeln.
- Nicht raten, wenn die Codebase die Antwort hat.
- Nicht aufhoeren, bevor Non-Goals und Erfolgskriterien klar sind.
- Bei trivialen Aenderungen gar nicht erst grillen, das ist Overhead.
