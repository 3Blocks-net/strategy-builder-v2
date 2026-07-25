---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem Statement — Step-Katalog (Reverse-Spec, Rekonstruktion aus Bestandscode)

> **Ehrlichkeitshinweis:** Dieses Dokument ist rückwärts aus dem Bestandscode extrahiert
> (Black-Box-Contract), nicht das ursprüngliche Discovery-Artefakt. Referenz waren die
> eingefrorenen Legacy-Specs (`docs/legacy-specs/mcp-step-catalog`,
> `docs/legacy-specs/step-catalog-integrity`, `docs/legacy-specs/mcp-recipes`), geprüft
> gegen den Code auf Commit `7ca671b`.

## Problem

Die Strategie-Bausteine (Conditions/Actions) der Plattform sind on-chain deployte
Contracts. Drei Konsumenten müssen sie identisch verstehen: der Web-Graph-Editor, der
MCP-/KI-Assistent und der Backend-Encoder. Ohne eine einzige, maschinenlesbare Quelle
entstehen drei Fehlerklassen, die der Code nachweislich adressiert:

1. **Metadaten-Drift:** UI-/LLM-Beschreibungen (`paramSchema`) veralten gegenüber den
   tatsächlichen Contract-Fähigkeiten — dokumentierter Vorfall: ein Feld beschrieb den
   Aave-`TARGET_HF`-Modus als „not yet available", obwohl der Contract ihn längst
   unterstützte; der Assistent verweigerte daraufhin gültige Eingaben
   (siehe Kommentar „TARGET_HF drift class" in `packages/backend/src/catalog/catalog-integrity.ts`).
2. **Deploy-Drift:** Bei jedem Fork-Redeploy bekommen Contracts neue Adressen. Alte
   StepType-Zeilen aus früheren Deploys blieben in der DB liegen und tauchten als
   Duplikate im Editor auf; nicht-deployte Steps (Adresse `0x0`) kollidierten auf dem
   Unique-Key und verdeckten einander.
3. **Per-Step-Sonderlogik:** Ohne schema-getriebene Semantik (welches Feld ist Token,
   Betrag, Empfänger, Richtung?) bräuchte jeder Konsument per-Step-Type-Code — mit
   Sicherheitsfolgen: ein nicht als Empfänger markiertes Geld-Ziel-Feld wäre für
   Summary-Decoder und Adress-Allowlist unsichtbar.

Zusätzlich braucht der KI-Assistent kuratierte Few-Shot-Beispiele („Recipes"), die
niemals auf nicht-existente oder gedriftete Step-Types verweisen dürfen.

## Zielbild

Ein einziger, versionierter StepType-Katalog im Repo
(`packages/backend/prisma/seed/step-types.ts` + `seed/catalog/*`) ist die Source of
Truth. Der Seed spiegelt ihn deterministisch und **self-pruning** in die Datenbank:
nur deployte Steps werden geseedet, alles Nicht-Aktuelle wird entfernt. Ein
CI-Integritäts-Guard (`checkCatalogIntegrity`) lässt widersprüchliche Metadaten den
Build brechen statt beim Nutzer aufzuschlagen. Step-Semantik wird ausschließlich über
Schema-Annotationen (`x-ui-role`, `x-ui-widget`) aufgelöst (`packages/shared/src/step-roles.ts`).
Recipes sind team-kuratierte Platzhalter-Graphen ohne Adressen, die beim Seed gegen den
deployten Katalog validiert und bei Verstoß übersprungen werden.

## Messbares Ziel (aus dem Code abgeleitet)

- `checkCatalogIntegrity(STEP_TYPE_CATALOG)` liefert `[]` — der reale Katalog ist im
  CI-Test dauerhaft „clean" (`packages/backend/src/catalog/catalog-integrity.spec.ts`, Test 3.1).
- Nach jedem `pnpm db:seed` existieren in der DB **genau** die StepType-Zeilen des
  aktuellen Deploys (0 Duplikate, 0 Zero-Address-Zeilen, 0 Altbestände) —
  erzwungen durch Skip + Pre-Delete + id-basiertes Pruning in
  `packages/backend/prisma/seed.ts`.
- Jedes ausgelieferte Recipe referenziert ausschließlich existierende Step-Types und
  existierende Param-Keys (`validateRecipeShape`-Fehlerliste leer); ungültige Recipes
  werden mit Warnung übersprungen, nie ausgeliefert.
- Neue Steps/Felder erfordern nur Katalog-Metadaten, keinen neuen Konsumenten-Code
  (Rollen-/Widget-Auflösung ist generisch).
