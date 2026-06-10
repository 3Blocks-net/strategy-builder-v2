# PolicyGate-Skelett + `create_vault`

## Parent PRD

mcp-integration.md

## What to build

Der sicherheitskritische Tracer-Bullet: die **erste signierende Schreibaktion** läuft durch
das server-erzwungene Confirm-Gate. Der Nutzer weist den Agenten an, in seinem Namen einen
Vault zu erstellen (Label, Deposit-Token); der Server signiert + sendet die TX — aber erst
nach expliziter menschlicher Bestätigung.

- **`PolicyGate` (deep module):** zentraler Signing-Chokepoint. Reine Entscheidungs-Logik
  (Confirm nötig? Read-only?) + IO-Adapter. Confirm primär per **MCP-Elicitation**, sonst
  **lokale Bestätigungsseite (localhost)**, deren Summary **direkt vom Server-Prozess**
  kommt. Freigabe = **server-interner Zustand** (einmaliges Approval-Token, vom LLM nicht
  fälschbar). Das write-Tool **blockiert synchron**; **Timeout = hartes Fail, kein
  Signieren**.
- **`AuditLog` (module):** append-only lokale Datei (Zeitpunkt, Tool, Parameter, TX-Hash,
  Ergebnis); jeder Confirm-Pfad schreibt Summary + Outcome.
- **`create_vault`:** Deposit-Token gegen FeeRegistry validieren (sonst klare Fehlermeldung
  **vor** der TX), sign+send, neue Vault-Adresse + TX-Hash (BscScan-fähig) zurück,
  dekodierter Fehler bei Revert. Vault erscheint danach in Slice 03 **und** der Web-UI.

Siehe PRD _Schutzmechanismen (Story 7)_ und _Vault erstellen (Story 4)_.

## Acceptance criteria

- [ ] `PolicyGate` erzwingt Bestätigung **serverseitig** (nicht per Prompt aushebelbar); Verhaltenstest mit Prompt-Injection-Versuch.
- [ ] Confirm via Elicitation; fehlt Support → localhost-Seite; ohne Zustimmung **kein Signieren**; **Timeout = hartes Fail**.
- [ ] Die Freigabe ist server-intern und vom LLM nicht fälschbar (Test: simuliertes „LLM bestätigt selbst" wird nicht akzeptiert).
- [ ] `create_vault` validiert den Deposit-Token gegen FeeRegistry **vor** dem Senden; ungültig → klare Fehlermeldung, keine TX.
- [ ] Erfolg → neue Vault-Adresse + TX-Hash; Revert → dekodierte Fehlermeldung; Vault erscheint in `list_vaults` und der Web-UI.
- [ ] Jede Aktion landet im append-only Audit-Log (Summary + Outcome).

## Blocked by

- Blocked by #01

## User stories addressed

- User story 25
- User story 26
- User story 27
- User story 28
- User story 29
- User story 30
- User story 47
- User story 48
- User story 49
- User story 54
- User story 55
