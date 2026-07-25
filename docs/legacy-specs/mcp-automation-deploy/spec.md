# mcp-automation-deploy Specification

## Purpose
TBD - created by archiving change add-mcp-server. Update Purpose after archive.
## Requirements
### Requirement: deploy_automation aus Draft-ID

Das System SHALL das Tool `deploy_automation` bereitstellen, das ausschließlich eine Draft-ID (aus `propose_automation`) entgegennimmt, die nötigen TX signiert (Kontext-Setup + create/update) und die On-Chain-Automation-ID + TX-Hash(es) zurückgibt. Die Automation SHALL anschließend in `list_automations` und der Web-UI erscheinen. Bei Revert SHALL eine dekodierte Fehlermeldung geliefert werden.

#### Scenario: Erfolgreicher Deploy

- **WHEN** eine gültige Draft-ID an `deploy_automation` gegeben und bestätigt wird
- **THEN** signiert der Server Kontext-Setup + create/update und liefert On-Chain-Automation-ID + TX-Hash(es); die Automation erscheint in `list_automations` und der Web-UI

#### Scenario: Revert wird dekodiert

- **WHEN** die Deploy-TX revertet
- **THEN** liefert das Tool eine dekodierte, verständliche Fehlermeldung

### Requirement: Confirm aus gespeichertem Entwurf

Das System SHALL die Bestätigung aus der `SummaryDecoder`-Decode des gespeicherten Entwurfs erzeugen (nicht aus der LLM-Erzählung), inklusive `execution: public|owner`, und verzweigte (nicht voll cross-checkbare) Graphen hervorheben.

#### Scenario: Confirm zeigt decodierten Entwurf

- **WHEN** der Deploy bestätigt werden soll
- **THEN** zeigt das Confirm die `SummaryDecoder`-Decode des gespeicherten Entwurfs inkl. `execution`-Modus, mit hervorgehobenen verzweigten Graphen

### Requirement: Sensibilitäts-Gate und In-Automation-Schutz

Das System SHALL bei einem sensibel markierten Step im Graphen ein Confirm erzwingen (kein Deploy ohne Bestätigung). Ein `ERC20Transfer.recipient` innerhalb des Graphen SHALL schema-getrieben identifiziert und gegen die Adress-Allowlist geprüft werden (Nicht-Allowlist-Ziel → Ablehnung). Nicht freigeschaltete sensible Steps (Capability-Opt-in) SHALL nicht verbaubar sein.

#### Scenario: Sensibler Step erzwingt Confirm

- **WHEN** der Graph einen sensibel markierten Step enthält
- **THEN** ist Confirm Pflicht; ohne Bestätigung gibt es keinen Deploy

#### Scenario: In-Automation-Empfänger außerhalb Allowlist

- **WHEN** ein `ERC20Transfer.recipient` im Graphen außerhalb der Adress-Allowlist liegt
- **THEN** wird der Deploy abgelehnt

### Requirement: E2E-Fork-Nachweis

Das System SHALL mindestens ein AI-gebautes Muster end-to-end bis zur feuernden Automation nachweisen; ein ungültiger Graph SHALL von der Encode-Boundary abgelehnt werden (kein Deploy); kein Deploy SHALL ohne explizite Bestätigung erfolgen.

#### Scenario: AI-Muster feuert end-to-end

- **WHEN** ein AI-gebautes Muster im Fork-Test deployt wird
- **THEN** läuft es end-to-end bis zur feuernden Automation

