# Katalog-Tools + Mindest-Annotations-Pass

## Parent PRD

mcp-integration.md

## What to build

Der Agent kann den Baustein-Katalog konsumieren: `list_step_types` (Conditions + Actions:
Name, Kategorie, Kurzbeschreibung) und `describe_step_type` (`paramSchema` JSON-Schema-treu,
Param-Bedeutungen, gelesene/geschriebene Kontext-Slots soweit das Schema das hergibt). Nur
**tatsächlich deployte** StepTypes (keine Null-Adressen). Tools rufen das bestehende
`/step-types`.

**Backend-Voraussetzung (MVP-Pflicht):** ein **Mindest-Annotations-Pass** über den
StepType-Seed, der jedem Feld einen **Rollen-Marker** gibt (Token / Betrag / Empfänger /
Richtung). Konkret fehlt heute u. a. ein Rollen-Marker an `ERC20TransferAction.recipient`
(`packages/backend/prisma/seed.ts`) — ohne ihn sind Empfänger-Felder für `SummaryDecoder`
(Slice 07) **und** den Adress-Allowlist-Guard (Slices 09/10) unsichtbar. Siehe PRD
_Backend-Änderungen_ und _Calldata-/Graph-Decoder_.

## Acceptance criteria

- [ ] `list_step_types` listet alle deployten Conditions + Actions; Null-Adress-Bausteine sind ausgeschlossen.
- [ ] `describe_step_type` liefert `paramSchema` JSON-Schema-treu inkl. Defaults, Param-Bedeutungen und (soweit ableitbar) gelesener/geschriebener Kontext-Slots.
- [ ] Jeder vom Agenten verbaubare Step hat Rollen-Marker für Token/Betrag/Empfänger/Richtung (soweit zutreffend); `ERC20TransferAction.recipient` ist annotiert (`account-selector` bzw. `x-ui-role: recipient`).
- [ ] `prisma:seed` läuft mit den ergänzten Annotationen durch; bestehende Frontend-Form-Widgets bleiben unverändert funktionsfähig.
- [ ] Test: ein Step **ohne** Empfänger-Annotation wird vom Annotations-Check als Lücke erkannt (verhindert stilles Durchrutschen für spätere Guards).

## Blocked by

- Blocked by #01

## User stories addressed

- User story 19
- User story 20
- User story 21
- User story 22
- User story 23
