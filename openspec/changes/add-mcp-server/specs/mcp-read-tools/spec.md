## ADDED Requirements

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
