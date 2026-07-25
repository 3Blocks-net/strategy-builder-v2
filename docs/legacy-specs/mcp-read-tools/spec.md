# mcp-read-tools Specification

## Purpose
TBD - created by archiving change add-mcp-server. Update Purpose after archive.
## Requirements
### Requirement: Owner-isolierte Lese-Tools

Das System SHALL die Lese-Tools `list_vaults`, `get_vault`, `get_portfolio`, `list_automations` und `get_executions` bereitstellen, die die bestehenden owner-guarded Backend-Endpunkte mit dem Session-JWT aufrufen. Alle Ergebnisse SHALL ausschließlich Vaults/Daten des verbundenen Owners enthalten; Fremd-Vault-Zugriff SHALL unmöglich sein. Ergebnisse SHALL strukturiert und LLM-interpretierbar sein (nicht Roh-Hex).

#### Scenario: Strukturierte, owner-begrenzte Ergebnisse

- **WHEN** ein verbundener Nutzer ein Lese-Tool gegen gemockte Backend-Antworten aufruft
- **THEN** liefert das Tool strukturierte Ergebnisse, die nur Vaults/Daten des verbundenen Owners enthalten

#### Scenario: Fremd-Vault-Zugriff unmöglich

- **WHEN** ein Vault eines anderen Owners angefragt würde
- **THEN** liefert das Tool keine Daten dieses fremden Vaults

### Requirement: Dekodierter Ausführungsverlauf

Das System SHALL über `get_executions` erfolgreiche Runs, Deposits/Withdraws und dekodierte Fehlschläge in der Form `Step N: <reason>` zurückgeben.

#### Scenario: Fehlgeschlagener Run wird dekodiert

- **WHEN** ein Run on-chain fehlgeschlagen ist
- **THEN** enthält die Ausgabe einen dekodierten Grund `Step N: <reason>` statt rohem Hex

### Requirement: Leerzustand und Bestätigungsfreiheit

Das System SHALL bei einem Vault ohne Daten eine klare Leer-Antwort statt eines Fehlers liefern und Leerzustand korrekt von echten Fehlern unterscheiden. Alle Lese-Tools SHALL bestätigungsfrei sein (kein Confirm-Gate).

#### Scenario: Vault ohne Daten

- **WHEN** ein Vault des Owners keine Daten hat
- **THEN** liefert das Tool eine klare Leer-Antwort, keinen Fehler

#### Scenario: Lesen ohne Confirm

- **WHEN** ein Lese-Tool aufgerufen wird
- **THEN** wird kein Confirm-Gate ausgelöst

### Requirement: DeFi-Positionen, Performance und Wertverlauf

Das System SHALL owner-isolierte Tools `get_positions`, `get_performance` und `get_value_history` über die bestehenden Cockpit-Endpunkte (`GET /vaults/:address/positions`, `/performance`, `/value-history`) bereitstellen. `get_positions` SHALL die vereinheitlichte, USD-bewertete Positionssicht (Idle-Token, Gas-Reserve, Protokoll-Adapter-Positionen wie Aave/PancakeSwap, Netto-Equity) liefern. `get_performance` und `get_value_history` SHALL einen Zeitbereich (`24h|7d|30d|all`) akzeptieren. Fremd-Vault-Zugriff SHALL abgelehnt werden (owner-guarded), und diese Tools SHALL bestätigungsfrei sein.

#### Scenario: Positionssicht des eigenen Vaults

- **WHEN** `get_positions` für einen Vault der verbundenen Adresse aufgerufen wird
- **THEN** liefert es die USD-bewertete Positionssicht inkl. Protokoll-Adapter-Positionen und Netto-Equity

#### Scenario: Zeitbereich für Performance/Verlauf

- **WHEN** `get_performance` oder `get_value_history` mit einem Bereich (`24h|7d|30d|all`) aufgerufen wird
- **THEN** wird der Bereich an den Cockpit-Endpunkt durchgereicht

#### Scenario: Fremder Vault wird abgelehnt

- **WHEN** eines dieser Tools für einen fremden Vault aufgerufen wird
- **THEN** wird der Zugriff abgelehnt (kein Daten-Leak)

