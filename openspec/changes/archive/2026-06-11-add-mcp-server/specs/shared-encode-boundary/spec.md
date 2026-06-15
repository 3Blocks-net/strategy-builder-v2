## ADDED Requirements

### Requirement: Encode-Boundary als einzige geteilte Quelle

Das System SHALL `mapGraphToRaw`, `buildContextOverrides` und `mapParamsToRaw` (inkl. zugehöriger Typen) in `packages/shared` bereitstellen und über die `exports`-Map verfügbar machen. Frontend und MCP-Server SHALL dieselbe `shared`-Version konsumieren; es SHALL keine Duplikation der Boundary geben.

#### Scenario: Frontend nutzt die shared-Version

- **WHEN** das Frontend gebaut wird
- **THEN** importiert es die Encode-Boundary aus `packages/shared`, und die alte Kopie in `features/automation-editor/lib/encode-boundary.ts` existiert nicht mehr

#### Scenario: Refactor ohne Verhaltensänderung

- **WHEN** `pnpm shared:build`, `frontend:build` und `frontend:test` laufen
- **THEN** sind sie unverändert grün (keine Verhaltensänderung in der Web-UI)

### Requirement: Mapper-Tests in shared

Das System SHALL die bestehenden Mapper-Tests auf die `shared`-Version umziehen — table-driven, ohne LLM und ohne Chain.

#### Scenario: Mapper-Tests grün in shared

- **WHEN** die `shared`-Testsuite läuft
- **THEN** prüfen die umgezogenen table-driven Mapper-Tests `friendly → raw` und sind grün
