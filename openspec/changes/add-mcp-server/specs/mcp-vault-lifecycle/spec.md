## ADDED Requirements

### Requirement: Gas-Deposit-Verwaltung

Das System SHALL die Tools `top_up_gas_deposit` (`depositFees`, füllt die Gas-Comp-Reserve aus dem Vault-Guthaben auf) und `set_min_fee_deposit` (setzt das Auto-Top-up-Ziel `minFeeDeposit`) bereitstellen. Der neue Stand SHALL in `get_vault`/`get_portfolio` und der Web-UI erscheinen.

#### Scenario: Gas-Reserve auffüllen

- **WHEN** `top_up_gas_deposit` ausgeführt wird
- **THEN** wird die Gas-Comp-Reserve aufgefüllt und der neue Stand erscheint in `get_vault`/`get_portfolio` und der Web-UI

#### Scenario: minFeeDeposit setzen

- **WHEN** `set_min_fee_deposit` aufgerufen wird
- **THEN** wird `minFeeDeposit` korrekt gesetzt

### Requirement: Automation aktivieren/deaktivieren

Das System SHALL das Tool `set_automation_active` bereitstellen, das eine Automation aktiviert/deaktiviert; die Änderung SHALL sich in `list_automations` und der Web-UI widerspiegeln.

#### Scenario: Aktivieren/Deaktivieren spiegelt sich

- **WHEN** `set_automation_active` eine Automation umschaltet
- **THEN** spiegelt sich aktiv/pausiert in `list_automations` und der Web-UI

### Requirement: Lifecycle-Writes durch das PolicyGate

Das System SHALL diese Lifecycle-Writes durch das PolicyGate laufen lassen (Confirm bei Sensibilität, Read-only-Modus respektiert). Bei Revert SHALL eine dekodierte Fehlermeldung geliefert werden.

#### Scenario: Lifecycle-Write respektiert Read-only

- **WHEN** der Read-only-Modus aktiv ist
- **THEN** sind die Lifecycle-Write-Tools deaktiviert

#### Scenario: Revert wird dekodiert

- **WHEN** eine Lifecycle-TX revertet
- **THEN** liefert das Tool eine dekodierte Fehlermeldung
