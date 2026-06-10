# `deploy_automation` (signieren & deployen)

## Parent PRD

mcp-integration.md

## What to build

Der Abschluss des Kern-MVP: ein validierter Entwurf geht on-chain. `deploy_automation` nimmt
**nur die Draft-ID** (aus Slice 08), signiert die nötigen TX (Kontext-Setup + create/update)
und gibt **On-Chain-Automation-ID + TX-Hash(es)** zurück; die Automation erscheint in Slice
03 und der Web-UI.

- **Confirm via `SummaryDecoder`:** die Bestätigung zeigt die (b)-Decode des **gespeicherten**
  Entwurfs (nicht die LLM-Erzählung), inkl. `execution: public|owner` und Hervorhebung
  **verzweigter** (nicht voll cross-checkbarer) Graphen.
- **Sensibilitäts-Gate:** enthält der Graph einen **sensibel markierten** Step, ist Confirm
  Pflicht (PolicyGate aus Slice 06); rein nicht-sensible Graphen können bestätigungsfrei sein.
- **In-Automation-Adress-Allowlist:** ein `ERC20Transfer.recipient` innerhalb des Graphen
  wird **schema-getrieben** identifiziert und gegen die Adress-Allowlist geprüft; Nicht-
  Allowlist-Ziel → Ablehnung. **Capability-Opt-in:** nicht freigeschaltete sensible Steps
  sind nicht verbaubar.
- Revert → dekodierte Fehlermeldung.

Siehe PRD _Automation aus Sprache bauen & deployen (Story 5)_ und _Schutzmechanismen_.

## Acceptance criteria

- [ ] `deploy_automation` nimmt eine Draft-ID, signiert Kontext-Setup + create/update und liefert On-Chain-Automation-ID + TX-Hash(es); Automation erscheint in `list_automations` und der Web-UI.
- [ ] Confirm zeigt die `SummaryDecoder`-Decode des gespeicherten Entwurfs inkl. `execution`-Modus; verzweigte Graphen sind hervorgehoben.
- [ ] Ein sensibel markierter Step erzwingt Confirm; ohne Bestätigung **kein Deploy**.
- [ ] In-Automation-`ERC20Transfer.recipient` außerhalb der Adress-Allowlist → Ablehnung; nicht freigeschaltete sensible Steps sind nicht verbaubar (Capability-Opt-in).
- [ ] **E2E-Fork:** mindestens ein AI-gebautes Muster läuft end-to-end bis zur **feuernden** Automation; ungültiger Graph wird von der Encode-Boundary abgelehnt (kein Deploy); kein Deploy ohne explizite Bestätigung.
- [ ] Revert → dekodierte, verständliche Fehlermeldung.

## Blocked by

- Blocked by #06
- Blocked by #08

## User stories addressed

- User story 34
- User story 35
