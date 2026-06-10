# `shared`-Extraktion der Encode-Boundary

## Parent PRD

mcp-integration.md

## What to build

Die Encode-Boundary wird **eine einzige Quelle**: `mapGraphToRaw`, `buildContextOverrides`
und `mapParamsToRaw` ziehen aus dem Frontend
(`features/automation-editor/lib/encode-boundary.ts`) nach `packages/shared`. Sie hängen
bereits ausschließlich von `shared`-Helfern ab (`toSeconds`, `encodeTimestamp`,
`toBaseUnits`, `zeroToggleField`, `validateParams`), die Extraktion ist daher rein. Das
Frontend importiert danach die `shared`-Version (eigene Kopie entfällt); der MCP-Server
(Slice 08) konsumiert denselben Mapper.

Reiner Enabler/Refactor ohne Verhaltensänderung — er de-riskt den Mapper-Konsum durch den
MCP, bevor AI-Building beginnt. Siehe PRD _Wiederverwendung der Encode-Boundary (deep
module)_.

## Acceptance criteria

- [ ] `mapGraphToRaw`/`buildContextOverrides`/`mapParamsToRaw` (+ zugehörige Typen) liegen in `packages/shared` und sind über die `exports`-Map verfügbar.
- [ ] Das Frontend importiert die `shared`-Version; die alte Kopie in `encode-boundary.ts` ist entfernt; keine Duplikation.
- [ ] Die bestehenden Mapper-Tests sind auf die `shared`-Version umgezogen (table-driven, kein LLM, keine Chain) und grün.
- [ ] `pnpm shared:build` + `frontend:build` + `frontend:test` laufen unverändert grün (keine Verhaltensänderung in der Web-UI).

## Blocked by

None - can start immediately.

## User stories addressed

- User story 32
