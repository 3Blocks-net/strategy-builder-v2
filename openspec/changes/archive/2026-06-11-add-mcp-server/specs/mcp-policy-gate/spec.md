## ADDED Requirements

### Requirement: Server-erzwungenes Confirm-Gate

Das System SHALL ein `PolicyGate` als zentralen Signing-Chokepoint bereitstellen, das für sensibel markierte schreibende/signierende Aktionen eine Bestätigung server-seitig erzwingt (nicht per Prompt umgehbar). Das Confirm SHALL primär per MCP-Elicitation erfolgen; fehlt Support, SHALL eine lokale Bestätigungsseite (localhost) geöffnet werden, deren Summary direkt vom Server-Prozess kommt. Die Freigabe SHALL ein server-interner Zustand sein (einmaliges, pro-Aktion erzeugtes Approval-Token, vom LLM nicht fälschbar). Das write-Tool SHALL synchron blockieren, bis Freigabe oder Timeout; Timeout SHALL ein hartes Fail ohne Signieren sein.

#### Scenario: Bestätigung ist nicht per Prompt aushebelbar

- **WHEN** ein Prompt-Injection-Versuch das Confirm umgehen will
- **THEN** bleibt die Bestätigung server-erzwungen und die Aktion wird ohne echte Freigabe nicht signiert

#### Scenario: Selbst-Bestätigung des LLM wird abgelehnt

- **WHEN** das LLM versucht, die Freigabe selbst zu erzeugen
- **THEN** wird sie nicht akzeptiert (Freigabe = server-interner, nicht fälschbarer Zustand)

#### Scenario: Timeout = hartes Fail

- **WHEN** keine Bestätigung innerhalb des Timeouts erfolgt
- **THEN** schlägt das write-Tool hart fehl und es wird nicht signiert

### Requirement: create_vault als erste signierende Aktion

Das System SHALL das Tool `create_vault` bereitstellen, das den Deposit-Token gegen die FeeRegistry vor dem Senden validiert, andernfalls eine klare Fehlermeldung ohne TX liefert. Bei Erfolg SHALL es die neue Vault-Adresse und den TX-Hash (BscScan-fähig) zurückgeben; bei Revert eine dekodierte Fehlermeldung. Der neue Vault SHALL anschließend in `list_vaults` und der Web-UI erscheinen.

#### Scenario: Ungültiger Deposit-Token

- **WHEN** der Deposit-Token nicht von der FeeRegistry akzeptiert wird
- **THEN** liefert `create_vault` eine klare Fehlermeldung und sendet keine TX

#### Scenario: Erfolgreiche Erstellung

- **WHEN** ein gültiger Vault nach Bestätigung erstellt wird
- **THEN** gibt das Tool die neue Vault-Adresse + TX-Hash zurück, und der Vault erscheint in `list_vaults` und der Web-UI

#### Scenario: Revert wird dekodiert

- **WHEN** die Erstellungs-TX revertet
- **THEN** liefert das Tool eine dekodierte, verständliche Fehlermeldung

### Requirement: Append-only Audit-Log

Das System SHALL jede Aktion in ein append-only lokales Audit-Log schreiben (Zeitpunkt, Tool, Parameter, TX-Hash, Ergebnis); jeder Confirm-Pfad SHALL Summary + Outcome festhalten. Der Nutzer SHALL das Log abrufen können.

#### Scenario: Aktion landet im Audit-Log

- **WHEN** eine schreibende Aktion durch das PolicyGate läuft
- **THEN** wird ein Eintrag mit Summary + Outcome in das append-only Audit-Log geschrieben

### Requirement: Schutzschichten (Read-only, Max-Betrag, Allowlist, Capability-Opt-in)

Das System SHALL einen Read-only-Modus (Config-Flag) bereitstellen, der alle write/signing-Tools deaktiviert; einen konfigurierbaren Max-Betrag pro Aktion (pro Token), dessen Überschreitung die Aktion blockiert bzw. eine gesonderte Freigabe erfordert; eine Adress-Allowlist für Geld-Ziele; und ein Capability-Opt-in, das sensible Steps per Default verbietet und nur out-of-band per Config freischaltbar macht.

#### Scenario: Read-only deaktiviert Writes

- **WHEN** der Read-only-Modus aktiv ist
- **THEN** sind alle write/signing-Tools deaktiviert
