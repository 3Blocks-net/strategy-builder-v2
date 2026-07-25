# mcp-money-movement Specification

## Purpose
TBD - created by archiving change add-mcp-server. Update Purpose after archive.
## Requirements
### Requirement: deposit / withdraw mit Confirm-Gate

Das System SHALL die Tools `deposit` (Token + Betrag) und `withdraw` (Token + Betrag + Empfänger) bereitstellen. Beträge SHALL korrekt in Base-Units konvertiert werden (Token-Decimals). Jede geldbewegende Aktion SHALL durch das Confirm-Gate (PolicyGate) mit einer aus der kanonischen TX dekodierten Klartext-Summary (Betrag, Token, Empfänger) laufen. Bei Revert SHALL eine dekodierte Fehlermeldung geliefert werden (kein stiller Teilerfolg).

#### Scenario: Korrekte Base-Unit-Konvertierung mit Confirm

- **WHEN** `deposit` oder `withdraw` aufgerufen wird
- **THEN** wird der Betrag korrekt in Base-Units konvertiert und die Aktion läuft mit dekodierter Summary durch das Confirm-Gate

#### Scenario: Revert wird dekodiert

- **WHEN** eine Geldbewegungs-TX revertet
- **THEN** liefert das Tool eine dekodierte Fehlermeldung ohne stillen Teilerfolg

### Requirement: Adress-Allowlist für Withdraw-Empfänger

Das System SHALL einen Withdraw-Empfänger nur zulassen, wenn er eine Adresse aus der Allowlist ist (Owner + bewusst eingetragene Ziele); ein Nicht-Allowlist-Ziel SHALL abgelehnt werden.

#### Scenario: Empfänger außerhalb der Allowlist

- **WHEN** ein Withdraw-Empfänger nicht in der Allowlist liegt
- **THEN** wird die Aktion abgelehnt

### Requirement: Max-Betrag, Read-only und Dry-Run-Simulation

Das System SHALL das Max-Betrag-Limit pro Aktion durchsetzen (Überschreitung blockiert / erfordert gesonderte Freigabe), im Read-only-Modus alle Write-Tools deaktivieren und einen `Simulator` (Dry-Run via viem `simulateContract`/`estimateGas`) für deposit/withdraw bereitstellen, der das erwartete Ergebnis + geschätzte Fees/Gas ohne Senden liefert. Anfallende Fees (Deposit/Withdraw-BPS) SHALL vor der Bestätigung transparent gemacht werden.

#### Scenario: Max-Betrag greift

- **WHEN** eine Aktion den konfigurierten Max-Betrag überschreitet
- **THEN** wird sie blockiert bzw. erfordert eine gesonderte Freigabe

#### Scenario: Dry-Run ohne Senden

- **WHEN** `simulate_action` für deposit/withdraw aufgerufen wird
- **THEN** liefert der `Simulator` erwartetes Ergebnis + Fees/Gas, ohne eine TX zu senden

#### Scenario: Fee-Transparenz vor Confirm

- **WHEN** eine geldbewegende Aktion bestätigt werden soll
- **THEN** werden die anfallenden Fees vor der Bestätigung transparent gemacht

