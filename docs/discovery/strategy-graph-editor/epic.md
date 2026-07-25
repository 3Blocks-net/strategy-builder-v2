---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic: Strategy-Graph-Editor (Reverse-Spec aus Bestandscode)

## Einseiter

Der Strategy-Graph-Editor (`/vault/:address/automation/new/edit` bzw.
`/vault/:address/automation/:id/edit`, Beleg: `packages/frontend/src/App.tsx`) ist der
visuelle Baukasten für DeFi-Automationen auf einem Vault. Der Nutzer setzt aus einem
server-seitigen Step-Katalog **Condition-** und **Action-Knoten** auf eine
React-Flow-Canvas, verbindet sie zu einem azyklischen Ablaufgraphen (Conditions mit
True/False-Ausgängen), konfiguriert jeden Knoten über ein schema-getriebenes Formular
im Side-Panel und teilt Werte zwischen Steps über benannte **Context-Variablen**
(Slots). Eine dreistufige, laufend aktualisierte Validierung (Graph-Struktur,
Parameter-Schema, asynchroner On-Chain-Pool-Check) speist eine gemeinsame Fehlerliste;
solange Fehler offen sind, ist Deploy gesperrt. Entwürfe werden sofort als Draft
angelegt und automatisch gespeichert. Der Deploy-Dialog wandelt den Graphen an der
Encode-Boundary (`mapGraphToRaw` aus `shared`) in Raw-Werte, lässt das Backend
Calldata bauen und führt den Nutzer durch 1–2 Wallet-Transaktionen bis zur
On-Chain-Bestätigung.

Kern-Code: `packages/frontend/src/features/automation-editor/` (editor-page,
zustand-Store, lib/validate-graph, lib/is-valid-connection, lib/pool-validity,
components/dynamic-form u. a.) plus die geteilte Validierung/Encode-Boundary in
`packages/shared/src/validation.ts`.

## Personas & Rollen (soweit aus Code ableitbar)

- **Vault-Besitzer / Strategie-Bauer** — die einzige im Editor-Code sichtbare Rolle.
  Er erreicht den Editor nur eingeloggt (Route hinter `RequireAuth`,
  `packages/frontend/src/App.tsx`) und signiert Deploy-/Toggle-/Execute-Transaktionen
  mit der eigenen Wallet (wagmi `useSendTransaction`). Ein feineres Rollenmodell
  (Team, Viewer, Admin) existiert im Frontend-Code nicht.
- **Implizit: „Öffentlichkeit"/Executor-Infrastruktur** — der Code unterscheidet
  **Public**-Automationen (müssen mit einer Condition starten, können
  aktiviert/deaktiviert werden) von **Owner-only**-Automationen (starten mit einer
  Action, werden manuell per „Execute" ausgeführt). Beleg: `inferOwnerOnly` in
  `store/editor-store.ts`, Statusspalten in `components/automation-list.tsx`.

## Fachliche Regeln & Verbotsliste (was der Code erzwingt)

Struktur des Graphen (`lib/validate-graph.ts`):

1. Mindestens 1 Knoten; maximal **256** Steps (`MAX_STEPS`).
2. Genau **ein** Start-Knoten (Knoten ohne eingehende Kante); 0 oder >1 Start-Knoten
   sind Fehler.
3. **Public-Automationen müssen mit einer Condition beginnen** („Public automation
   must start with a Condition"). Beginnt der Graph mit einer Action, gilt er als
   Owner-only (`inferOwnerOnly`) und die Regel entfällt.
4. **Keine Zyklen** — doppelt erzwungen: beim Verbinden wird eine Kante, die einen
   Zyklus oder eine Selbst-Verbindung erzeugen würde, gar nicht erst zugelassen
   (`lib/is-valid-connection.ts`), und die Graph-Validierung meldet „Graph contains
   a cycle" zusätzlich.
5. Jede **Condition braucht ≥ 1 ausgehende Kante**; jede **Action darf ≤ 1
   ausgehende Kante** haben.
6. Alle Knoten müssen **vom Start-Knoten erreichbar** sein.

Parameter (schema-getrieben, `packages/shared/src/validation.ts`, friendly-Mode):

7. `required`-Felder müssen belegt sein (Ausnahmen: auto-verwaltete
   `context-slot`-Felder und Zero-Toggle-Beträge mit aktivem Toggle).
8. `duration` > 0 mit gültiger Einheit (minutes/hours/days/weeks).
9. `token-amount`: gültiges Dezimalformat; bei aktivem Zero-Toggle ist der Betrag
   irrelevant, bei inaktivem Toggle muss er > 0 sein; höchstens so viele
   Nachkommastellen wie das gewählte Token Decimals hat (Over-Precision-Schutz).
10. `percent`: ganze Zahl in [1, 100] (Spiegel des On-Chain-`InvalidPercent`).
11. `tick-range` im Explicit-Modus: untere Preisgrenze strikt kleiner als obere
    (Spiegel von `InvalidTicks`).
12. `aave-amount-mode` im Target-HF-Modus: Ziel-Health-Factor **> 1,05**
    (Spiegel des On-Chain-Floors).
13. **Pool-Existenz-Verbot:** Für jeden Swap-Knoten (Step-Typ mit `fee-tier`-Feld
    und zwei Token-Selektoren) wird on-chain `factory.getPool(tokenIn, tokenOut,
    fee)` gelesen; existiert kein Pool, blockiert der Fehler „No PancakeSwap pool
    exists for this token pair and fee tier" den Deploy (`lib/pool-validity.ts`,
    `hooks/use-pool-validity.ts`).

Prozess-Verbote:

14. **Deploy ist bei ≥ 1 Validierungsfehler gesperrt** — der Button ist disabled
    (`components/editor-toolbar.tsx`).
15. Eine **aktive Public-Automation kann nicht gelöscht** werden — der
    Delete-Button ist disabled mit Tooltip „Deactivate before deleting"
    (`components/automation-list.tsx`).
16. Delete-Tastendruck (Delete/Backspace) wirkt **nicht**, während der Fokus in
    einem Eingabefeld liegt (`editor-page.tsx`, Keydown-Handler).
17. Der Debug-Dialog (Editor-State/Steps als JSON) existiert **nur im Dev-Build**
    (`if (import.meta.env.PROD) return null`, `components/debug-dialog.tsx`).

## Anforderungen

### A1 — Automation als Draft anlegen und automatisch sichern

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Beim Öffnen des Editors für eine neue Automation entsteht sofort
  ein Draft; laufende Änderungen werden ohne expliziten Save-Button gesichert.
- **Zweck:** Kein Arbeitsverlust, nahtloses Weiterarbeiten.
- **Fachliche Kriterien:**
  - Normalfall: Bei Route `.../automation/new/edit` wird sofort
    `POST /vaults/:address/automations` mit leerem Label ausgeführt; die
    zurückgegebene ID wird zur Automation-ID (Beleg:
    `features/automation-editor/editor-page.tsx`, Draft-Effect).
  - Normalfall: Bei dirty-State wird nach **5 s** Ruhe per PATCH gespeichert
    (Nodes, Edges, Context-Variablen, Label, Beschreibung); Statusanzeige
    „Saving…" → „Saved" (2 s sichtbar) → idle (Beleg: `hooks/use-auto-save.ts`,
    `components/editor-toolbar.tsx`).
  - Randfall: React-StrictMode-Doppel-Mount erzeugt **keinen** doppelten Draft
    (Ref-Guard `draftCreationStarted`, Beleg: `editor-page.tsx`).
  - Randfall: Browser-Schließen mit ungespeicherten Änderungen löst die
    `beforeunload`-Warnung aus (Beleg: `hooks/use-auto-save.ts`).
  - Fehlerfall: Schlägt der Save fehl, zeigt die Toolbar „Save failed" (Status
    `error`); schlägt die Draft-Erstellung fehl, wird der Guard zurückgesetzt und
    der Fehler geloggt (Belege: `use-auto-save.ts`, `editor-page.tsx`).

### A2 — Steps aus dem Katalog hinzufügen

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Über „+ Add Step" einen Step-Typ aus dem server-seitigen Katalog
  wählen und als Knoten auf die Canvas legen.
- **Zweck:** Strategiebausteine ohne Contract-Wissen nutzen.
- **Fachliche Kriterien:**
  - Normalfall: Katalog kommt aus `GET /step-types` und wird im Dropdown nach
    **Conditions** und **Actions** gruppiert, je Eintrag Name + Beschreibung
    (Beleg: `components/add-step-dropdown.tsx`).
  - Normalfall: Der neue Knoten wird versetzt platziert (x zufällig 250–450,
    y wächst mit Knotenzahl) und erhält eine fortlaufende ID (Beleg:
    `editor-page.tsx` `handleAddStep`, `store/editor-store.ts` `addNode`).
  - Randfall (Node-Init): Beim Anlegen werden alle Schema-Defaults materialisiert:
    statische Defaults, Zeit-Slot-Felder bekommen den deterministischen Namen
    `__time_<nodeId>`, `start-time` defaultet auf „jetzt" (Unix-Sekunden),
    `account-selector` defaultet auf die **Vault-Adresse** (verhindert den
    latenten Zero-Address-Bug), Zero-Toggle-Booleans werden angelegt (Beleg:
    `materializeDefaultParams` in `store/editor-store.ts`).
  - Randfall: Dropdown schließt bei Klick außerhalb (Beleg:
    `add-step-dropdown.tsx`).

### A3 — Knoten verbinden (Ablauf und Verzweigung)

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Knoten per Drag verbinden; Conditions verzweigen in True/False.
- **Zweck:** Ausführungsreihenfolge und bedingte Pfade definieren.
- **Fachliche Kriterien:**
  - Normalfall: Condition-Knoten haben zwei Quell-Handles `true` (grün) und
    `false` (rot); Action-Knoten einen Handle `out`. Kanten werden entsprechend
    „True" (grün), „False" (rot) oder „Next" (grau) beschriftet (Belege:
    `components/condition-node.tsx`, `components/action-node.tsx`,
    `store/editor-store.ts` `onConnect`).
  - Fehlerfall (verhindert): Selbst-Verbindung und jede Kante, die einen Zyklus
    erzeugen würde, werden schon beim Ziehen abgelehnt —
    `isValidConnection` liefert `false`, React Flow lässt den Connect nicht zu
    (Beleg: `lib/is-valid-connection.ts`, `editor-page.tsx`
    `handleIsValidConnection`).
  - Randfall: Entsteht dennoch ein struktureller Regelverstoß (z. B. zweite
    ausgehende Kante an einer Action), meldet ihn die Graph-Validierung
    (siehe A5).

### A4 — Knoten konfigurieren (schema-getriebenes Formular)

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Den selektierten Knoten im Side-Panel („Node Config") über ein aus
  `paramSchema` generiertes Formular parametrieren.
- **Zweck:** Fachliche Eingaben in menschlicher Form (Beträge, Dauern, Prozente,
  Datum) statt Raw-Contract-Werten.
- **Fachliche Kriterien:**
  - Normalfall: Widget-Auswahl rein über `x-ui-widget`/`x-ui-slot-access` des
    Schemas — u. a. `token-selector` (mit kuratierter per-Protokoll-Liste via
    `x-ui-token-source`, z. B. Aave/PancakeSwap), `token-amount` (mit optionalem
    Zero-Toggle und Decimals-Hinweis zum gewählten Token), `duration`
    (Wert + Einheit), `percent`, `fee-tier` (0,01 %/0,05 %/0,25 %/1 %),
    `range-percent` (±%-Presets 3/10/20 oder frei, ↔ tickDelta-Umrechnung),
    `tick-range` (Preset-Breite ±5/10/20 % oder explizite Min/Max-Preise mit
    Off-Chain-Tick-Berechnung), `start-time` (datetime-local ↔ Unix-Sekunden),
    `account-selector` (Default Vault-Adresse), `aave-amount-mode`
    (Modus-Selector: Fixed / From Slot / Full Balance / Target-HF, per
    `x-ui-modes` einschränkbar), Boolean-Checkbox, Text-Fallback (Beleg:
    `components/dynamic-form.tsx`).
  - Normalfall: Auswahl eines Knotens öffnet automatisch den Tab „Node Config"
    (Beleg: `onNodesChange` in `store/editor-store.ts`).
  - Randfall: Felder mit `x-ui-hidden` bleiben in `params` erhalten, werden aber
    nicht angezeigt (auto-verwaltete Felder wie der Zeit-Slot).
  - Randfall: `tick-range` schreibt beim ersten Öffnen eines frischen Knotens den
    angezeigten Preset-Default (±10 %) aktiv in die Params, damit keine degenerierte
    Single-Spacing-Range deployt wird (Beleg: Mount-Effect in `TickRangeField`).
  - Randfall: Wiedergeöffnete Knoten zeigen aus dem gespeicherten `tickDelta` die
    reale ±%-Breite (Snap auf nächstes Preset).
  - Fehlerfall: Feldbezogene Validierungsfehler erscheinen inline unter dem Feld
    (rote Umrandung + Meldung), gespeist aus derselben Fehlerliste wie das
    Sammel-Panel (Beleg: `useFieldError`/`FieldError` in `dynamic-form.tsx`).
  - Fehlerfall: Ist bei `token-amount` kein Token gewählt, warnt der Hinweis
    „Select a token to set the conversion decimals".
  - Randfall: Ohne selektierten Knoten zeigt das Panel den Hinweis „Wähle einen
    Node um seine Parameter zu konfigurieren" (Beleg: `components/side-panel.tsx`).

### A5 — Laufende Validierung mit Deploy-Gate

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Fehler jederzeit gesammelt sehen und zum Verursacher springen;
  Deploy ist erst bei 0 Fehlern möglich.
- **Zweck:** On-Chain-Reverts und kaputte Automationen vor dem Deploy abfangen.
- **Fachliche Kriterien:**
  - Normalfall: Nach jeder strukturellen oder Parameter-Änderung läuft (300 ms
    debounced) eine Validierung mit drei zusammengeführten Quellen:
    Graph-Struktur (`lib/validate-graph.ts`), Schema-Parameter-Prüfung über
    **alle** Knoten — auch nie geöffnete — (`validateNodeParams` +
    `shared/validateParams` im friendly-Mode) und externe asynchrone Fehler
    (Pool-Check, 400 ms debounced) (Belege: `store/editor-store.ts`
    `runValidation`, `hooks/use-pool-validity.ts`).
  - Normalfall: Toolbar zeigt Fehlerzähler-Badge; das rote Bottom-Panel listet
    alle Fehler; knotenbezogene Fehler sind klickbar und selektieren den Knoten +
    zoomen ihn ins Bild (`fitView`); fehlerhafte Knoten bekommen roten Rahmen
    (Belege: `components/editor-toolbar.tsx`, `components/validation-panel.tsx`,
    `condition-node.tsx`/`action-node.tsx`).
  - Normalfall: `errorCount > 0` ⇒ Deploy-Button disabled (Beleg:
    `editor-toolbar.tsx`).
  - Randfall: Trifft der Step-Katalog oder die Token-Decimals-Liste erst nach dem
    Graph-Load ein, wird nachvalidiert (`setStepSchemas`/`setTokenDecimals` lösen
    `scheduleValidation` aus, Beleg: `store/editor-store.ts`).
  - Randfall: Owner-only-Erkennung — genau ein Start-Knoten und dieser eine
    Action ⇒ die Public-Regel „muss mit Condition starten" entfällt (Beleg:
    `inferOwnerOnly`).
  - Fehlerfall: Schlägt der On-Chain-Pool-Read fehl (Exception), wird der Pool
    als nicht existent behandelt und der Fehler gesetzt (fail-closed, Beleg:
    `lib/pool-validity.ts` `buildSwapPoolErrors`).

### A6 — Graph bearbeiten: Undo/Redo, Kopieren/Einfügen, Löschen, Auto-Layout

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Übliche Editor-Operationen per Toolbar und Tastatur.
- **Zweck:** Effizientes, fehlertolerantes Arbeiten am Graphen.
- **Fachliche Kriterien:**
  - Normalfall: Undo/Redo über Buttons und Ctrl/Cmd+Z bzw. Ctrl/Cmd+Shift+Z;
    Snapshots vor jeder mutierenden Operation (Verbinden, Hinzufügen, Löschen,
    Param-Änderung, Paste, Layout, Drag-Ende); Historie max. **50** Einträge;
    Buttons sind ohne Historie disabled (Belege: `store/editor-store.ts`,
    `editor-page.tsx` Keydown-Handler, `editor-toolbar.tsx`).
  - Normalfall: Ctrl/Cmd+C kopiert die selektierten Knoten **plus nur die Kanten
    zwischen ihnen**; Ctrl/Cmd+V fügt mit neuen IDs, Versatz +50/+50 ein und
    selektiert die Kopien (Beleg: `copySelected`/`paste`).
  - Normalfall: Delete/Backspace entfernt selektierte Knoten und Kanten inkl.
    aller an gelöschten Knoten hängenden Kanten (Beleg: `removeSelected`;
    React-Flow-eigenes Delete ist deaktiviert, `deleteKeyCode={null}` in
    `editor-page.tsx`).
  - Normalfall: „Layout" ordnet den Graphen automatisch top-down an
    (`lib/auto-layout.ts` via `applyAutoLayout`).
  - Randfall: Shortcuts (Delete, Copy, Paste) greifen nicht, solange der Fokus in
    Input/Textarea/Select liegt; Undo/Redo per Shortcut greift immer (Beleg:
    Keydown-Handler in `editor-page.tsx`).
  - Randfall: Copy ohne Selektion bzw. Paste mit leerem Clipboard sind No-ops.

### A7 — Context-Variablen anlegen und zwischen Steps teilen

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Benannte Variablen (Vault-Context-Slots) anlegen, bearbeiten und
  als Step-Ein-/Ausgabe verdrahten.
- **Zweck:** Ergebnis eines Steps (z. B. Betrag) im nächsten Step nutzen, ohne
  Slot-Nummern zu kennen.
- **Fachliche Kriterien:**
  - Normalfall: Tab „Context" zeigt alle Variablen mit Slot-Index, Name, Typ
    (uint256/address/bool/bytes), Beschreibung und „Benutzt von: <Steps>"-Liste;
    Anlegen inline (Name Pflichtfeld, sonst Button disabled), Bearbeiten pro
    Slot (Belege: `components/context-panel.tsx`,
    `components/create-variable-inline.tsx`).
  - Normalfall: Slot-Index wird automatisch fortlaufend vergeben (max+1, Beleg:
    `addContextVariable` in `store/editor-store.ts`).
  - Normalfall: Schema-Felder mit `x-ui-slot-access: read`/`read-write` bieten
    einen Umschalter Literalwert ↔ Context-Variable (blaue „ctx"-Pille); Felder
    mit `write` bieten die Checkbox „Ergebnis in Context speichern" mit
    Variablen-Picker inkl. Inline-Neuanlage (Belege:
    `components/context-input-field.tsx`, `components/context-output-field.tsx`,
    `components/context-variable-dropdown.tsx`).
  - Randfall: Abwählen setzt den Sentinel `NO_SLOT = 4294967295` (optionale
    Felder) bzw. leeren String; der Zustand „Checkbox an, noch keine Variable
    gewählt" (`''`) zählt als aktiv, damit der Picker erscheint (Beleg:
    Kommentar/Logik in `context-output-field.tsx`).
  - Randfall (Race): Vault-weite Slots (`GET /context-slots`) und Draft-Variablen
    (`editorState.contextVariables`) laden parallel; die Merge-Strategie ist
    kommutativ — Draft-Variablen gewinnen bei Slot-Konflikt, Vault-Slots füllen
    nur Lücken; Ergebnis nach Slot-Index sortiert (Belege:
    `mergeContextVariables`, `mergeEditorContextVariables`,
    `mergeVaultContextSlots` in `store/editor-store.ts`; `editor-page.tsx`).

### A8 — Automation deployen (geführter Wallet-Flow)

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Den validierten Graphen als On-Chain-Automation deployen bzw. eine
  bereits deployte Automation aktualisieren.
- **Zweck:** Aus dem Entwurf eine ausführbare On-Chain-Strategie machen.
- **Fachliche Kriterien:**
  - Normalfall: Klick auf „Deploy" persistiert zuerst den aktuellen Stand (PATCH)
    und öffnet den Deploy-Dialog; „Confirm & Deploy" konvertiert die friendly
    Params an der Encode-Boundary (`mapGraphToRaw` + `buildContextOverrides` aus
    `shared`) und ruft `POST .../encode` bzw. `.../encode-update` (Edit-Modus,
    wenn die Automation schon eine `onChainId` hat) (Belege: `editor-page.tsx`
    `handleDeploy`, `components/deploy-dialog.tsx`).
  - Normalfall: Der Dialog zeigt vor/nach dem Encode: Label (Fallback
    „Untitled"), Step-Zahl, Typ **Owner-only/Public**, Context-Slot-Änderungen
    (Badge „New" mit Initialwert bzw. „Slot n"; Warnung „⚠ Shared", wenn aktive
    andere Automationen den Slot nutzen) sowie die Transaktionsschritte mit
    Status-Badges Waiting/Submitting/Confirming/Done.
  - Normalfall: Bei `requiresContextTx` laufen **zwei** Transaktionen („Set
    Context" mit Gas 500 000, dann „Create (Owner) Automation" mit Gas
    2 000 000), sonst eine; nach dem Receipt wird die On-Chain-ID aus dem
    `AutomationCreated`-Event gelesen und per PATCH (onChainId, txHash,
    ownerOnly, stepCount) im Backend bestätigt; Erfolgsmeldung + „Back to Vault".
  - Fehlerfall: Encode-Fehler zeigen die Backend-Message (Fallback „Encoding
    failed"); Receipt-Timeout → „Timed out waiting for the deployment
    transaction"; fehlendes Event → „Could not read the on-chain automation ID
    from the transaction"; Wallet-Ablehnung/sonstige Fehler → `shortMessage` bzw.
    `message` im roten Fehlerkasten, Dialog wechselt in Phase `error` und lässt
    erneutes Deployen zu (Beleg: `deploy-dialog.tsx`).
  - Randfall: Während des Ablaufs sind „Cancel" und „Confirm & Deploy" gesperrt
    (`isWorking`).

### A9 — Bestehende Automation wieder öffnen und weiterbearbeiten

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Eine gespeicherte (Draft- oder deployte) Automation im Editor
  öffnen; Zustand wird vollständig wiederhergestellt.
- **Zweck:** Iterieren statt neu bauen.
- **Fachliche Kriterien:**
  - Normalfall: `GET /vaults/:address/automations/:id` lädt Nodes, Edges, Label,
    Beschreibung und Draft-Context-Variablen; eine vorhandene `onChainId` schaltet
    den Deploy-Flow in den Update-Modus (`encode-update`) (Beleg:
    `editor-page.tsx`).
  - Randfall: Beim Mount wird der Store vollständig zurückgesetzt (leerer Graph,
    leere Variablen), bevor geladen wird — kein Zustand „blutet" zwischen
    Automationen durch (Beleg: Reset-Effect in `editor-page.tsx`).
  - Randfall: Nach dem Load läuft die Validierung sofort, sodass Altfehler ohne
    Nutzerinteraktion sichtbar sind (Beleg: `loadEditorState` →
    `runValidation`-Timeout in `store/editor-store.ts`).
  - Fehlerfall: Fehlgeschlagene Loads (Automation, Context-Slots, Token-Listen)
    werden still geschluckt — der Editor bleibt mit leerem/teilweisem Zustand
    benutzbar (Belege: `.catch(() => {})` in `editor-page.tsx`,
    `side-panel.tsx`).

### A10 — Automationen verwalten (Liste am Vault)

- **Rolle:** Vault-Besitzer
- **Fähigkeit:** Automationen des Vaults einsehen, öffnen, (de)aktivieren, manuell
  ausführen und löschen.
- **Zweck:** Lebenszyklus der gebauten Strategien steuern.
- **Fachliche Kriterien:**
  - Normalfall: Tabelle mit Name (Fallback „Untitled", Badges „Draft"/
    „Owner-only"), Step-Zahl, Status (Draft „—", Owner-only „Manual", sonst
    Active/Inactive), Trigger-Beschreibung (grün, wenn erfüllt); Polling alle
    30 s; Zeilenklick öffnet den Editor (Beleg:
    `components/automation-list.tsx`).
  - Normalfall: Public-Automationen: „Activate/Deactivate" holt Calldata via
    `encode-toggle` und sendet die Wallet-Transaktion — optimistisches UI mit
    **Rollback bei Fehler**; Owner-only: „Execute" via `encode-execute` mit Gas
    2 000 000.
  - Randfall: Toggle/Execute sind für Drafts und Automationen ohne `onChainId`
    No-ops.
  - Fehlerfall/Verbot: Aktive Public-Automationen können nicht gelöscht werden
    (Button disabled, Tooltip „Deactivate before deleting"); Löschen verlangt
    einen Bestätigungsdialog und weist darauf hin, dass On-Chain-Daten bestehen
    bleiben; Backend-Fehler beim Löschen erscheinen als `alert`.

## Out of Scope

- Portfolio-/Cockpit-Ansichten, Vault-Detailseite, Deposit/Withdraw,
  Performance-Charts (`pages/vault/detail.tsx`, `components/cockpit-*` u. a.) —
  eigene Discovery.
- Auth-Flow (SIWE/Connect, `pages/connect.tsx`, `protected-route.tsx`).
- MCP-Server und KI-Assistent.
- Backend-Encode-Logik und Contracts selbst (hier nur als Black-Box-Gegenstelle
  der Editor-Contracts beschrieben); ebenso die Raw-Mode-Validierung im Backend.
- Der Dev-only Debug-Dialog als Produktfeature.

## Annahmen & offene Fragen

Ehrlicher Hinweis: Diese Spec ist ausschließlich aus dem Bestandscode extrahiert —
es gab kein Fach-Interview. Konkrete Annahmen:

1. **Owner-only vs. Public:** Die Semantik (Public = von Executor-Infrastruktur
   automatisch ausführbar, Owner-only = nur manuell) ist aus UI-Texten und
   `inferOwnerOnly` rekonstruiert; die genaue Ausführungs-/Berechtigungslogik lebt
   on-chain bzw. im Backend und wurde nicht verifiziert.
2. **256-Steps-Limit:** Im Frontend hart kodiert (`MAX_STEPS` in
   `validate-graph.ts`); ob es exakt dem Contract-Limit entspricht, ist hier nicht
   belegt.
3. **Stilles Schlucken von Load-Fehlern** (A9): Es ist unklar, ob das bewusstes
   Produktverhalten („Editor bleibt immer benutzbar") oder eine Lücke ist — z. B.
   erscheint bei fehlgeschlagenem Automation-Load keinerlei Hinweis.
4. **Mehrsprachigkeit:** Die UI mischt Englisch (Toolbar, Validierungsmeldungen,
   Deploy-Dialog) und Deutsch (Context-Panel, Side-Panel-Leerzustand). Gewollte
   Zielsprache unbekannt.
5. **Gas-Konstanten** (500k/2M) sind hart kodiert mit Kommentar zur unzuverlässigen
   Fork-Gas-Schätzung — ob das für Mainnet-BSC so bleiben soll, ist offen.
6. **Messbare Produktziele** (Erfolgsmetriken, Conversion) sind im Code nicht
   ablesbar — reine Rekonstruktion im Problem-Statement.
7. **Löschen deployter Automationen** entfernt nur den Backend-Datensatz („data
   will remain until overwritten") — die fachliche Erwartung an On-Chain-Cleanup
   ist ungeklärt.
