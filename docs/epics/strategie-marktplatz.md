## Strategie-Marktplatz — Vorlagen veröffentlichen, entdecken und kopieren (Sichtbarkeits-MVP)

### Beschreibung

Wir bauen einen Marktplatz, auf dem erfahrene Vault-Betreiber ihre Automations-Logik
als **unveränderliche Vorlage** veröffentlichen. Andere Nutzer entdecken diese Vorlagen,
sehen die **über alle Kopien aggregierte Performance** (ROI, Anzahl Kopien, Total Value)
und können eine Vorlage in einen **eigenen Vault kopieren** — wobei sie nur die vom
Ersteller freigegebenen Node-Inputs (z. B. Beträge, Token) anpassen können. Die
Graph-Struktur und alle nicht freigegebenen Werte bleiben fix.

Der Anreiz für Ersteller ist in dieser ersten Iteration **Sichtbarkeit und Reputation**
(keine Gebühren, kein Revenue-Share). Immutabilität wird **UI-seitig** garantiert (kein
On-Chain-Beweis nötig). Das Epic umfasst vier aufeinander aufbauende User Stories:
Veröffentlichen → Durchstöbern → Detail → Kopieren.

**Explizit out of scope (erste Iteration):** Versionierung von Vorlagen, Gebühren/
Revenue-Share, Ratings/Reviews, Moderation, On-Chain-Immutabilitätsbeweis,
Performance des Original-Vaults als eigene Kennzahl.

### Problemdefinition

**Welches Kundenproblem lösen wir?**

Heute existiert wertvolle, funktionierende Automations-Logik isoliert in einzelnen Vaults.
Es gibt **keinen Weg, eine bewährte Strategie sichtbar zu teilen oder nachzunutzen**, ohne
die Logik offenzulegen und damit das Risiko einzugehen, dass sie unkontrolliert verändert
wird. Gleichzeitig müssen weniger erfahrene Nutzer jede Strategie **von Grund auf selbst
bauen** und die zugrunde liegende DeFi-Mechanik vollständig verstehen — eine hohe
Einstiegshürde, die Nachnutzung praktisch verhindert. Es fehlt außerdem eine
**vergleichbare, datenbasierte Entscheidungsgrundlage**, welche Strategien sich in der
Praxis bewährt haben.

**Für wen lösen wir dieses Problem?**

- **Strategie-Ersteller** — erfahrene Vault-Betreiber, die eine funktionierende
  Automations-Logik aufgebaut haben und sie sichtbar teilen wollen, um Reputation
  aufzubauen, ohne ihre Logik veränderbar zu machen.
- **Strategie-Nutzer** — Personen, die nicht selbst Automations bauen wollen, sondern
  bewährte Strategien suchen, vergleichen und für sich übernehmen möchten, ohne die
  zugrunde liegende Logik verstehen zu müssen.

### Ergebnisziele

1. **Erstellerinhalt aufbauen:** Ersteller können einen eigenen Vault als unveränderliche
   Vorlage mit freigegebenen Parametern veröffentlichen — messbar an der **Anzahl
   veröffentlichter Vorlagen** im Marktplatz.
2. **Entdeckbarkeit herstellen:** Nutzer finden, vergleichen und filtern Vorlagen anhand
   einer aggregierten Performance — messbar an **Marktplatz-Aufrufen** und **Detail-Klicks
   pro Vorlage**.
3. **Nachnutzung ermöglichen:** Nutzer kopieren eine Vorlage in einen eigenen Vault, ohne
   die Logik zu verändern — messbar an der **Anzahl erstellter Kopien** und der
   **Conversion Detailansicht → abgeschlossene Kopie**.
4. **Logik-Schutz garantieren:** Eine veröffentlichte Vorlage ist nachweislich
   unveränderlich (Snapshot) und nur freigegebene Parameter sind editierbar — messbar an
   **null erfolgreichen Logik-Mutationen** an Vorlagen/Kopien (Testabdeckung + Auditfälle).

### Hypothesen

1. **Hypothese 1:** Sichtbarkeit/Reputation allein (ohne monetären Anreiz) genügt, um
   Ersteller zur Veröffentlichung zu bewegen — wenn dem so ist, entstehen in den ersten
   Wochen veröffentlichte Vorlagen ohne Gebührenmodell.
2. **Hypothese 2:** Die aggregierte Performance über Kopien (ROI, Anzahl Kopien,
   Total Value) ist eine ausreichende Entscheidungsgrundlage — Nutzer kopieren bevorzugt
   Vorlagen mit sichtbarer Performance gegenüber solchen ohne Daten.
3. **Hypothese 3:** Das Freigeben einzelner Node-Inputs (statt freier Bearbeitung) senkt
   die Einstiegshürde genug, dass auch Nutzer ohne Automations-Erfahrung erfolgreich eine
   Strategie übernehmen — messbar an einer hohen Abschlussquote im Kopier-Flow.
4. **Hypothese 4:** UI-seitige Immutabilität wird vom Markt in dieser Iteration als
   ausreichend akzeptiert; ein On-Chain-Beweis ist (noch) keine Voraussetzung für Vertrauen.

### Discovery-Plan

- **One Pager — Wonder & Explore:** _Dokument vorhanden — Link bitte ergänzen_
- **Live Feature Document — Make & Impact:** _Dokument vorhanden — Link bitte ergänzen_

### Team und Verantwortlichkeiten

| Rolle | Person |
|-------|--------|
| Produktmanager | _Platzhalter — Name eintragen_ |
| Designer | _Platzhalter — Name eintragen_ |
| Entwickler | _Platzhalter — Name(n) eintragen_ |
| QA | _Platzhalter — Name eintragen_ |
| Weitere Rollen | _Platzhalter (z. B. Security/Audit-Ansprechpartner) — Name eintragen_ |

### Erfolgskriterien

1. **Veröffentlichte Vorlagen:** Anzahl im Marktplatz sichtbarer, nicht zurückgezogener
   Vorlagen (Zielwert in der Discovery festzulegen).
2. **Erstellte Kopien:** Gesamtzahl der über den Kopier-Flow erzeugten, einer Vorlage
   zugeordneten Vaults.
3. **Kopier-Conversion:** Anteil der Detailansichten, die in einer abgeschlossenen Kopie
   enden (Detail → Kopie).
4. **Performance-Sichtbarkeit:** Anteil der Vorlagen mit ≥ 1 Kopie, für die eine korrekte
   aggregierte Kennzahl (ROI, Anzahl Kopien, Total Value) angezeigt wird.
5. **Logik-Integrität:** 100 % der freigegebenen Parameter sind editierbar **und** 0 % der
   nicht freigegebenen Inputs / der Graph-Struktur sind veränderbar (durch Tests
   abgesichert).
6. **Aggregat-Korrektheit:** Die angezeigte Aggregat-Kennzahl stimmt mit den zugrunde
   liegenden Kopie-Daten überein (verifiziert gegen die Aggregations-/Indexer-Quelle).

### Stakeholder

- **Hauptstakeholder:**
  - **Product Owner** — Roadmap-Priorisierung und Abnahme des MVP.
  - **Gründung / Business** — Reputation & Wachstum als strategisches Ziel des Marktplatzes.
  - **Security / Audit** — Abnahme der Snapshot-/Kopier-Mechanik (neue Vaults, Immutabilität).
  - **Community / Ersteller (Early Adopter)** — erste Vault-Betreiber, die Strategien
    veröffentlichen.
- **Kommunikationsplan:**
  - Product Owner: laufend im Sprint-Review, Abnahme pro Story.
  - Gründung/Business: Meilenstein-Updates (erste Veröffentlichung, erste Kopie, MVP-Launch).
  - Security/Audit: dediziertes Review vor Launch von Story 1 (Snapshot) und Story 4 (Kopie/
    Vault-Erzeugung).
  - Community/Ersteller: gezieltes Onboarding ausgewählter Early Adopter zur Befüllung des
    Marktplatzes nach Story 1.

### Risikobewertung

#### Zuverlässigkeit (Reliability)

**Risiko:** Die **Snapshot-Unveränderlichkeit** bricht — spätere Änderungen am Original-Vault
verändern eine bereits veröffentlichte Vorlage, oder beim Kopieren entsteht eine vom
Snapshot abweichende Logik. Ebenso kritisch: eine **fehlerhafte Kopie-Zuordnung**, die die
aggregierte Performance verfälscht.

**Maßnahmen zur Minderung:**
- Vorlage als entkoppelter, unveränderlicher Snapshot speichern (kein Live-Verweis auf den
  Original-Vault); durch Test absichern, dass Änderungen am Original die Vorlage nicht ändern.
- Eigentums-Prüfung testen (nur eigene Vaults veröffentlichbar) und Read-only-Garantie der
  Logik-Vorschau verifizieren.
- Jede Kopie eindeutig und nachprüfbar der Vorlage zuordnen; Zuordnung gegen die
  Aggregations-Quelle abgleichen.

#### Skalierbarkeit (Scalability)

**Risiko:** Mit wachsender Zahl an Vorlagen und Kopien wird die **Performance-Aggregation
über alle Kopien** zum Engpass (Listen- und Detailansicht müssen viele Kopien je Vorlage
zusammenfassen).

**Maßnahmen zur Minderung:**
- Performance-Aggregation als eigenen technischen Enabler führen (von Story 2 und 3 genutzt)
  und auf wachsende Kopie-Zahlen auslegen (Vorberechnung/Caching statt Live-Vollscan).
- Marktplatz-Liste paginier-/sortierbar gestalten, sodass die Anzeige nicht mit der
  Gesamtzahl der Vorlagen linear teurer wird.
- Aggregation auf die vorhandene Indexer-/Aggregations-Quelle stützen statt auf Ad-hoc-
  Berechnung pro Seitenaufruf.

#### Leistung (Performance)

**Risiko:** Marktplatz-Übersicht und Detailansicht laden langsam, weil Kennzahlen erst zur
Anzeigezeit berechnet werden; der Kopier-Flow fühlt sich durch Validierung und
Vault-Erzeugung träge an.

**Maßnahmen zur Minderung:**
- Aggregat-Kennzahlen vorberechnen/cachen und mit klar definierter Aktualität ausliefern.
- Leer-/Null-Kopien-Zustände ohne teure Berechnung kennzeichnen („Noch keine
  Performance-Daten").
- Im Kopier-Flow nur die freigegebenen Felder rendern und typgerecht clientseitig
  validieren, bevor die (teurere) Vault-Erzeugung ausgelöst wird.

#### Wartbarkeit (Maintainability)

**Risiko:** Das **Veröffentlichungs- und Kopier-Datenmodell** (Snapshot + Parameter-
Definition) ist zweiseitig und kann auseinanderdriften — markierte Parameter passen nicht
mehr zum Snapshot, Typ-Informationen gehen verloren, Sonderfälle häufen sich.

**Maßnahmen zur Minderung:**
- Snapshot- und Parameter-Datenmodell **gemeinsam designen** (Story 1 und Story 4 als zwei
  Seiten derselben Medaille), aber getrennt umsetzen.
- Parameter-Typen (Token-Auswahl vs. Betrag o. ä.) zentral und schemagetrieben abbilden,
  passend zum jeweiligen Node-Input, statt pro Sonderfall.
- Hilfetext/Dokumentation für „Parameter freigeben" pflegen; Code-Review (≥ 1 Entwickler)
  und Tests pro Story als feste Done-Kriterien.

### Anpassungsstrategie

- **Überprüfungspunkte:** Nach jeder der vier Stories (Veröffentlichen, Durchstöbern,
  Detail, Kopieren) sowie im jeweiligen Sprint-Review. Story 3 und 4 werden erst nach
  Vorliegen erster Kopien fachlich final bewertet (Performance-Aggregation wird dann real
  sichtbar).
- **Anpassungskriterien:**
  - Bleibt der Erstellerinhalt aus (Hypothese 1 nicht bestätigt) → Anreizmodell überdenken
    (z. B. Gebühren/Revenue-Share aus dem Out-of-Scope nachziehen).
  - Ist die aggregierte Performance keine ausreichende Entscheidungsgrundlage (Hypothese 2)
    → Kennzahlen-Set überarbeiten (über ROI/Kopien/Total Value hinaus).
  - Bricht die Kopier-Conversion ein (Hypothese 3) → Kopier-Flow und Parameter-Freigabe
    vereinfachen.
  - Fordert der Markt einen Immutabilitätsbeweis (Hypothese 4 nicht bestätigt) →
    On-Chain-Nachweis aus dem Out-of-Scope priorisieren.

---

### Story-Übersicht (aus der Vorlage)

| # | Story | Persona | Kern-Wert | Abhängigkeit |
|---|-------|---------|-----------|--------------|
| 1 | Strategie veröffentlichen + Parameter freigeben | Ersteller | Sichtbarkeit, Logik-Schutz | — (Einstieg) |
| 2 | Marktplatz durchstöbern | Nutzer | Discovery | Story 1 + Aggregation |
| 3 | Detail mit aggregierter Performance | Nutzer | Entscheidungsgrundlage | Story 1, sinnvoll mit Kopien (Story 4) |
| 4 | Kopieren + parametrisieren | Nutzer | Nachnutzung | Story 1 (Snapshot/Parameter) |

> **Technischer Enabler:** Die **Performance-Aggregation über alle Kopien** wird von Story 2
> und 3 benötigt und von Story 4 gespeist. Bei nennenswertem Aufwand als eigene technische
> Story/Task führen — aus Nutzersicht bleibt sie Teil von 2/3.

> **Design-Kopplung:** Story 1 (Veröffentlichen) und Story 4 (Kopieren) teilen sich das
> Datenmodell (Snapshot + Parameter-Definition) — gemeinsam designen, getrennt umsetzen.

### Getroffene Entscheidungen (aus der Vorlage übernommen)

1. **Performance-Kennzahlen:** ROI, Anzahl Kopien, Total Value — bestätigt.
2. **Story 1 bleibt ungesplittet:** Snapshot-Veröffentlichung und Parameter-Freigabe bilden
   eine gemeinsame Story.
3. **Anreizmodell:** Sichtbarkeit/Reputation, keine Gebühren/Revenue-Share (erste Iteration).
4. **Immutabilität:** nur UI, kein On-Chain-Beweis.
