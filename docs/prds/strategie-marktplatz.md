# PRD — Strategie-Marktplatz (Sichtbarkeits-MVP)

> Quelle: `docs/epics/strategie-marktplatz.md`. Dieses PRD konkretisiert das Epic
> in eine umsetzbare Spezifikation. Wo eine Entscheidung vom Epic abweicht, ist
> das ausdrücklich markiert (siehe **Abweichungen vom Epic**).

## Problem Statement

Heute lebt funktionierende Automations-Logik isoliert in einzelnen Vaults. Es gibt
keinen Weg, eine bewährte Strategie **sichtbar zu teilen oder nachzunutzen**, ohne
die Logik offenzulegen und dem Risiko auszusetzen, unkontrolliert verändert zu
werden. Gleichzeitig müssen weniger erfahrene Nutzer jede Strategie von Grund auf
selbst bauen und die zugrunde liegende DeFi-Mechanik vollständig verstehen — eine
hohe Einstiegshürde. Und es fehlt eine **vergleichbare, datenbasierte
Entscheidungsgrundlage**, welche Strategien sich in der Praxis bewährt haben.

Betroffen sind zwei Personas:

- **Strategie-Ersteller** — erfahrene Vault-Betreiber, die ihre Logik sichtbar
  teilen wollen (Reputation), ohne sie veränderbar zu machen.
- **Strategie-Nutzer** — Personen, die bewährte Strategien suchen, vergleichen und
  übernehmen wollen, ohne die zugrunde liegende Logik verstehen zu müssen.

## Solution

Ein **Marktplatz**, auf dem ein Ersteller einen **ganzen Vault** als
**unveränderliche Vorlage (Snapshot)** veröffentlicht. Aus Sicht der Personas:

- Der **Ersteller** wählt aus seinen deployten Automations aus (standardmäßig alle
  ausgewählt, einzelne abwählbar), markiert pro Feld, welche Node-Inputs für
  Kopierer **freigegeben** sind (mit Constraints, optionalem Label + Hinweis),
  vergibt Titel/Beschreibung und veröffentlicht. Der Snapshot ist vom
  Original-Vault entkoppelt — spätere Änderungen am Vault verändern die Vorlage
  nicht.
- Der **Nutzer** durchstöbert den Marktplatz (sortiert nach Performance,
  paginiert), öffnet eine Detailansicht mit **aggregierter Performance über alle
  Kopien** (kapitalgewichteter ROI, Anzahl Kopien, Total Value) und einer
  **read-only Graph-Vorschau**, und **kopiert** die Vorlage in einen **neuen
  eigenen Vault**. Im Kopier-Flow füllt er nur die freigegebenen Felder aus; die
  Graph-Struktur und alle nicht freigegebenen Werte bleiben fix.

Immutabilität wird **UI-seitig** garantiert (kein On-Chain-Beweis). Anreiz ist
**Sichtbarkeit/Reputation** — keine Gebühren, kein Revenue-Share. Zugang ist für
**jede authentifizierte Wallet** (SIWE).

## User Stories

### Veröffentlichen (Ersteller)

1. Als Ersteller möchte ich von meiner Vault-Detailseite aus „Als Vorlage
   veröffentlichen" starten können, damit ich meine bewährte Strategie sichtbar
   teilen kann.
2. Als Ersteller möchte ich nur **eigene** Vaults veröffentlichen können, damit
   niemand fremde Logik unter eigenem Namen anbietet.
3. Als Ersteller möchte ich eine Liste **aller** meiner Automations sehen
   (deployte **und** Drafts), bei der standardmäßig **alle ausgewählt** sind, damit
   ich schnell die komplette Vault-Logik teile.
4. Als Ersteller möchte ich einzelne Automations aus der Auswahl **abwählen**
   können — egal ob deployt oder Draft —, damit ich Logik, die ich nicht teilen
   will, ausschließen kann.
5. Als Ersteller möchte ich pro Node-Input-Feld festlegen können, ob es
   **freigegeben** (vom Kopierer editierbar) oder **fixiert** ist, damit ich
   steuere, was angepasst werden darf.
6. Als Ersteller möchte ich für ein freigegebenes Feld einen **Default-Wert**
   setzen können (der Snapshot-Wert als Vorschlag), damit Kopierer einen sinnvollen
   Startpunkt haben.
7. Als Ersteller möchte ich für ein freigegebenes **Beträge-Feld** optional
   **Min/Max-Grenzen** setzen können, damit Kopierer keine unsinnigen Werte wählen.
8. Als Ersteller möchte ich für ein freigegebenes **Token-Feld** entweder eine
   **konkrete Auswahl an Tokens** oder „**alle Tokens eines Protokolls**" zulassen
   können, damit die Token-Wahl des Kopierers innerhalb sinnvoller Grenzen bleibt.
9. Als Ersteller möchte ich den **Deposit-Token des Vaults** ebenfalls als
   freigebbaren Parameter behandeln können, damit Kopierer ihn (im erlaubten
   Rahmen) wählen oder den vorgegebenen übernehmen.
10. Als Ersteller möchte ich zeitbasierte Trigger-**Startzeiten** als freigebbaren
    Parameter behandeln können, damit der Kopierer den Startzeitpunkt selbst setzt.
11. Als Ersteller möchte ich jedem freigegebenen Feld optional ein **Label und
    einen Hinweistext** geben können (Fallback: Schema-Feldname), damit Kopierer
    verstehen, was sie eingeben.
12. Als Ersteller möchte ich **Titel und Beschreibung** der Vorlage vergeben,
    damit sie im Marktplatz auffindbar und verständlich ist.
13. Als Ersteller möchte ich vor der Veröffentlichung eine **Zusammenfassung**
    (gewählte Automations, freigegebene Felder, Constraints) sehen, damit ich
    keine ungewollten Felder freigebe.
14. Als Ersteller möchte ich, dass meine veröffentlichte Vorlage ein **entkoppelter
    Snapshot** ist, damit spätere Änderungen an meinem Vault sie nicht verändern.
15. Als Ersteller möchte ich eine Vorlage **zurückziehen** können, damit sie nicht
    mehr im Marktplatz gelistet wird (bestehende Kopien laufen weiter).

### Durchstöbern (Nutzer)

16. Als Nutzer möchte ich eine **Liste aller aktiven Vorlagen** sehen, damit ich
    einen Überblick über verfügbare Strategien bekomme.
17. Als Nutzer möchte ich pro Listeneintrag die **Kernkennzahlen** (ROI, Anzahl
    Kopien, Total Value) und den Ersteller sehen, damit ich schnell vergleichen
    kann.
18. Als Nutzer möchte ich die Liste **nach ROI, Anzahl Kopien und Total Value
    sortieren** können, damit ich die relevantesten Vorlagen zuerst sehe.
19. Als Nutzer möchte ich eine **paginierte** Liste, damit die Seite auch bei
    vielen Vorlagen schnell lädt.
20. Als Nutzer möchte ich bei Vorlagen ohne Kopien einen klaren
    **„Noch keine Performance-Daten"**-Zustand sehen, damit ich Daten nicht
    fehlinterpretiere.

### Detail (Nutzer)

21. Als Nutzer möchte ich auf der Detailseite die **aggregierte Performance über
    alle Kopien** (kapitalgewichteter ROI, Anzahl Kopien, Total Value) sehen, damit
    ich eine datenbasierte Entscheidung treffe.
22. Als Nutzer möchte ich eine **read-only Vorschau des/der Automations-Graphen**
    sehen, damit ich die Logik nachvollziehen kann, ohne sie verändern zu können.
23. Als Nutzer möchte ich sehen, **welche Felder freigegeben** sind (mit Label/
    Hinweis), damit ich weiß, was ich beim Kopieren anpassen kann.
24. Als Nutzer möchte ich Titel, Beschreibung und Ersteller der Vorlage sehen,
    damit ich Kontext und Reputation einschätzen kann.
25. Als Nutzer möchte ich von der Detailseite aus den **Kopier-Flow** starten,
    damit ich die Strategie übernehmen kann.

### Kopieren (Nutzer)

26. Als Nutzer möchte ich beim Kopieren nur die **freigegebenen Felder** ausfüllen,
    damit ich die Strategie ohne Logik-Verständnis übernehmen kann.
27. Als Nutzer möchte ich freigegebene Felder **mit dem Default vorbefüllt** sehen,
    damit ich sie nur bei Bedarf ändern muss.
28. Als Nutzer möchte ich bei einem freigegebenen Token-Feld nur aus der
    **erlaubten Token-Menge** wählen können, damit ich keine inkompatiblen Tokens
    auswähle.
29. Als Nutzer möchte ich bei einem freigegebenen Beträge-Feld eine **clientseitige
    Validierung** gegen die Constraints (Min/Max/Typ) bekommen, bevor ich
    Transaktionen auslöse.
30. Als Nutzer möchte ich, dass das Kopieren **immer einen neuen Vault** erzeugt,
    damit meine Kopie sauber von anderen Aktivitäten getrennt ist.
31. Als Nutzer möchte ich durch die nötigen Transaktionen (**neuen Vault anlegen →
    Context setzen → je gewählte Automation deployen**) **geführt** werden, damit
    ich den mehrstufigen Ablauf verstehe.
32. Als Nutzer möchte ich, dass der Kopier-Flow **fortsetzbar** ist, wenn eine
    Transaktion fehlschlägt (z. B. Vault erstellt, aber Automation 2 fehlgeschlagen),
    damit ich nicht von vorne beginnen muss und kein verwaister Vault entsteht.
33. Als Nutzer möchte ich, dass zeitbasierte Trigger entsprechend der Vorlage
    behandelt werden (Startzeit als freigegebener Parameter, sonst auf den
    Kopierzeitpunkt gesetzt), damit Zeitpläne sinnvoll starten.
34. Als Nutzer möchte ich, dass meine fertige Kopie **eindeutig der Vorlage
    zugeordnet** wird, damit sie korrekt in die aggregierte Performance einfließt.
35. Als Nutzer möchte ich nach Abschluss zu meinem **neuen Vault** geleitet werden,
    damit ich Einzahlung/Status sofort sehen kann.

### Integrität & Aggregation (übergreifend)

36. Als Plattform möchte ich garantieren, dass beim Kopieren **nur freigegebene
    Felder** verändert werden und **Graph-Struktur + fixierte Werte unverändert**
    bleiben, damit die Logik-Integrität gewahrt ist (Erfolgskriterium).
37. Als Plattform möchte ich, dass ein Snapshot nach der Veröffentlichung **nicht
    mehr durch Änderungen am Original-Vault beeinflusst** wird, damit die
    Unveränderlichkeit hält.
38. Als Plattform möchte ich die aggregierte Performance aus dem **vorhandenen
    Snapshot-Read-Model** (stündliche `VaultValueSnapshot`) je Kopie ziehen und
    cachen, damit Listen- und Detailansicht skalieren.
39. Als Plattform möchte ich den **Original-Vault des Erstellers als „Kopie #0"** in
    die Aggregation einbeziehen, damit auch vor den ersten Kopien Daten sichtbar
    sind (siehe Abweichung vom Epic).

## Implementation Decisions

### Grundsatzentscheidungen (aus Interview)

- **Template-Einheit:** ein **ganzer Vault** (alle deployten Automations + geteilter
  Context), nicht eine einzelne Automation.
- **Auswahl der Automations:** **alle** Automations des Vaults — deployte (mit
  `onChainId`, public **und** owner-only) **und Drafts** — sind standardmäßig
  ausgewählt; der Ersteller kann einzelne abwählen. Snapshot-Quelle ist in beiden
  Fällen der `editorState` (den auch Drafts besitzen); Kopien deployen ohnehin alles
  frisch, daher ist ein Draft gleichwertig aufnehmbar. **Guard:** eine ausgewählte
  Automation muss die bestehende Graph-/Param-Validierung bestehen (sonst kann eine
  Kopie sie nicht deployen) — eine invalide Automation blockiert die Veröffentlichung
  bzw. ist nicht auswählbar.
- **Kopier-Ziel:** **immer ein neuer Vault** (Factory `createVault`). 1 Kopie = 1
  Vault → saubere Attribution.
- **Performance-Scope:** **ganzer Kopie-Vault** (kein Versuch der
  Template-anteiligen Isolierung — dafür existiert keine per-Automation-
  Wertzuordnung).
- **Freigabe-Modell:** **per-Feld-Allowlist** mit Constraint-Spezifikation pro Feld.
- **Immutabilität:** nur UI/Daten-seitig (entkoppelter Snapshot), kein
  On-Chain-Beweis.
- **Anreiz:** Sichtbarkeit/Reputation, keine Gebühren.
- **Zugang:** jede authentifizierte Wallet (SIWE), keine öffentlichen
  unauthentifizierten Endpunkte.

### Freigabe-/Constraint-Modell (`ReleaseSpec`)

Pro freigegebenem Feld wird eine Constraint-Spezifikation gespeichert. Die Felder
werden schema-getrieben aus `StepType.paramSchema` (+ `x-ui-widget`) abgeleitet, es
gibt **keinen** per-Step-Sonderfall. Feldtypen:

- **Betrag (`token-amount` u. ä.):** optionaler `default` (Snapshot-Wert),
  optionale `min`/`max`-Grenzen. Validierung über `shared` `validateParams`
  (friendly + raw) plus Grenzwert-Check.
- **Token (`token-selector`):** Constraint entweder **konkrete Allow-Menge** von
  Token-Adressen **oder** „**alle Tokens eines Protokolls**" (`aave` |
  `pancakeswap`, gespeist aus `ProtocolToken`). Default = Snapshot-Wert.
- **Vault-Deposit-Token:** wie Token-Feld, aber auf Vault-Ebene; muss ein
  akzeptierter Fee-Token sein (`FeeRegistry`). Wenn nicht freigegeben → wird vom
  Snapshot geerbt.
- **Startzeit (`start-time`):** freigebbar; wenn freigegeben setzt der Kopierer den
  Wert, sonst wird die Startzeit beim Deploy auf den Kopierzeitpunkt gesetzt.
- **Annotation:** optionales `label` + `hint` pro freigegebenem Feld (Fallback:
  Schema-Feldname/Widget).

Alle nicht freigegebenen Felder und die **gesamte Graph-Struktur**
(Knoten/Kanten/Reihenfolge/Selektoren) sind fix.

### Snapshot-Modell (entkoppelt)

Der Snapshot ist eine **Deep-Copy** zum Veröffentlichungszeitpunkt und enthält:

- die gewählten Automations als `editorState`-Kopien (Graph + friendly Params +
  Step-Type-Referenzen via `contractAddress`/`selector`),
- die zugehörigen **Context-Variablen/Slots** des Vaults,
- den Deposit-Token des Quell-Vaults,
- die `ReleaseSpec`.

Es besteht **kein Live-FK** zur Quell-Automation für die Logik — `sourceVaultId`
wird rein informativ/zur Original-Aggregation referenziert. Spätere Änderungen am
Quell-Vault oder dessen Automations verändern den Snapshot nicht.

### Aggregations-Read-Model

- Quelle: pro Kopie-Vault (inkl. Original als „Kopie #0") die **neueste
  `VaultValueSnapshot`** + Boundary-`VaultEvent`s + `Execution.gasCompUsd`,
  verarbeitet durch die bestehende per-Vault-Logik (`performance.ts` /
  `PerformanceService`).
- **ROI:** **kapitalgewichtet** = Σ `pnlAbsUsd` / Σ `netDepositsUsd` über alle
  einbezogenen Vaults; `null`, wenn Σ `netDepositsUsd` ≤ 0 → Empty-State.
- **Total Value:** Σ `currentValueUsd`.
- **Anzahl Kopien:** Anzahl `TemplateCopy`-Einträge (Original zählt **nicht** als
  Kopie für die Anzeige „Anzahl Kopien", fließt aber in ROI/Total Value ein).
- **Caching:** kurz-TTL-Cache (analog zu bestehenden Service-Caches); kein
  Live-Vollscan pro Seitenaufruf.

### Kopier-Orchestrierung (geführt, fortsetzbar)

Reihenfolge der Transaktionen pro Kopie: **`createVault` → `setContext` (einmal) →
N × `createAutomation`/`createOwnerAutomation`**. Calldata wird serverseitig über
den bestehenden `EncodingService`/Encode-Boundary-Pfad erzeugt; die
freigegebenen Werte werden vor dem Encoden über die Release-Engine in den Snapshot
eingesetzt.

- Der Backend-Eintrag `TemplateCopy` wird erstellt, **sobald der Vault existiert**
  (Vault-Adresse aus dem `createVault`-Event), und pro deployter Automation
  fortgeschrieben → fortsetzbar.
- Bei Fehlschlag einer Teil-Transaktion kann der Flow ab dem letzten erfolgreichen
  Schritt fortgesetzt werden (kein verwaister Vault, keine Doppel-Deployments).

### API-Verträge (neu, `MarketplaceModule`)

Alle Endpunkte hinter `WalletAuthGuard`; Veröffentlichen/Zurückziehen zusätzlich
mit Eigentumsprüfung des Quell-Vaults (über `VaultAccessService`).

- `POST /marketplace/templates` — veröffentlichen (Body: sourceVault, gewählte
  Automation-IDs, `ReleaseSpec`, Titel/Beschreibung). Erstellt entkoppelten
  Snapshot.
- `GET /marketplace/templates?sort=roi|copies|value&page=&pageSize=` — paginierte,
  sortierte Liste inkl. aggregierter Kennzahlen + Empty-State-Flag.
- `GET /marketplace/templates/:id` — Detail: Snapshot-Vorschau (read-only Graph),
  freigegebene Felder + Constraints + Labels, aggregierte Performance.
- `POST /marketplace/templates/:id/encode-copy` — validiert Kopierer-Eingaben gegen
  `ReleaseSpec`, liefert die Sequenz aus Calldata (Vault-Create-Parameter,
  Context-Calldata, Automation-Calldata je Automation).
- `POST /marketplace/templates/:id/copies` — Kopie verknüpfen/fortschreiben
  (Vault-Adresse, deployte Automation-IDs).
- `PATCH /marketplace/templates/:id/retract` — zurückziehen (Soft-Delete:
  `retiredAt`); aus Liste ausgeblendet, Detail/Kopien bleiben bestehen.

### Schema-Änderungen (Prisma)

- **`StrategyTemplate`**: `id`, `creatorAddress`, `sourceVaultId` (nullable, rein
  referenziell), `title`, `description`, `snapshot` (Json, Deep-Copy), `releaseSpec`
  (Json), `depositToken`, `retiredAt` (nullable), `createdAt`, `updatedAt`.
- **`TemplateCopy`**: `id`, `templateId`, `vaultId` (unique → 1 Kopie = 1 Vault),
  `copierAddress`, `createdAt`. Relation zu `Vault`.
- `Vault` erhält eine Relation zu `TemplateCopy` (für „dieser Vault ist eine Kopie
  von X").
- Kein eigenes Aggregat-Tabellenmodell (Entscheidung: Read aus
  `VaultValueSnapshot` + kurzer TTL-Cache).

### Frontend

- **Publish-Flow** (von Vault-Detailseite): Automation-Checkliste (alle
  vorausgewählt) → per-Feld-Freigabe mit Constraint-Editor (Betrag: Default/Min/Max;
  Token: Allow-Menge oder Protokoll-all; Startzeit: freigeben/auto) + optionalem
  Label/Hinweis → Titel/Beschreibung → Zusammenfassung → veröffentlichen.
- **Marktplatz-Liste**: sortierbar (ROI/Kopien/Value), paginiert, Empty-State je
  Eintrag.
- **Detailseite**: read-only Graph-Vorschau (Wiederverwendung der vorhandenen
  React-Flow-Darstellung im read-only Modus), Kennzahlen, freigegebene Felder,
  Copy-CTA.
- **Copy-Wizard**: read-only Vorschau → Formular nur für freigegebene Felder
  (constraint-aware: Token-Selektor auf Allow-Menge begrenzt, Beträge mit
  Min/Max-Validierung, vorbefüllte Defaults) → geführte, fortsetzbare
  Transaktions-Sequenz → Weiterleitung zum neuen Vault.

### Abweichungen vom Epic

- **Original-Vault in Aggregation einbezogen:** Das Epic führt „Performance des
  Original-Vaults als eigene Kennzahl" als _out of scope_ und die Story-Übersicht
  legt „Kopien only" nahe. Bewusste Entscheidung im Interview: der Original-Vault
  wird als **Kopie #0** in **ROI und Total Value** einbezogen (nicht in die
  angezeigte „Anzahl Kopien"), um vor den ersten echten Kopien Daten zu zeigen.
- **Freigabe-Defaults mit Constraints:** Über das Epic hinaus erhält jedes
  freigegebene Feld eine Constraint-Spezifikation (Betrag: Default/Min/Max; Token:
  Allow-Menge oder „alle Tokens eines Protokolls"). Damit ist „Parameter freigeben"
  reicher als nur ein boolescher Schalter.

## Testing Decisions

**Was einen guten Test ausmacht:** Es wird **externes Verhalten** getestet, nicht
Implementierungsdetails — gleiche Eingaben → erwartete Ausgaben/Effekte, ohne
interne Strukturen festzuschreiben. Vorrang haben die **reinen Module** (kein I/O,
deterministisch) und die schmalen Service-/Endpoint-Verträge. Prior Art im Repo:
`packages/backend/src/cockpit/performance.spec.ts` und
`performance.service.spec.ts` (reine Math + Service mit gemocktem Prisma),
`packages/backend/src/automation/encoding.service.spec.ts`, `shared` `validateParams`-Tests,
sowie Frontend-Store-/Komponententests wie
`features/automation-editor/store/__tests__/node-init-validation.test.ts` und
`lib/__tests__/encode-boundary.test.ts`.

Zu testende Module (alle vier im Interview bestätigt):

1. **Release-/Constraint-Engine (rein):**
   - `extractReleasableFields(snapshot)` zählt alle freigebbaren Felder über alle
     Automations korrekt auf (Node-Params, Deposit-Token, Startzeit-Slots).
   - `validateCopyInputs(releaseSpec, values)` erzwingt Constraints: Token außerhalb
     der Allow-Menge → Fehler; „alle Tokens eines Protokolls" akzeptiert nur
     Protokoll-Tokens; Betrag außerhalb Min/Max → Fehler; Typ-/Pflichtprüfung über
     `validateParams`.
   - `applyCopyInputs(...)`: **fixierte Felder und Graph-Struktur bleiben
     bit-identisch**, nur freigegebene Felder übernehmen die Kopierer-Werte;
     Startzeit-Verhalten (freigegeben vs. auf Kopierzeitpunkt gesetzt) korrekt.
     → deckt das Erfolgskriterium „0 Logik-Mutationen" ab.
2. **Snapshot-Builder + Immutabilität (rein/integrativ):**
   - Veröffentlichter Snapshot ist vollständig **entkoppelt**: Mutation des
     Quell-Vaults/seiner Automations **nach** der Veröffentlichung verändert den
     Snapshot **nicht**.
   - **Sowohl deployte als auch Draft-Automations** werden aufgenommen (Quelle:
     `editorState`); abgewählte Automations fehlen im Snapshot; eine invalide
     Automation ist nicht aufnehmbar/blockiert die Veröffentlichung.
3. **Aggregations-Math (rein):**
   - **kapitalgewichteter ROI** = Σpnl/Σnet; korrekte **Total-Value-** und
     **Kopien-**Summen.
   - Empty-/Zero-Deposit-Zustände → `roiPct = null` (kein Divide-by-Zero), korrektes
     Empty-State-Flag.
   - **Original als Kopie #0** fließt in ROI/Total Value, **nicht** in „Anzahl
     Kopien".
4. **Kopier-Orchestrierung + Endpunkte (Service/Controller, gemocktes Prisma +
   Encoding):**
   - Veröffentlichen: Eigentumsprüfung (nur eigene Vaults), Snapshot wird
     persistiert.
   - `encode-copy`: ungültige Kopierer-Eingaben → HTTP 400 (Constraint-Verletzung),
     gültige → korrekte Calldata-Sequenz (Vault-Create → Context → N×Automation).
   - Kopie verknüpfen: `TemplateCopy` mit `vaultId` (unique) angelegt;
     Fortsetzbarkeit (erneuter Aufruf doppelt nicht).
   - Zurückziehen: `retiredAt` gesetzt → Vorlage aus Liste ausgeblendet, Detail +
     Kopien bleiben.
   - Liste: Sortierung (ROI/Kopien/Value) und Pagination liefern erwartete
     Reihenfolge/Seiten.

**Frontend-Tests** (sekundär, gleiche Linie wie bestehende Store-/Komponenten-
Tests): der Copy-Wizard rendert nur freigegebene Felder, begrenzt den
Token-Selektor auf die Allow-Menge und blockt Deploy bei Constraint-Verletzung; die
read-only Graph-Vorschau erlaubt keine Strukturänderungen.

## Out of Scope

- **Versionierung** von Vorlagen (eine neue Veröffentlichung = neue, eigenständige
  Vorlage).
- **Gebühren / Revenue-Share** (Anreiz ist nur Sichtbarkeit/Reputation).
- **Ratings / Reviews / Kommentare**.
- **Moderation** von Inhalten.
- **On-Chain-Immutabilitätsbeweis** (Garantie bleibt UI-/Datenseitig).
- **Template-anteilige Performance** innerhalb eines Vaults (es wird immer der
  ganze Kopie-Vault gemessen).
- **Kopieren in einen bestehenden Vault** (immer neuer Vault).
- **Öffentliches, unauthentifiziertes Browsen** (alles SIWE-gated).
- **Volltextsuche und „nur mit Performance-Daten"-Filter** in der Liste (MVP:
  Sortierung nach Kennzahlen + Pagination).
- **Eigene Aggregat-Tabelle / Hintergrund-Vorberechnung** (MVP: Read aus
  `VaultValueSnapshot` + TTL-Cache; spätere Auslagerung möglich, falls nötig).

## Further Notes

- **Story-Reihenfolge / Enabler:** Story 1 (Veröffentlichen) und Story 4 (Kopieren)
  teilen sich Snapshot- + `ReleaseSpec`-Datenmodell — gemeinsam designen, getrennt
  umsetzen. Die **Aggregation** ist ein technischer Enabler für Story 2 und 3 und
  wird von Story 4 gespeist. Da der Original-Vault als Kopie #0 zählt, liefert die
  Aggregation bereits nach Story 1 erste Daten.
- **Wiederverwendung bestehender Bausteine:** Encode-Boundary/`EncodingService`,
  `ContextService` (Slot-Allokation), `PerformanceService`/`performance.ts`,
  `VaultValueSnapshot`-Read-Model, `useCreateVault`, React-Flow-Editor (read-only
  Modus), `ProtocolToken`/`/tokens` (für Token-Allow-Mengen), `FeeRegistry`
  (akzeptierte Deposit-Tokens). Der Marktplatz baut bewusst auf diesen Pfaden auf,
  statt sie zu duplizieren.
- **Sicherheits-/Audit-Berührung:** Snapshot-Entkopplung und der mehrstufige
  Vault-Erzeugungs-/Deploy-Pfad sollten vom Security/Audit-Stakeholder vor Launch
  von Story 1 (Snapshot) und Story 4 (Kopie/Vault-Erzeugung) reviewt werden —
  insbesondere die Garantie, dass nur freigegebene Felder mutiert werden.
- **Fork-/Indexer-Hinweise** (Dev): Aggregation hängt an `VaultValueSnapshot`
  (stündliche Snapshot-Loop) und an Boundary-Events des Indexers — auf der Fork ggf.
  `INDEXER_CONFIRMATIONS=0`, damit frische Kopien/Deposits zeitnah in die Kennzahlen
  einfließen.
