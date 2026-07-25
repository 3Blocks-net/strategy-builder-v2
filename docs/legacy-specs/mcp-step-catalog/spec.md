# mcp-step-catalog Specification

## Purpose
TBD - created by archiving change add-mcp-server. Update Purpose after archive.
## Requirements
### Requirement: StepType-Katalog-Tools

Das System SHALL `list_step_types` (Conditions + Actions: Name, Kategorie, Kurzbeschreibung) und `describe_step_type` (`paramSchema` JSON-Schema-treu inkl. Defaults, Param-Bedeutungen, gelesene/geschriebene Kontext-Slots soweit ableitbar) über das bestehende `/step-types` bereitstellen. Nur tatsächlich deployte StepTypes SHALL widergespiegelt werden (keine Null-Adress-Bausteine).

#### Scenario: Auflistung nur deployter Steps

- **WHEN** `list_step_types` aufgerufen wird
- **THEN** werden alle deployten Conditions und Actions gelistet und Null-Adress-Bausteine ausgeschlossen

#### Scenario: Schema-treue Detailbeschreibung

- **WHEN** `describe_step_type` für einen Step aufgerufen wird
- **THEN** liefert es das `paramSchema` JSON-Schema-treu inkl. Defaults, Param-Bedeutungen und (soweit ableitbar) gelesener/geschriebener Kontext-Slots

### Requirement: Mindest-Annotations-Pass (Rollen-Marker)

Das System SHALL im StepType-Seed jedem relevanten Feld einen Rollen-Marker geben (Token / Betrag / Empfänger / Richtung), soweit zutreffend. Insbesondere SHALL `ERC20TransferAction.recipient` annotiert sein (`account-selector` bzw. `x-ui-role: recipient`). Bestehende Frontend-Form-Widgets SHALL unverändert funktionsfähig bleiben.

#### Scenario: Seed mit Annotationen läuft durch

- **WHEN** `prisma:seed` mit den ergänzten Annotationen läuft
- **THEN** läuft der Seed durch und die bestehenden Frontend-Form-Widgets bleiben funktionsfähig

#### Scenario: Fehlende Empfänger-Annotation wird erkannt

- **WHEN** ein Step ohne Empfänger-Annotation vorliegt
- **THEN** erkennt der Annotations-Check die Lücke (verhindert stilles Durchrutschen für spätere Guards)

