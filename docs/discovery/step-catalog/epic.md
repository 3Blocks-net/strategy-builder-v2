---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Epic — Schema-getriebener Step-Katalog (Reverse-Spec aus Bestandscode)

## Einseiter

Der Step-Katalog ist die eine Quelle der Wahrheit für alle Strategie-Bausteine
(Conditions und Actions) der Plattform. Er lebt adress-unabhängig im Repo
(`packages/backend/prisma/seed/step-types.ts`, komponiert aus
`prisma/seed/catalog/{core,aave,pancakeswap}.ts`), wird beim Seed gegen die real
deployten Contract-Adressen aufgelöst (`fork-latest.json` bzw. ENV-Fallback) und
deterministisch in die `StepType`-Tabelle gespiegelt: nicht-deployte Steps
(Adresse `0x0`) werden übersprungen, Altbestände aus früheren Deploys werden
**self-pruning** entfernt. Zwei öffentliche Read-only-APIs liefern den Katalog aus:
`GET /step-types` (Editor + MCP) und `GET /recipes` (kuratierte Few-Shot-Graphen für
den KI-Assistenten). Recipes referenzieren Step-Types über stabile Namen mit
Platzhalter-Werten und werden beim Seed gegen den deployten Katalog validiert —
ungültige werden übersprungen, nie ausgeliefert. Ein CI-Integritäts-Guard
(`checkCatalogIntegrity`) prüft das LLM-/UI-seitige `paramSchema` gegen die
on-chain-Fähigkeiten (Modi, Pflicht-Felder, stale Texte, ABI↔Schema-Lockstep,
Rollen-Annotationen), sodass Metadaten-Drift den Build bricht statt Nutzer zu treffen.
Die Semantik jedes Feldes (Token / Betrag / Empfänger / Richtung) wird ausschließlich
schema-getrieben über `x-ui-role` / `x-ui-widget` aufgelöst
(`packages/shared/src/step-roles.ts`) — kein per-Step-Type-Code in den Konsumenten.

## Personas & Rollen

| Rolle | Beziehung zum Feature |
|---|---|
| **Strategie-Bauer (Endnutzer, Web-Editor)** | Sieht im Graph-Editor genau die deployten Step-Types mit Formularen, die vollständig aus `paramSchema` gerendert werden; nutzt Recipes als Startpunkte. |
| **KI-Assistent (MCP-Client)** | Konsumiert `GET /step-types` und `GET /recipes` als alleinige Wissensquelle über Bausteine; `description`-Texte im `paramSchema` sind LLM-facing Wahrheit. |
| **Katalog-Kurator (Dev-Team)** | Pflegt Katalog-Einträge, `ACTION_CAPABILITIES` und Recipes im Repo; einziger Schreibweg (HITL-reviewed, kein User-/Community-Schreibpfad). |
| **Betreiber / CI** | Führt Seed nach jedem Deploy aus; verlässt sich darauf, dass der Integritäts-Guard im Test-Lauf Drift hart fehlschlagen lässt. |

## Fachliche Regeln & Verbotsliste (was der Code erzwingt)

1. **Eine Quelle:** Der komponierte Katalog `STEP_TYPE_CATALOG` ist die einzige Quelle,
   die geseedet und vom Guard geprüft wird (`prisma/seed/step-types.ts`).
2. **Adress-Unabhängigkeit:** Katalog-Einträge tragen einen `contractKey`, nie eine
   Adresse; erst der Seed löst gegen `fork-latest.json` / ENV auf
   (`prisma/seed/catalog/_shared.ts`, `prisma/seed.ts`).
3. **Verbot: Zero-Address-Steps seeden.** Steps ohne deployten Contract werden mit
   Warnung übersprungen (Kollision auf Unique-Key `(contractAddress, selector)`).
4. **Self-Pruning:** Nach dem Upsert werden alle StepType-Zeilen gelöscht, deren `id`
   nicht im aktuellen Lauf upsertet wurde — Abgleich per **id, nicht Adresse**, weil
   deterministisches CREATE Adressen über Redeploys recycelt (`prisma/seed.ts`).
5. **Verbot: Recipe mit unbekanntem Step-Type oder Param-Drift ausliefern.** Solche
   Recipes werden beim Seed übersprungen (`validateRecipeShape`).
6. **Verbot: User-/Community-Schreibpfad für Recipes.** Es existiert nur `GET /recipes`;
   kein Create/Update/Delete-Endpunkt (`recipe.service.ts`, `recipe.controller.ts`).
7. **Verbot: Adressen in Recipes.** Recipes referenzieren Step-Types über stabile Namen,
   Werte sind Platzhalter (`TOKEN_IN`, `BETRAG`, `INTERVALL`) — robust gegen
   Redeploy-Adress-Drift (`recipe-seed-data.ts`, `schema.prisma` Kommentar).
8. **Advertised ⊆ Supported:** Vom Schema beworbene Amount-Modi (`x-ui-modes`) müssen
   Teilmenge der on-chain unterstützten Modi sein (`ACTION_CAPABILITIES`).
9. **Modus-Pflichtfelder:** Wird ein Modus beworben, der ein Hilfsfeld braucht (z. B.
   `TARGET_HF` → Widget `health-factor`), muss das Feld im Schema existieren.
10. **Verbot: Stale-Verfügbarkeits-Texte auf angebotenen Feldern** („not yet
    available", „later slice", „reserved") — erlaubt nur auf tatsächlich nicht
    angebotenen (hidden, nicht beworbenen) Feldern.
11. **ABI↔Schema-Lockstep:** Jede `abiFragment`-Komponente braucht eine
    `paramSchema`-Property; jede nicht-hidden Property braucht eine ABI-Komponente —
    Ausnahme: friendly-only Widgets (`start-time`), die die Encode-Boundary strippt.
12. **Geld-Ziel-Pflicht-Annotation:** Address-typisierte ABI-Komponenten namens
    `recipient`/`to`/`receiver`/`destination` müssen die Rolle `recipient` auflösen;
    `account-selector` allein impliziert **bewusst keinen** Empfänger (Watch-Adressen
    sind kein Geld-Ziel) — `packages/shared/src/step-roles.ts`.
13. **Rollen-Auflösung generisch:** explizite `x-ui-role` schlägt abgeleitetes
    `x-ui-widget` (`token-selector`→token, `token-amount`→amount,
    `aave-amount-mode`→direction); kein per-Step-Type-Code.
14. **`ACTION_CAPABILITIES` ist handgepflegt** und spiegelt `ActionLib.AmountMode`
    (Solidity); Änderung am Contract-Enum erfordert Co-Edit (Review-Pflicht,
    dokumentiert in `action-capabilities.ts`).

## Anforderungen

### A1 — Katalog als versionierte Single Source of Truth

- **Rolle:** Katalog-Kurator
- **Fähigkeit:** Step-Types adress-unabhängig als Code-Datenstruktur pflegen
  (Name, Beschreibung, Kategorie CONDITION/ACTION, `contractKey`, Selektoren,
  `abiFragment`, `paramSchema`).
- **Zweck:** Ein neuer Baustein erscheint durch einen einzigen Katalog-Eintrag in
  Editor und MCP — ohne Konsumenten-Code.
- **Fachliche Kriterien:**
  - Normalfall: Ein Eintrag in `catalog/{core,aave,pancakeswap}.ts` wird in
    `STEP_TYPE_CATALOG` komponiert (Reihenfolge erhalten) und beim nächsten Seed
    upsertet.
  - Randfall: `contractKey` ohne bekannten Deploy-Eintrag → Adresse fällt auf `0x0`
    zurück und der Step wird beim Seed übersprungen (siehe A2).
  - Fehlerfall: Ein Eintrag, der eine Integritätsregel verletzt, bricht den CI-Test
    (siehe A5) — er erreicht die DB gar nicht erst über einen grünen Build.
- **Beleg:** `packages/backend/prisma/seed/step-types.ts`,
  `packages/backend/prisma/seed/catalog/_shared.ts` (StepTypeDef),
  `packages/backend/prisma/seed/catalog/core.ts` u. a.

### A2 — Deterministischer, self-pruning Seed

- **Rolle:** Betreiber / CI
- **Fähigkeit:** `pnpm db:seed` spiegelt den Katalog exakt in die DB — beliebig oft
  wiederholbar, auch nach Redeploys.
- **Zweck:** Editor und MCP sehen nie Duplikate, Geister-Steps oder nicht-deployte
  Bausteine.
- **Fachliche Kriterien:**
  - Normalfall: Adressen werden aus
    `packages/contracts/deployments/fork-latest.json` gelesen (Fallback: ENV-Variablen,
    Fallback: `0x0`); jeder deployte Step wird per Upsert auf dem Unique-Key
    `(contractAddress, selector)` geschrieben; Update aktualisiert Name, Beschreibung,
    Kategorie, `afterExecutionSelector`, `abiFragment`, `paramSchema`.
  - Randfall (nicht deployt): Steps mit Adresse `0x0` werden mit Konsolen-Warnung
    übersprungen und gezählt („skipped N not-yet-deployed").
  - Randfall (Alt-Deploy): Vor dem Upsert werden alle `0x0`-Zeilen gelöscht (mehrere
    nicht-deployte Steps würden sonst auf einer Zeile kollabieren); nach dem Upsert
    werden alle Zeilen gelöscht, deren `id` nicht in diesem Lauf upsertet wurde
    („Pruned N stale step type(s)"). Id- statt Adress-Abgleich, weil Adressen über
    Redeploys recycelt werden.
  - Randfall (alte `fork-latest.json`): Fehlt ein neuerer Contract-Key in der Datei,
    koalesziert der Loader auf `0x0` → Step wird übersprungen statt der Seed zu
    crashen (Gotcha dokumentiert: Redeploy + Re-Seed nötig).
  - Fehlerfall: Wirft der Seed, endet der Prozess mit Exit-Code 1 (kein
    Teil-Erfolg wird verschleiert).
- **Beleg:** `packages/backend/prisma/seed.ts` (loadContractAddresses, Skip-,
  Pre-Delete- und Pruning-Blöcke), `packages/backend/prisma/schema.prisma`
  (`@@unique([contractAddress, selector])`).

### A3 — Read-only Katalog-API für Editor und MCP

- **Rolle:** Strategie-Bauer, KI-Assistent
- **Fähigkeit:** Deployte Step-Types öffentlich (ohne Auth) lesen.
- **Zweck:** Beide Konsumenten rendern/argumentieren allein aus `paramSchema` +
  `abiFragment` — keine Zweitquelle.
- **Fachliche Kriterien:**
  - Normalfall: `GET /step-types` liefert alle Zeilen alphabetisch nach Name, mit
    `id`, `name`, `description`, `category`, `contractAddress`, `selector`,
    `afterExecutionSelector`, `paramSchema`, `abiFragment`.
  - Normalfall: `GET /step-types/:id` liefert einen Eintrag.
  - Fehlerfall: Unbekannte `id` → HTTP 404 („StepType with id … not found").
  - Randfall: Weil der Seed nie `0x0`-Steps schreibt (A2), liefert die API nur
    tatsächlich deployte Bausteine — das Legacy-Spec-Kriterium „keine
    Null-Adress-Bausteine" wird über den Seed erfüllt, nicht per API-Filter.
- **Beleg:** `packages/backend/src/step-registry/step-registry.controller.ts`,
  `packages/backend/src/step-registry/step-registry.service.ts`.

### A4 — Kuratierte Recipes mit Seed-Validierung gegen den deployten Katalog

- **Rolle:** Katalog-Kurator (schreibt), KI-Assistent (liest)
- **Fähigkeit:** Few-Shot-Referenz-Graphen (Platzhalter-Form) pflegen und ausliefern;
  aktueller Satz: `dca`, `interval-aave-supply`, `pancake-auto-reinvest`,
  `interval-rebalance`, `wick-wait-entry`, `wick-wait-rebalance`,
  `wick-wait-compound`.
- **Zweck:** Der Assistent bekommt nur Beispiele, die mit dem heute deployten Katalog
  tatsächlich ausdrückbar sind — keine erfundenen Bausteine.
- **Fachliche Kriterien:**
  - Normalfall: Beim Seed wird aus den **deployten** Step-Types (ohne `0x0`) ein
    Katalog `name → erlaubte Param-Keys` gebaut; jedes Recipe durchläuft
    `validateRecipeShape`; gültige Recipes werden per `key` (unique) upsertet.
  - Normalfall: `GET /recipes` (öffentlich, read-only) liefert `key`, `name`,
    `description`, `category`, `shape`, alphabetisch nach Name.
  - Fehlerfall (unbekannter Step): Node referenziert einen nicht (mehr) deployten
    Step-Type-Namen → Fehler `unknown step type "…"` → Recipe wird mit Warnung
    übersprungen, Zähler „skipped N invalid".
  - Fehlerfall (Param-Drift): Node-Param-Key existiert nicht in
    `paramSchema.properties` des Step-Types → Fehler `param drift: …` → übersprungen.
  - Fehlerfall (kaputter Graph): Edge-`source`/`target` verweist auf keine Node-`id`
    → Fehler → übersprungen.
  - Randfall: Recipes referenzieren ausschließlich stabile Namen + Platzhalter
    (`TOKEN_IN`, `BETRAG`, `INTERVALL`, `LP_POSITION_SLOT`) — Redeploy-Adressdrift
    kann ein einmal gültiges Recipe nicht brechen; nur Katalog-Änderungen (Name/Params)
    können, und dann greift die Validierung beim nächsten Seed.
  - Randfall (bewusste Lücke): Strategien, die der Condition-Katalog nicht ausdrücken
    kann, sind bewusst ausgelassen statt erfunden (Kommentar in
    `recipe-seed-data.ts`).
- **Beleg:** `packages/backend/src/recipe/recipe-validation.ts` (buildCatalog,
  validateRecipeShape), `packages/backend/src/recipe/recipe-seed-data.ts`,
  `packages/backend/prisma/seed.ts` (Recipe-Block),
  `packages/backend/src/recipe/recipe.controller.ts`,
  `packages/backend/src/recipe/recipe.service.ts`,
  `packages/backend/src/recipe/recipe-validation.spec.ts`.

### A5 — Katalog-Integritäts-Guard (CI bricht bei Metadaten-Drift)

- **Rolle:** Betreiber / CI (Schutz für Strategie-Bauer und KI-Assistent)
- **Fähigkeit:** `checkCatalogIntegrity(catalog, capabilities)` liefert eine
  Violation-Liste (`step`, `field`, `rule`, `detail`); leer = clean. Ein Jest-Test
  prüft den realen `STEP_TYPE_CATALOG` auf `[]`.
- **Zweck:** Stale oder widersprüchliche LLM-/UI-Metadaten fallen im Build auf, nicht
  beim Nutzer (dokumentierte Drift-Klasse: `TARGET_HF` „not yet available").
- **Fachliche Kriterien (Regeln):**
  - Normalfall: Ein wohlgeformter Eintrag erzeugt keine Violations.
  - `mode-unsupported` (2.2): beworbener Modus (`x-ui-modes` am
    `aave-amount-mode`-Widget) ∉ `supportedModes` der Capability.
  - `mode-field-missing` (2.3): beworbener Modus verlangt ein Widget-Feld (z. B.
    `TARGET_HF` → `health-factor`), das im Schema fehlt.
  - `stale-phrase` (2.4): angebotenes Feld (nicht-hidden, oder hidden aber über
    beworbenen Modus angeboten) trägt „not yet available" / „later slice" /
    „reserved" in der `description`. Randfall: derselbe Text auf einem echt
    nicht-angebotenen hidden Feld ist erlaubt.
  - `abi-schema-drift` (2.5): ABI-Komponente ohne Schema-Property, oder nicht-hidden
    Property ohne ABI-Komponente. Randfall: friendly-only Widgets (`start-time`)
    sind exempt (die Encode-Boundary strippt sie).
  - `unannotated-role` (2.6): Geld-Ziel-Feld ohne auflösbare `recipient`-Rolle
    (delegiert an `shared/findUnannotatedRecipients` — keine Zweitimplementierung).
  - Randfall: Steps ohne Capability-Eintrag überspringen nur die Modus-Regeln
    (2.2/2.3); Stale-Phrase-, Lockstep- und Rollen-Checks gelten immer.
  - Randfall: Capability-Set ist injizierbar (Default `ACTION_CAPABILITIES`) —
    testbar ohne echten Katalog.
- **Beleg:** `packages/backend/src/catalog/catalog-integrity.ts`,
  `packages/backend/src/catalog/action-capabilities.ts`,
  `packages/backend/src/catalog/catalog-integrity.spec.ts` (inkl. Test 3.1
  „the seeded catalog is clean" über den realen Katalog).

### A6 — Schema-getriebene Step-Rollen (shared, konsumentenübergreifend)

- **Rolle:** KI-Assistent (Summary-Decoder/Allowlist-Guard), Editor, Integritäts-Guard
- **Fähigkeit:** Für jedes Schema-Feld die semantische Rolle
  `token | amount | recipient | direction` auflösen — rein aus Annotationen.
- **Zweck:** Token-/Betrag-/Empfänger-/Richtungs-Semantik ohne per-Step-Type-Code;
  eine gemeinsame Quelle für alle Konsumenten.
- **Fachliche Kriterien:**
  - Normalfall: explizite `x-ui-role` gewinnt; sonst Ableitung aus `x-ui-widget`
    (`token-selector`→token, `token-amount`→amount, `aave-amount-mode`→direction).
  - Randfall: `account-selector` leitet **bewusst keine** Rolle ab — das Widget
    bezeichnet auch reine Watch-/Lese-Adressen (z. B.
    `TokenBalanceCondition.account`); ein echtes Geld-Ziel muss explizit
    `x-ui-role: 'recipient'` tragen (so annotiert bei `ERC-20 Transfer.recipient`).
  - Randfall: unbekanntes Widget / fehlendes Feld → `undefined` (keine Rolle), kein
    Fehler.
  - Fehlerfall (Lücke): `findUnannotatedRecipients` findet address-typisierte
    ABI-Komponenten mit Namen `recipient`/`to`/`receiver`/`destination` ohne
    `recipient`-Rolle und meldet `{ step, field }` (Step ohne Namen → „(unbenannt)");
    der Integritäts-Guard macht daraus eine CI-brechende Violation.
- **Beleg:** `packages/shared/src/step-roles.ts`,
  `packages/shared/src/step-roles.test.ts`,
  Konsum in `packages/backend/src/catalog/catalog-integrity.ts`,
  Annotation z. B. in `packages/backend/prisma/seed/catalog/core.ts`
  (`'x-ui-role': 'recipient'` am Transfer-Empfänger).

### A7 — Widget-getriebene, generische Param-Validierung

- **Rolle:** Strategie-Bauer (Editor, friendly) und Backend-Guard (/encode, raw)
- **Fähigkeit:** `validateParams(schema, params, { mode })` validiert Parameter allein
  über die `x-ui-widget`-Regeltabelle — dieselben Schema-Metadaten treiben Frontend
  und Backend.
- **Zweck:** Ein neues Feld braucht nur Metadaten, keinen neuen Validierungscode;
  on-chain-Reverts (ZeroToken, InvalidTicks, InvalidPercent, HF-Floor) werden als
  HTTP 400 / Editor-Fehler vorweggenommen.
- **Fachliche Kriterien (Auswahl, Verhalten pro Widget):**
  - Normalfall: `required`-Felder müssen befüllt sein; leere optionale Felder werden
    übersprungen.
  - Randfall: `context-slot`-Felder sind auto-verwaltet → nie presence-geprüft.
  - Randfall: `token-amount` mit Zero-Toggle: Toggle an → Betrag irrelevant/gültig;
    Toggle aus → Betrag > 0 Pflicht; die generische Required-Regel ist für solche
    Felder abgeschaltet (eigenes Regelwerk).
  - Fehlerfälle (raw-Modus, defensiv): Betrag kein Integer in [0, 2^256) →
    Fehler; `token-selector` mit Zero-/Nicht-Adresse → Fehler; `fee-tier` ∉
    {100, 500, 2500, 10000} → Fehler; `aave-amount-mode` = TARGET_HF mit HF ≤ 1.05
    (wad bzw. human) → Fehler; `tick-range` explizit mit lower ≥ upper → Fehler;
    `percent` ∉ [1..100] ganzzahlig → Fehler; `duration` ≤ 0 → Fehler.
- **Beleg:** `packages/shared/src/validation.ts`,
  `packages/shared/src/validation.test.ts`.

## Out of Scope

- **Encode-Boundary `mapGraphToRaw` / `mapParamsToRaw`** (friendly→raw-Konvertierung,
  `packages/shared/src/encode-boundary.ts`) — eigener Reverse-Spec-Agent; hier nur als
  Konsument der Widget-Konvention referenziert (`start-time`-Exemption).
- **Die MCP-Tools selbst** (`list_step_types`, `describe_step_type`, `list_recipes`
  in `packages/mcp`) — hier nur als Konsumenten der Katalog-APIs benannt.
- **ProtocolToken-Allowlists** (Aave-/PancakeSwap-Token-Seeding in `seed.ts`) — Teil
  desselben Seed-Skripts, aber fachlich kein Step-Katalog.
- Frontend-Rendering der Widgets (Editor-Store, Node-Init, Formulare).
- Contract-Verhalten selbst (Amount-Mode-Auflösung on-chain, Fork-Tests).

## Annahmen & offene Fragen

- **Annahme (aus Code-Kommentaren):** `ACTION_CAPABILITIES` ist absichtlich
  handgepflegt statt aus Solidity generiert — Begründung im Code: Änderungen sind
  selten und erfordern ohnehin Redeploy + Re-Seed als offensichtlichen Co-Edit.
  Restrisiko: Ein vergessener Co-Edit fällt erst auf, wenn eine Regel anschlägt.
- **Annahme:** Der Integritäts-Guard läuft ausschließlich als Jest-Test (CI-Gate);
  es gibt keine Laufzeit-Durchsetzung im Seed oder in der API. Ein Seed aus einem
  Branch mit rotem Guard würde die DB trotzdem befüllen. Offen: War das eine bewusste
  Entscheidung (CI-only) oder eine Lücke?
- **Annahme:** Recipes werden nur zum Seed-Zeitpunkt validiert; `GET /recipes` prüft
  nicht erneut gegen den Live-Katalog. Zwischen Katalog-Änderung und nächstem Seed
  könnten theoretisch gedriftete Recipes ausgeliefert werden. Praktisch mitigiert,
  weil Katalog- und Recipe-Änderungen denselben Seed-Lauf teilen.
- **Offen:** `Recipe.category` ist ein freier String (`accumulation`, `yield`,
  `compounding`, …) ohne Enum/Validierung — bewusste Flexibilität oder fehlende
  Härtung?
- **Offen:** Der ENV-Fallback für Contract-Adressen (ohne `fork-latest.json`) wirkt
  wie ein Produktions-/Nicht-Fork-Pfad; ob er aktiv genutzt wird, ist aus dem Code
  nicht ablesbar.
- **Abweichung zur Legacy-Spec:** `docs/legacy-specs/mcp-recipes` nennt 4 Recipes
  (MVP-Satz); der Code liefert inzwischen 7 (inkl. dreier Wick-Wait-Formen) — der
  Code ist die aktuelle Wahrheit, die Spec ist eingefroren.
- **Hinweis (Memory/Betrieb):** `paramSchema.description`-Texte sind LLM-facing
  Wahrheit; stale Texte führten real zu Assistent-Verweigerungen — genau die
  Fehlerklasse, die Regel `stale-phrase` seither abfängt.
