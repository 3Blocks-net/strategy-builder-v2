---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic: Encode-Boundary — die eine friendly→raw-Quelle in `packages/shared`

> **Rekonstruktion aus Bestandscode.** Anforderungen sind Black-Box-Contracts,
> abgeleitet aus Quelltext, Tests und der eingefrorenen Legacy-Spec
> (`docs/legacy-specs/shared-encode-boundary/spec.md`). Im Zweifel gilt der Code.

## Einseiter

Strategie-Graphen leben clientseitig in **friendly** Form (Dauer als
`{ value, unit }`, Beträge als „1.5", Toggles als Booleans). Der Backend-Encoder
(`POST /encode`) braucht **raw**-Werte, exakt beschränkt auf die Keys des
ABI-Fragments jedes Step-Types, mit uint256 als String (Präzision > 2^53).

Die Encode-Boundary in `packages/shared` ist die **einzige** Stelle, an der
diese Übersetzung passiert: `mapGraphToRaw` mappt Nodes+Edges,
`mapParamsToRaw` konvertiert Feldwerte widget-getrieben und strippt
friendly-only-Felder, `buildContextOverrides` extrahiert Startzeiten als
ABI-encodierte Context-Slot-Overrides. Flankiert wird das von puren
Unit-Helfern (`toSeconds`, `toBaseUnits`, `encodeTimestamp`) und der
schema-getriebenen Validierung `validateParams` mit den Modi `friendly`
(Editor-UX) und `raw` (defensiver `/encode`-Guard, spiegelt On-Chain-Reverts).

Konsumenten: Frontend-Deploy-Dialog, MCP-`propose-automation`, Backend-
Catalog-Integrity — alle über die `exports`-Map von `shared`. Neue Felder
brauchen nur `x-ui-*`-Metadaten im `paramSchema`, keinen neuen Code.

## Personas & Rollen

| Rolle | Beschreibung | Berührung mit der Boundary |
| --- | --- | --- |
| **Strategie-Bauer (Web)** | Baut Automationen im Graph-Editor (Frontend) | Friendly-Eingaben werden vor dem Deploy validiert (`friendly`-Modus) und beim Deploy via `mapGraphToRaw` konvertiert (`packages/frontend/src/features/automation-editor/components/deploy-dialog.tsx`) |
| **KI-Assistent-Nutzer (MCP)** | Steuert Vaults per Assistent; der MCP-Server schlägt Automationen vor | MCP nutzt dieselben shared-Funktionen (`packages/mcp/src/tools/propose-automation.ts`) — identisches Encoding wie das Frontend |
| **Backend / `/encode`-Guard** | NestJS-Encoder, der raw-Params ABI-encodiert | Nutzt `validateParams` im `raw`-Modus als defensiven Guard (HTTP 400 statt On-Chain-Revert); Catalog-Integrity prüft Schemas (`packages/backend/src/catalog/catalog-integrity.ts`) |
| **Step-Type-Autor** | Definiert neue Step-Types (Seed/Katalog) | Steuert Verhalten ausschließlich über `paramSchema` (`x-ui-widget`, `x-ui-zero-toggle`, `x-ui-amount-token-field`, …) und `abiFragment` — kein Boundary-Code nötig |

## Fachliche Regeln & Verbotsliste

Was der Code erzwingt bzw. per Konvention verbietet:

1. **Keine Zweitimplementierung.** Es gibt genau eine Boundary in `shared`;
   Frontend und MCP importieren sie. (CLAUDE.md-Konvention; Legacy-Spec-Requirement
   „Encode-Boundary als einzige geteilte Quelle"; Konsumenten-Belege oben.)
2. **Whitelist statt Blacklist:** Die raw-Ausgabe eines Nodes trägt NUR Keys,
   die im `abiFragment` des Step-Types vorkommen. Friendly-only-Felder
   (`startTime`, `minPrice`/`maxPrice`, `<feld>_useZero`) erreichen `/encode` nie.
   (`packages/shared/src/encode-boundary.ts:113-137`, Tests Zeilen 39–46, 217–231, 402–422.)
3. **uint256 immer als String** — nie als JS-`number` (Präzision > 2^53).
   Alle Betrags-/Wad-Konvertierungen laufen über BigInt-Strings
   (`packages/shared/src/amount.ts`).
4. **Schema-getrieben, kein per-Step-Type-Code:** Konvertierung und Validierung
   entscheiden ausschließlich über `x-ui-widget` + `x-ui-*`-Metadaten
   (`packages/shared/src/validation.ts:1-16`).
5. **Ein gemeinsamer Toggle-Key:** Das Zero-Toggle-Feld heißt verbindlich
   `<feld>_useZero` (`zeroToggleField`) — Widget, Validator und Mapper teilen
   dieselbe Funktion (`packages/shared/src/validation.ts:72-79`).
6. **Raw-Modus spiegelt On-Chain-Reverts:** Zero-Token (`ZeroToken`/`ZeroAsset`),
   Target-HF-Floor (`requireValidTargetHF`, > 1.05), `InvalidTicks`,
   `InvalidPercent`, Fee-Tier-Menge — Fehler sollen bei `/encode` (HTTP 400)
   auffallen, nicht als Runtime-Revert (`packages/shared/src/validation.ts:164-290`).
7. **Kein Rückweg zur Laufzeit:** `fromSeconds`/`fromBaseUnits` existieren nur
   für Round-Trip-Tests; Runtime dekomponiert raw nie zurück in friendly
   (`packages/shared/src/duration.ts:35-39`, `packages/shared/src/amount.ts:5-9`).
8. **Pure & IO-frei:** Kein Netzwerk-Call in der Boundary; Token-Decimals kommen
   als vorgeladene Map (lowercased Adresse → decimals) herein
   (`packages/shared/src/encode-boundary.ts:105-112`).

## Anforderungen

### A1 — Graph friendly→raw mappen (`mapGraphToRaw`)

- **Rolle:** Strategie-Bauer (Web) / KI-Assistent-Nutzer (MCP)
- **Fähigkeit:** Einen Editor-Graphen (Nodes + Edges) in die `RawGraph`-Form
  bringen, die `POST /encode` erwartet.
- **Zweck:** Ein Deploy-Aufruf funktioniert aus jedem Client identisch.
- **Fachliche Kriterien:**
  - *Normalfall:* Jeder Node wird zu `{ id, type, data: { stepTypeId, params: <raw> } }`;
    Params laufen durch `mapParamsToRaw` mit dem Schema des Step-Types. Jede Edge
    wird zu `{ source, target, sourceHandle }` normalisiert.
  - *Randfall:* Fehlender/unbekannter Node-`type` → `'ACTION'`; fehlender/`null`-
    `sourceHandle` → `'out'`; fehlende `params` → `{}`.
  - *Fehlerfall:* Kein eigener — Fehler entstehen nur in der Feld-Konvertierung (A2).
- **Beleg:** `packages/shared/src/encode-boundary.ts:189-210`;
  Tests `packages/shared/src/encode-boundary.test.ts:67-94`.

### A2 — Node-Params widget-getrieben konvertieren (`mapParamsToRaw`)

- **Rolle:** alle Clients (Frontend/MCP)
- **Fähigkeit:** Friendly-Feldwerte in raw-Werte übersetzen und auf die
  `abiFragment`-Keys beschränken.
- **Zweck:** Der Backend-Encoder erhält exakt die Werte, die die On-Chain-Structs
  erwarten — nichts Zusätzliches, nichts Fehlendes ohne Absicht.
- **Fachliche Kriterien:**
  - *Normalfall:*
    - `duration`-Widget: `{ value: 7, unit: 'days' }` → `'604800'` (Sekunden-String).
    - `token-amount`: „1.5" → Base-Units-String über die Decimals des per
      `x-ui-amount-token-field` referenzierten Tokens (18 → `'1500000000000000000'`,
      6 → `'1500000'`); `'0'` ist erlaubt.
    - `health-factor`: „1.5" → Wad-String `'1500000000000000000'` (1e18).
    - Alle anderen Widgets/Felder (Adressen, Enums wie `aave-amount-mode`,
      Context-Slot-Variablennamen wie `'swapOutput'`/`'lpPosition'`, Ticks,
      Fee-Tier, Booleans) passieren **unverändert** — Slot-Namen löst das
      Backend auf.
  - *Randfälle:*
    - Unset-Felder (`undefined`) werden **weggelassen**, damit das Backend seine
      Schema-Defaults anwendet — außer bei aktivem Zero-Toggle.
    - Zero-Toggle AN (`<feld>_useZero === true` bei `x-ui-zero-toggle`-Feld):
      raw-Betrag ist `'0'`, unabhängig vom (auch leerem) Betragsfeld —
      „0 heißt Spezialpfad" (Full-Balance/Fill-to-Target). Der Toggle-Boolean
      selbst wird gestrippt.
    - Duration bereits raw (Sekunden-String) oder unset → Pass-through.
    - `health-factor` unset/`null`/`''` oder `'0'` → `'0'`.
    - Unbekanntes Step-Schema (`undefined`) → `{}` (Backend-Guard greift).
    - Friendly-only-Felder (nicht im `abiFragment`) verschwinden restlos
      (z. B. `startTime`, `minPrice`, `maxPrice`).
  - *Fehlerfall:* `token-amount` mit unbekannten Decimals (Token nicht in der
    `tokenDecimals`-Map bzw. kein String) → **throw**
    „Cannot convert amount: unknown decimals for token …".
- **Beleg:** `packages/shared/src/encode-boundary.ts:57-137`;
  Tests `packages/shared/src/encode-boundary.test.ts:30-65,126-231,310-494`.

### A3 — Startzeit als Context-Override (`buildContextOverrides`)

- **Rolle:** Strategie-Bauer mit zeitbasiertem Trigger
- **Fähigkeit:** Die im `start-time`-Feld gewählte Startzeit als name-keyed
  Override (`{ slotVariablenname: 0x…64-hex }`) für `POST /encode` bereitstellen.
- **Zweck:** Die Startzeit wird beim Deploy per `setContext` als Initialwert des
  auto-zugewiesenen Zeit-Slots geschrieben; im Node-Payload selbst kommt sie
  nie an (A2 strippt sie).
- **Fachliche Kriterien:**
  - *Normalfall:* Feld mit `x-ui-widget: 'start-time'` + `x-ui-time-slot-field`
    → Slot-Variablenname aus dem referenzierten Feld lesen (z. B. `__time_c1`)
    und auf `encodeTimestamp(startTime)` mappen.
  - *Randfälle:* Nodes ohne `start-time`-Feld, ohne `x-ui-time-slot-field`,
    mit leerem/nicht-String-Slot-Namen oder unset/`null`/`''`-Startzeit werden
    übersprungen → ggf. leeres `{}`.
  - *Fehlerfall:* Nicht-ganzzahlige oder negative Startzeit → throw aus
    `encodeTimestamp` (A5).
- **Beleg:** `packages/shared/src/encode-boundary.ts:139-171`;
  Tests `packages/shared/src/encode-boundary.test.ts:233-276`.

### A4 — Schema-getriebene Parameter-Validierung (`validateParams`)

- **Rolle:** Strategie-Bauer (Modus `friendly`) und `/encode`-Guard (Modus `raw`)
- **Fähigkeit:** Dieselben `paramSchema`-Metadaten validieren friendly-Eingaben
  im Editor und raw-Werte im Backend — Rückgabe ist eine Liste
  `{ field, message }` (leer = gültig), kein Throw.
- **Zweck:** Fehler dort abfangen, wo sie billig sind: UX-Fehler im Editor,
  strukturelle/On-Chain-Spiegel-Fehler als HTTP 400 statt Revert.
- **Fachliche Kriterien:**
  - *Normalfall (generisch):* `required`-Felder müssen non-empty sein
    (`undefined`/`null`/`''` gilt als leer). Leere optionale Felder werden
    nicht weiter geprüft.
  - *Widget-Regeln:*
    - `duration` friendly: muss `{ value, unit }` sein, `value` endliche Zahl > 0,
      `unit` ∈ {minutes, hours, days, weeks}. Raw: ganzzahlige Sekunden > 0.
    - `token-amount` friendly: Pflicht (außer Toggle AN, dann immer gültig);
      Format `^\d+(\.\d+)?$`; mit Zero-Toggle muss ein inaktiver Toggle einen
      Betrag **> 0** haben (US #17), ohne Toggle ist 0 erlaubt; Nachkommastellen
      dürfen die Token-Decimals nicht überschreiten (Over-Precision). Raw:
      BigInt-parsebar, ≥ 0 und < 2^256.
    - `token-selector` (nur raw): gültige 40-Hex-Adresse und nicht die
      Zero-Adresse (spiegelt `ZeroToken`/`ZeroAsset`).
    - `aave-amount-mode` (cross-field): bei Modus 3 (TARGET_HF) muss das per
      `x-ui-target-hf-field` referenzierte Feld > 1.05 sein — friendly als
      Zahl, raw als Wad > 1.05e18; andere Modi prüfen das Feld nicht.
    - `tick-range`: nur im Explizit-Modus (rangeMode 0) muss `tickLower` strikt
      < `tickUpper` sein (spiegelt `InvalidTicks`); Preset-Modus ist exempt.
    - `fee-tier` (nur raw): Wert ∈ {100, 500, 2500, 10000}.
    - `percent` (beide Modi): ganze Zahl in [1, 100] (spiegelt `InvalidPercent`).
  - *Randfälle:* `context-slot`-Felder sind auto-managed → keine Pflichtprüfung.
    Zero-Toggle-Betragsfelder sind von der generischen Pflichtprüfung ausgenommen
    (eigene Regel läuft auch bei leerem Wert: Toggle AUS + leer = Fehler,
    Toggle AN + leer = gültig). Felder ohne bekannte Widget-Regel werden nur
    von der `required`-Regel erfasst.
  - *Fehlerfälle:* jede Regelverletzung → Eintrag mit Feldname und
    menschenlesbarer Message (Label = `title` oder Feldname).
- **Beleg:** `packages/shared/src/validation.ts:328-389` (Dispatcher) und
  `93-326` (Regeln); Tests `packages/shared/src/validation.test.ts`.

### A5 — Pure Unit-Konvertierungen

- **Rolle:** Boundary-intern + alle Konsumenten von `shared`
- **Fähigkeit:** Deterministische, IO-freie Konvertierungen ohne Präzisionsverlust.
- **Zweck:** Eine Zahlensemantik für alle Clients; uint256-sichere Strings.
- **Fachliche Kriterien:**
  - `toSeconds({ value, unit })` → Sekunden (minutes=60, hours=3600, days=86400,
    weeks=604800). *Fehlerfälle:* unbekannte Unit oder nicht-endlicher Wert → throw.
    `fromSeconds` ist die Test-only-Inverse.
  - `toBaseUnits(value, decimals)` → Base-Units-String (viem-`parseUnits`-Semantik
    für in-precision Werte): „1.5"/18 → `'1500000000000000000'`; führende Nullen
    normalisiert (`'0'` bleibt `'0'`); decimals 0 erlaubt. *Fehlerfälle:* negatives
    oder nicht-ganzzahliges `decimals`, Wert nicht `^\d+(\.\d+)?$` (auch negative
    Beträge), mehr Nachkommastellen als `decimals` (Over-Precision) → throw —
    der friendly-Validator (A4) fängt Over-Precision vorher ab, der Mapper sieht
    nur in-precision Werte. `fromBaseUnits` ist die Test-only-Inverse.
  - `encodeTimestamp(unixSeconds)` → `'0x' + 64` Hex-Zeichen, identisch zu
    `AbiCoder.encode(['uint256'], [n])`. *Fehlerfälle:* nicht-ganzzahlig,
    nicht-endlich oder negativ → throw.
- **Beleg:** `packages/shared/src/duration.ts`, `packages/shared/src/amount.ts`,
  `packages/shared/src/timestamp.ts`; Tests `duration.test.ts`, `amount.test.ts`,
  `timestamp.test.ts` (jeweils in `packages/shared/src/`).

### A6 — Eine geteilte Quelle, konsumiert von Frontend und MCP

- **Rolle:** Entwickler / Systemarchitektur
- **Fähigkeit:** `mapGraphToRaw`, `mapParamsToRaw`, `buildContextOverrides`,
  `validateParams`, Unit-Helfer und alle Typen (`RawGraph`, `StepSchema`,
  `ParamValidationError`, …) sind über den `shared`-Package-Export verfügbar.
- **Zweck:** Drift zwischen Clients strukturell unmöglich machen.
- **Fachliche Kriterien:**
  - *Normalfall:* Frontend und MCP importieren aus `shared` (Single Entry
    `./dist/index.js` via `exports`-Map); es existiert keine Kopie der Boundary
    im Frontend mehr.
  - *Randfall:* Backend nutzt dieselben Schema-Typen/Validierung für den
    raw-Guard und die Katalog-Integritätsprüfung.
- **Beleg:** `packages/shared/src/index.ts`, `packages/shared/package.json`
  (`exports`); Konsumenten:
  `packages/frontend/src/features/automation-editor/components/deploy-dialog.tsx`,
  `packages/mcp/src/tools/propose-automation.ts`,
  `packages/backend/src/catalog/catalog-integrity.ts`;
  Legacy-Spec `docs/legacy-specs/shared-encode-boundary/spec.md`.

## Out of Scope

- **ABI-Encoding selbst** — das eigentliche Encoden der raw-Params zu Calldata
  macht der Backend-Encoder (`POST /encode`), nicht `shared`.
- **Slot-Auflösung** — Context-Slot-Variablennamen (`'swapOutput'`, `'__time_c1'`)
  werden backend-seitig zu Indizes aufgelöst; die Boundary reicht sie nur durch.
- **Token-Decimals-Beschaffung** — kein On-Chain-Read in `shared`; die Map kommt
  vom Aufrufer (geladene Accepted-Token-Liste).
- **Graph-Topologie-Validierung** (Zyklen, erreichbare Nodes, Condition-Verkabelung)
  — nicht Teil von `validateParams`/`mapGraphToRaw`.
- **Step-Rollen-Auflösung** (`step-roles.ts`, `resolveFieldRole`) — eigenes
  Feature im selben Package, nicht Teil des Encode-Contracts.
- **Rückkonvertierung raw→friendly zur Laufzeit** — bewusst nicht unterstützt.

## Annahmen & offene Fragen

- **Annahme:** Die `tokenDecimals`-Map ist zum Mapping-Zeitpunkt vollständig für
  alle im Graph verwendeten Tokens geladen; der Mapper-Throw bei unbekannten
  Decimals ist als Programmierfehler-Schutz gedacht, nicht als Nutzer-Fehlerpfad
  (Nutzerfehler fängt A4 friendly vorher).
- **Annahme:** Die Aufrufer rufen `validateParams` (friendly) **vor**
  `mapGraphToRaw` auf — der Mapper validiert selbst kaum (z. B. würde ein
  ungültiger Betrag erst in `toBaseUnits` werfen). Der Code erzwingt diese
  Reihenfolge nicht.
- **Annahme:** `toSeconds` kann bei nicht-ganzzahligen friendly-Werten
  gebrochene Sekunden liefern (z. B. 0.5 minutes → 30 ist ganz, 0.01 minutes →
  0.6 nicht); der friendly-Validator verlangt nur > 0, nicht Ganzzahligkeit der
  resultierenden Sekunden. Offene Frage: Ist das gewollt, oder verhindert die
  UI-Eingabe das faktisch?
- **Offene Frage:** `buildContextOverrides` castet `startTime` via `Number(…)` —
  nicht-numerische Strings würden zu `NaN` und in `encodeTimestamp` werfen.
  Gibt es einen Client-Pfad, in dem `startTime` als Nicht-Zahl gespeichert wird?
- **Offene Frage:** `mapGraphToRaw` castet Node-Typ und `sourceHandle` per
  Type-Assertion — andere Werte als `CONDITION`/`ACTION` bzw.
  `true`/`false`/`out` würden unverändert durchgereicht (nur `undefined`/`null`
  wird defaulted). Verlässt man sich hier auf den Backend-Guard?
- **Offene Frage (Doku vs. Code):** Der `raw`-Validierungsmodus wird im Kommentar
  als „defensiver Backend-Guard" beschrieben; die konkrete Verdrahtung in
  `/encode` wurde für diese Reverse-Spec nicht verifiziert (nur die
  Konsumenten-Importe).
