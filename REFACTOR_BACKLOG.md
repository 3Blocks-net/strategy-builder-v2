# Refactor-Backlog

Lebende Liste der Refactor-Möglichkeiten aus der Architektur-Untersuchung (2026-06-12).
Keine Merge-Blocker — Tech-Debt, priorisiert. Architektonisch ist das Projekt gesund und
durchgängig schema-getrieben (kein per-Protokoll-/per-Step-Type-Branching im generischen
Code); dies sind Verbesserungen, keine Defekte.

**Status der zwei wertvollsten Punkte:** R1 + R2 sind als OpenSpec-Change
`harden-step-catalog` aufgesetzt (siehe `openspec/changes/harden-step-catalog/`) und hier
nur referenziert.

| # | Auffälligkeit | Datei(en) | Aufwand | Wert | Status |
|---|---|---|---|---|---|
| R1 | `seed.ts`-Monolith aufteilen | `backend/prisma/seed.ts` | M | Hoch | ✅ `harden-step-catalog` |
| R2 | Schema↔Contract-Integritäts-Guard | `backend` Test | S–M | Hoch | ✅ `harden-step-catalog` |
| R7 | harden-step-catalog Review-Follow-ups | `backend/src/catalog` | S | Niedrig–Mittel | offen |
| R3 | `dynamic-form.tsx` God-File + Widget-`if`-Kette | `frontend` | M | Mittel | offen |
| R4 | Cross-Package-Konstanten dupliziert | mehrere | S–M | Mittel | offen |
| R5 | `cockpit.module` Adapter-Factory koppelt 3 Edits | `backend` | S | Niedrig | offen |
| R6 | `mcp/index.ts` God-File | `mcp` | M | Niedrig | offen (= add-mcp-server §15.10) |
| T1 | Über-exponierte `shared`-Barrel-Exports | `shared/src/index.ts` | XS | Niedrig | offen |

---

## R3 — `dynamic-form.tsx` God-File + Widget-Dispatch als `if`-Kette

**Datei:** `packages/frontend/src/features/automation-editor/components/dynamic-form.tsx`
(1048 Z. — größte Quelldatei des Repos). Der Widget-Dispatch ist eine 10er-`if (widget === …)`-Kette.

**Problem:** Ein neues Widget bedeutet, mittendrin in einer langen Datei eine `if`-Verzweigung
zu ergänzen; die Feld-Komponenten leben mit im selben File.

**Vorschlag:** Feld-Komponenten in eigene Dateien auslagern und den Dispatch durch eine
`Record<string, FieldComponent>`-Registry ersetzen (`widget → Component`). Reduziert die Datei
drastisch und macht das Hinzufügen eines Widgets zu einem Map-Eintrag. Verhaltensneutral,
durch die bestehenden Feld-Tests (`__tests__/*-field.test.tsx`) abgesichert.

## R4 — Cross-Package-Konstanten dupliziert (Drift-Risiko)

Keine Single Source — dieselben Werte in mehreren Paketen hartkodiert:

- **EVM-Adress-Regex** `/^0x[0-9a-fA-F]{40}$/` (×5): `mcp/backend-client.ts`, `mcp/index.ts`,
  `mcp/config-validation.ts`, `mcp/tools/money-movement.ts`, `shared/validation.ts`.
- **ERC20-ABI-Fragmente** (allowance/approve/balanceOf, ×4): `backend/.../aave-v3.adapter.ts`,
  `backend/.../pancake-v3.adapter.ts`, `backend/portfolio/alchemy.service.ts`,
  `mcp/money-chain.ts`.
- **USDT-BSC-Adresse** `0x55d3…7955` (×4): `backend/portfolio/alchemy.service.ts`,
  `backend/vault/dto/create-vault.dto.ts`, `frontend/hooks/use-approve-and-deposit.ts`,
  `mcp/money-chain.ts`.
- **PancakeSwap-Factory-Default** `0x0BFb…1865` (×4): `backend/.../pancake-v3.adapter.ts`,
  `frontend/.../pool-validity.ts`, `mcp/config.ts`, `mcp/session.test.ts`.

**Vorschlag:** `shared/src/addresses.ts` (kanonische BSC-Token-/Protokoll-Adressen) +
`shared` `EVM_ADDRESS`-Regex + ein wiederverwendbares ERC20-Mini-ABI; Pakete konsumieren das.
Vorsicht bei der MCP-Grenze (MCP nutzt `shared` bereits). Senkt das stille Drift-Risiko bei
Adress-/ABI-Änderungen. (Die MCP-interne EVM-Regex-Dup ist auch in add-mcp-server §15.15 notiert.)

## R5 — `cockpit.module` Adapter-Factory koppelt 3 Edits

**Datei:** `packages/backend/src/cockpit/cockpit.module.ts` (`PROTOCOL_ADAPTERS`-Factory).
Ein neuer Protokoll-Adapter erfordert 3 gekoppelte Änderungen an einer Stelle: Factory-Parameter,
Rückgabe-Array und `inject`-Array.

**Vorschlag:** Multi-Provider-Pattern (jeden Adapter unter ein gemeinsames Multi-Token
registrieren, NestJS sammelt sie in ein Array) — dann ist „neuer Adapter" ein einzelner
Provider-Eintrag. Klein; senkt die Friktion der ansonsten exzellenten Read-Side-Erweiterbarkeit
(siehe `ADDING_A_PROTOCOL.md`).

## R6 — `mcp/index.ts` God-File

**Datei:** `packages/mcp/src/index.ts` (560 Z.). Registriert alle 21 Tools inline; genau hier
schlüpfte der `getTokenDecimals`-Rekursions-Critical durch, weil Unit-Tests die Deps direkt
injizieren und das Wiring nie ausführen.

**Vorschlag:** Tool-Registrierung pro Domäne in `register*`-Module extrahieren
(read/build/money/lifecycle) + ein Wiring-/Integrationstest. Bereits getrackt als
add-mcp-server **§15.10/§15.11** (archiviert) — hier zur Vollständigkeit gespiegelt.

## T1 — Über-exponierte `shared`-Barrel-Exports

**Datei:** `packages/shared/src/index.ts`. `encodeTimestamp` und `mapParamsToRaw` werden über
den Barrel re-exportiert, aber nur **shared-intern** genutzt (kein externer Konsument; Tests
importieren direkt aus der Modul-Datei).

**Vorschlag:** beide aus `index.ts` entfernen, intern lassen. Trivial; verkleinert die
öffentliche API-Oberfläche auf das tatsächlich Konsumierte.

---

## R7 — harden-step-catalog: deferred Review-Findings

Aus dem `/code-review` des Branches (alle non-blocking; die zwei Hard-Recommendations
— Withdraw `x-ui-modes`, `\breserved\b`-Regex — sind bereits gefixt). Offen:

- **Äquivalenz-Test fehlt (Refactor-Schutz):** Task 4.4 ist nur ein **manueller** Hash-Check,
  kein committeter CI-Test. Ein kleiner Snapshot-/Deep-Equal-Test über `STEP_TYPE_CATALOG`
  würde stille Mutationen bei künftigen Katalog-Edits blocken.
- **Guard-Edge-Cases ungetestet:** null/leeres `abiFragment`/`paramSchema`; ein Step mit
  Capability aber ohne `aave-amount-mode`-Feld (Mode-Regeln skippen, ABI/Rollen-Regeln greifen);
  ein Step ohne Capability; der `?? zero-address`-Fallback in `seed.ts`.
- **`AMOUNT_MODE_WIDGET` ist ein einzelner Hardcode** (`catalog-integrity.ts:48`) → bei einem
  künftigen Nicht-Aave-Mode-Widget skippt der Guard dessen Mode-Regeln still. Zu `Set` generalisieren.
- **`FRIENDLY_WIDGETS` spiegelt `shared/encode-boundary.ts`** ohne Compile-Link → ein neues
  friendly-Widget dort ohne Guard-Update erzeugt false-positive `abi-schema-drift`-CI-Fails.
  Guard-Test ergänzen oder das Set aus `shared` exportieren.
- **`ACTION_CAPABILITIES`-Keys nicht compile-gelinkt** zu den Katalog-`contractKey`-Werten →
  ein Rename trennt die Capability-Lookup still. Key-Konstanten exportieren.
- **`StepTypeDef.paramSchema`/`abiFragment` sind `unknown`** → erzwingt den
  `as Parameters<…>[0]`-Cast im Rollen-Check. Mit `shared` `ParamSchema`/`AbiFragment` typisieren,
  Cast entfällt, `satisfies` erzwingt die Form.
- **tsconfig-Pfad-Alias** für den `src/`-Test-Import aus `prisma/seed/step-types` (stabil, falls
  der Katalog später nach `shared` wandert).

## Bereits getrackt (archivierter Change `add-mcp-server`, §15)

Aus dem Holistic-Review des MCP-Pakets, noch offen (nicht Teil dieses Backlogs, aber hier
verlinkt): §15.11 Test-Lücke (index.ts-Wiring / chain-Executors / Localhost-HTTP-Pfad),
§15.12 `graph/intent as never` an der propose-Boundary, §15.13 viem/ethers-ABI-Casts,
§15.14 Upward-Type-Imports & vault-guard-Kopplung, §15.15 `EVM_ADDRESS`-Regex-Dedup (⊂ R4).

## Nicht-Code-Housekeeping (Working Tree)

Untracked/zu klären, kein Dead Code: `scripts/ralph/` (persönliches Agent-Loop-Skript),
`WORKFLOW.md`, `.claude/`. `learning-tests/` ist bereits gelöscht.
