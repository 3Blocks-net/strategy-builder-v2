# Epic: Strategie-Marktplatz (Sichtbarkeits-MVP)

Ein Ersteller veröffentlicht seine Vault-Logik als Vorlage, andere finden sie im
Marktplatz, sehen die aggregierte Performance der bisherigen Kopien und können sie
mit eigenen Parametern kopieren — ohne die Logik verändern zu können.

## Scope-Annahmen (erste Iteration)

- Anreiz für Ersteller = **Sichtbarkeit/Reputation** (keine Gebühren, kein Revenue-Share)
- Editierbare Parameter = **vom Ersteller markierte Node-Inputs mit Default**; alles andere fix
- Performance = **aggregiert über alle Kopien**; Original kann reine Vorlage sein (muss nicht laufen)
- Performance-Kennzahlen (bestätigt) = **ROI**, **Anzahl Kopien**, **Total Value**
- Immutabilität = **nur UI** (kein On-Chain-Beweis nötig)
- **Out of scope:** Versionierung, Gebühren/Revenue-Share, Ratings/Reviews, Moderation

## Abhängigkeitsreihenfolge

Story 1 (Veröffentlichen) → Story 2 (Durchstöbern) → Story 3 (Detail) → Story 4 (Kopieren).
Story 3 + 4 sind erst wirklich wertvoll, sobald Kopien existieren (Performance-Aggregation).

| # | Story | Persona | Kern-Wert |
|---|-------|---------|-----------|
| 1 | Strategie veröffentlichen + Parameter freigeben | Ersteller | Sichtbarkeit, Logik-Schutz |
| 2 | Marktplatz durchstöbern | Nutzer | Discovery |
| 3 | Detail mit aggregierter Performance | Nutzer | Entscheidungsgrundlage |
| 4 | Kopieren + parametrisieren | Nutzer | Nachnutzung |

---

## Story 1 — Meine Strategie als Vorlage veröffentlichen und Parameter freigeben

### Beschreibung

**WHO:** Als **Strategie-Ersteller** (erfahrener Vault-Betreiber, der eine funktionierende
Automations-Logik aufgebaut hat und sie sichtbar teilen will, um Reputation aufzubauen)

**WHAT:** möchte ich einen meiner Vaults samt seiner kompletten Automations als
Marktplatz-Vorlage veröffentlichen und dabei festlegen, welche einzelnen Node-Inputs
(z. B. Beträge oder Token) ein Kopierer anpassen darf

**WHY:** damit andere meine Strategie nachnutzen können, ohne die Logik verändern zu
können, und ich für meine Strategie sichtbar werde

### Akzeptanzkriterien (Confirmation)

- [ ] Der Ersteller kann ausschließlich **eigene** Vaults zur Veröffentlichung auswählen
- [ ] Beim Veröffentlichen kann er **Titel** und **Beschreibung** angeben (Pflichtfelder)
- [ ] Der Ersteller kann **einzelne Node-Inputs** als „editierbaren Parameter" markieren;
      pro Parameter werden **Label** und **Default-Wert** erfasst
- [ ] Nicht markierte Inputs sowie die gesamte Graph-Struktur werden als **Festwerte** in
      die Vorlage übernommen und sind später nicht editierbar
- [ ] Pro Parameter wird der **Typ** berücksichtigt (z. B. Token-Auswahl vs. Betrag),
      passend zum jeweiligen Node-Input
- [ ] Die Vorlage wird als **unveränderlicher Snapshot** des Automation-Graphen gespeichert
      (spätere Änderungen am Original-Vault verändern eine bereits veröffentlichte Vorlage nicht)
- [ ] Ein Vault kann **auch ohne aktive/finanzierte Automation** als reine Vorlage veröffentlicht werden
- [ ] Nach erfolgreicher Veröffentlichung erscheint die Vorlage im Marktplatz und ist für
      andere Nutzer sichtbar
- [ ] Der Ersteller kann eine Veröffentlichung wieder **zurückziehen** (sie verschwindet aus dem Marktplatz)

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Ja | Veröffentlichen funktioniert eigenständig — Marktplatz-Anzeige (Story 2) ist nur Konsument des Ergebnisses, nicht Voraussetzung. |
| **N**egotiable | Ja | Offen verhandelbar: ob Wertebereiche/Validierung pro Parameter, ob Unpublish, ob Vorschau-Schritt. |
| **V**aluable | Ja | Der Ersteller gewinnt Sichtbarkeit; ohne diese Story gibt es keinen Marktplatz-Inhalt. |
| **E**stimable | Teilweise | Der Parameter-Markierungs-Mechanismus („ähnlich Context, offchain") muss vor Schätzung noch konkretisiert werden (welche Node-Inputs markierbar sind). |
| **S**mall | Teilweise | Snapshot + Parameter-Markierung sind zwei Themen. **Entscheidung: nicht splitten** — bleibt eine Story, da Snapshot und Parameter-Freigabe gemeinsam getestet werden müssen. |
| **T**estable | Ja | Kriterien sind überprüfbar (nur eigene Vaults, Snapshot unveränderlich, markierte vs. fixe Inputs). |

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Snapshot-Unveränderlichkeit ist durch einen Test abgesichert (Änderung am Original ändert die Vorlage nicht)
- [ ] Eigentums-Prüfung getestet (fremde Vaults nicht veröffentlichbar)
- [ ] Dokumentation/Hilfetext für „Parameter freigeben" vorhanden
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 2 — Den Marktplatz nach Strategien durchstöbern

### Beschreibung

**WHO:** Als **Strategie-Nutzer** (jemand, der nicht selbst Automations bauen will, sondern
bewährte Strategien sucht, um sie zu übernehmen)

**WHAT:** möchte ich eine Übersicht aller veröffentlichten Strategie-Vorlagen sehen — mit
Titel, Kurzbeschreibung und der **aggregierten Performance der bisherigen Kopien**

**WHY:** damit ich auf einen Blick erfolgversprechende Strategien erkennen und vergleichen kann

### Akzeptanzkriterien (Confirmation)

- [ ] Eine Marktplatz-Übersicht listet alle aktuell veröffentlichten Vorlagen
- [ ] Pro Eintrag werden **Titel, Kurzbeschreibung und Ersteller** angezeigt
- [ ] Pro Eintrag wird die **aggregierte Performance über alle Kopien** angezeigt:
      **ROI**, **Anzahl Kopien** und **Total Value**
- [ ] Vorlagen **ohne bisherige Kopien** werden klar gekennzeichnet (z. B. „Noch keine Performance-Daten")
- [ ] Die Liste ist **durchsuch-/filterbar oder sortierbar** (mindestens nach Performance oder Anzahl Kopien)
- [ ] Ein Klick auf einen Eintrag öffnet die Detailansicht (Story 3)
- [ ] Zurückgezogene Vorlagen erscheinen **nicht** in der Liste

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Nein | Hängt von Story 1 (Inhalt) und von der Performance-Aggregation (gespeist durch Story 4) ab. Liste ist ohne Vorlagen leer. |
| **N**egotiable | Ja | Sortier-/Filterumfang, welche Kennzahl prominent ist, Karten- vs. Tabellen-Layout sind verhandelbar. |
| **V**aluable | Ja | Discovery ist der Kern des Marktplatz-Nutzens für den Suchenden. |
| **E**stimable | Ja | Klarer Umfang; Performance kommt aus vorhandener Indexer-/Aggregations-Quelle. |
| **S**mall | Ja | Eine Listenansicht — gut in eine Iteration passend. |
| **T**estable | Ja | Sichtbarkeit, Aggregat-Anzeige, Leer-Kennzeichnung, Ausblenden zurückgezogener Vorlagen sind prüfbar. |

> **Hinweis:** Die **Performance-Aggregation** selbst ist ein technischer Enabler, der von
> Story 2 und 3 gebraucht wird. Wenn sie nennenswerten Aufwand hat, als eigene
> technische Story/Task führen — aus User-Sicht bleibt sie aber Teil von 2/3.

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Leerzustände getestet (keine Vorlagen / keine Kopien)
- [ ] Aggregat-Kennzahl gegen die zugrunde liegenden Kopie-Daten verifiziert
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 3 — Strategie-Detail mit aggregierter Performance ansehen

### Beschreibung

**WHO:** Als **Strategie-Nutzer**, der eine konkrete Vorlage in die engere Wahl genommen hat

**WHAT:** möchte ich eine Detailansicht einer Vorlage sehen — mit der aggregierten Performance
aller Kopien und einer Vorschau, welche Parameter ich beim Kopieren anpassen kann

**WHY:** damit ich vor dem Kopieren fundiert einschätzen kann, ob und wie die Strategie zu mir passt

### Akzeptanzkriterien (Confirmation)

- [ ] Die Detailansicht zeigt **Titel, vollständige Beschreibung und Ersteller**
- [ ] Sie zeigt die **aggregierte Performance über alle Kopien** mit den Kennzahlen
      **ROI**, **Anzahl Kopien** und **Total Value** (Gesamtwert aller Kopien)
- [ ] Der Bezugsrahmen der Kennzahl ist klar ausgewiesen („aggregiert über N Kopien", **nicht**
      Performance des Original-Vaults)
- [ ] Eine **Vorschau der Strategie-Logik** ist sichtbar (mindestens: welche Schritte/Protokolle
      enthalten sind) — als read-only, **kein Editor**
- [ ] Es ist klar erkennbar, **welche Parameter editierbar** sind (Label + Default) und dass
      alles Übrige fix ist
- [ ] Bei **null Kopien** wird statt Performance ein klarer Hinweis angezeigt
- [ ] Ein Call-to-Action führt zum Kopier-Flow (Story 4)

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Nein | Braucht veröffentlichte Vorlagen (Story 1) und für sinnvolle Performance vorhandene Kopien (Story 4). |
| **N**egotiable | Ja | Konkrete Kennzahlen, Tiefe der Logik-Vorschau, Layout sind offen. |
| **V**aluable | Ja | Entscheidungsgrundlage vor dem Kopieren — direkter Nutzerwert. |
| **E**stimable | Ja | Kennzahlen sind festgelegt (ROI, Anzahl Kopien, Total Value); klarer Umfang. |
| **S**mall | Ja | Eine Detailseite; überschaubar. |
| **T**estable | Ja | Anzeige-Inhalte, Read-only-Verhalten, Null-Kopien-Fall sind prüfbar. |

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Read-only-Garantie der Logik-Vorschau getestet (kein Bearbeiten möglich)
- [ ] Performance-Bezug („aggregiert über Kopien") fachlich abgenommen
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Story 4 — Eine Strategie kopieren und mit eigenen Parametern übernehmen

### Beschreibung

**WHO:** Als **Strategie-Nutzer**, der sich für eine Vorlage entschieden hat

**WHAT:** möchte ich die Vorlage in einen eigenen Vault kopieren und dabei nur die vom
Ersteller freigegebenen Parameter (Beträge, Token o. ä.) mit meinen Werten füllen

**WHY:** damit ich eine bewährte Strategie für mich nutzen kann, ohne sie selbst aufbauen oder
ihre Logik verstehen zu müssen

### Akzeptanzkriterien (Confirmation)

- [ ] Aus der Detailansicht kann der Nutzer den Kopier-Flow starten
- [ ] Im Kopier-Flow werden **ausschließlich die freigegebenen Parameter** als Eingabefelder
      angezeigt, jeweils mit dem Default des Erstellers vorbelegt
- [ ] Die **restliche Logik (Graph + Festwerte) ist nicht editierbar** und in der UI nicht veränderbar
- [ ] Eingaben werden **typgerecht validiert** (z. B. gültige Token-Auswahl, positiver Betrag),
      bevor kopiert werden kann
- [ ] Beim Abschluss entsteht ein **neuer, dem Nutzer gehörender Vault** mit der identischen
      Automation-Logik der Vorlage und den eingesetzten Parametern
- [ ] Die Kopie wird der Vorlage zugeordnet, sodass sie in die **aggregierte Performance**
      (Story 2/3) einfließt
- [ ] Der kopierte Vault erscheint anschließend in der normalen Vault-Übersicht des Nutzers

### INVEST-Check

| Kriterium | Erfüllt | Begründung |
|-----------|---------|------------|
| **I**ndependent | Nein | Setzt eine veröffentlichte Vorlage mit Parametern (Story 1) voraus. |
| **N**egotiable | Ja | Validierungstiefe, ob direkt deployed oder als Entwurf, Bestätigungsschritte sind verhandelbar. |
| **V**aluable | Ja | Das ist der eigentliche Endnutzen des Marktplatzes für den Nutzer. |
| **E**stimable | Teilweise | Abhängig von der in Story 1 gewählten Parameter-/Snapshot-Mechanik (gemeinsame Vorklärung nötig). |
| **S**mall | Teilweise | Parameter-Substitution + Vault-Erzeugung + Zuordnung zur Vorlage; ggf. an der Kopie-Zuordnung trennbar. |
| **T**estable | Ja | Nur freigegebene Felder editierbar, Logik fix, Kopie korrekt erzeugt und zugeordnet — alles prüfbar. |

> **Empfehlung:** Eng mit Story 1 abstimmen — Veröffentlichungs- und Kopier-Datenmodell
> (Snapshot + Parameter-Definition) sind zwei Seiten derselben Medaille und sollten gemeinsam
> designt, aber getrennt umgesetzt werden.

### Definition of Done

- [ ] Alle Akzeptanzkriterien sind getestet und erfüllt
- [ ] Code-Review durch mindestens 1 Entwickler erfolgt
- [ ] Test: nur freigegebene Parameter sind veränderbar, Logik bleibt identisch zur Vorlage
- [ ] Test: Kopie wird korrekt der Vorlage für die Performance-Aggregation zugeordnet
- [ ] Validierung ungültiger Parameter-Eingaben getestet
- [ ] Keine offenen Blocker oder Abhängigkeiten

---

## Getroffene Entscheidungen

1. **Performance-Kennzahlen** (Story 2/3): **ROI**, **Anzahl Kopien**, **Total Value** — bestätigt.
2. **Story 1 bleibt ungesplittet** — Snapshot-Veröffentlichung und Parameter-Freigabe bilden eine
   gemeinsame Story.
