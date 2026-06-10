# Read-/Discovery-Tools (owner-isoliert)

## Parent PRD

mcp-integration.md

## What to build

Der verbundene Nutzer fragt seinen Bestand bestätigungsfrei ab: Vaults, Portfolio/Bestände,
Gas-Deposit-Stand, Automations (aktiv/pausiert, owner-only/public, Kurzbeschreibung) und
Ausführungsverlauf inkl. dekodierter Fehlschläge (`Step N: <reason>`).

Read-Tools `list_vaults`, `get_vault`, `get_portfolio`, `list_automations`,
`get_executions` rufen die **bestehenden owner-guarded Backend-Endpunkte** mit dem
Session-JWT auf (`GET /vaults` filtert serverseitig nach JWT-`sub`; Portfolio-/Execution-/
Gas-Deposit-Endpunkte analog). Owner-Isolation ist damit backend-getragen, ohne MCP-
spezifischen Code. Ergebnisse sind strukturiert (LLM-interpretierbar), nicht Roh-Hex. Siehe
PRD _Tool-Oberfläche → Read_ und _Backend-Module_.

## Acceptance criteria

- [ ] Alle fünf Read-Tools liefern strukturierte, LLM-freundliche Ergebnisse aus den bestehenden Endpunkten.
- [ ] **Owner-Isolation:** gegen gemockte Backend-Antworten liefern Read-Tools **nur** Vaults/Daten des verbundenen Owners; Fremd-Vault-Zugriff ist unmöglich.
- [ ] Leerzustand (Vault ohne Daten) → klare Leer-Antwort statt Fehler; korrekt von echten Fehlern unterschieden.
- [ ] `get_executions` gibt erfolgreiche Runs, Deposits/Withdraws und **dekodierte** Fehlschläge zurück.
- [ ] Alle Read-Tools sind bestätigungsfrei (kein Confirm-Gate).

## Blocked by

- Blocked by #01

## User stories addressed

- User story 11
- User story 12
- User story 13
- User story 14
- User story 15
- User story 16
- User story 17
- User story 18
