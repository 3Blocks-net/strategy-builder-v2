## Why

On-Chain-Strategien lassen sich heute nur über die Web-UI mit Graph-Editor erstellen und betreiben — eine hohe Einstiegshürde für neue Nutzer und ein wiederkehrender Medienbruch für Power-User. Es gibt **keinen Weg, eine Strategie in Worten zu beschreiben** und sie sicher umsetzen zu lassen, obwohl unser Deskriptor (`paramSchema`, bereits JSON-Schema) und unsere validierende Encode-Boundary (`mapGraphToRaw` + `validateParams(mode:'raw')` + Raw-Mode-Guards) die idealen Bausteine dafür bereits liefern. Der entscheidende Konflikt: Der **Self-Custody-USP** darf durch eine KI-Steuerung nicht untergraben werden — ein Agent mit Signing-Vollmacht kann durch Fehlinterpretation oder **Prompt-Injection** echtes Vermögen bewegen.

## What Changes

- Neues lokales Workspace-Paket **`packages/mcp`** (stdio-Transport, offizielles MCP SDK, viem), das ein Nutzer in Claude Desktop registriert. Der Server liest einen **verschlüsselten Keystore** (Passwort über OS-Keychain), leitet die Owner-Adresse ab und authentifiziert sich per **server-seitig signierter SIWE-Nachricht** gegen das bestehende Backend. Alle Tools operieren **ausschließlich** auf den Vaults dieser Owner-Adresse.
- **Lese-Tools** (bestätigungsfrei, owner-isoliert): Vaults, Portfolio, Gas-Deposit, Automations, Ausführungsverlauf inkl. dekodierter Fehlschläge.
- **Katalog-Tools**: StepTypes auflisten/beschreiben (JSON-Schema-treu) + **kuratierte Recipe-Shapes** (DCA, Stop-Loss, HF-Schutz) als Few-Shot-Referenz.
- **AI-Building**: Strategie in natürlicher Sprache → Agent assembliert **frei** einen Graphen → bestehende **Encode-Boundary** lehnt Ungültiges ab, **bevor** etwas on-chain geht → **Intent-Cross-Check** (deklarierter Intent vs. server-decodierter Graph) → Deploy nach expliziter Bestätigung.
- **Schreibende/geldbewegende Tools**: Vault erstellen, deposit/withdraw, Gas-Deposit auffüllen, Automation aktivieren/deaktivieren — der Server signiert.
- **Server-erzwungene Schutzschichten (Pflicht-Querschnitt)**: Confirm-Gate (MCP-Elicitation, sonst localhost-Seite; Summary aus der kanonischen TX server-seitig decodiert, nie aus der LLM-Erzählung; Timeout = hartes Fail), Adress-Allowlist für Geld-Ziele, Capability-Opt-in für sensible Steps, Max-Betrag pro Aktion, Read-only-Modus, Dry-Run-Simulation (nur direkte Geldbewegungen), lokales Audit-Log.
- **Encode-Boundary wird eine einzige Quelle**: `mapGraphToRaw`/`buildContextOverrides`/`mapParamsToRaw` ziehen aus dem Frontend nach `packages/shared`; das Frontend importiert die `shared`-Version (Duplikat entfällt), der MCP-Server konsumiert denselben Mapper.
- **Minimale Backend-Ergänzungen** an bestehenden Pfaden: Recipe-Tabelle + Seed + Lese-Endpunkt; **Mindest-Annotations-Pass** über den StepType-Seed (Rollen-Marker Token/Betrag/Empfänger/Richtung) als Voraussetzung für `SummaryDecoder` und Allowlist-Guard. **Keine** SIWE-Domain-Allowlist (`AuthService.verify` bleibt unangetastet); keine neuen Encode-/Validierungs-Endpunkte.

## Capabilities

### New Capabilities
- `mcp-server-foundation`: MCP-Spine (stdio-Paket), `WalletSigner` (Keystore + OS-Keychain + Init-CLI), `AuthClient` (SIWE), Owner-Session, `whoami`, Erst-Verbindungs-Sicherheitshinweis & Trenn-Weg.
- `shared-encode-boundary`: Encode-Boundary als einzige geteilte Quelle in `packages/shared`, vom Frontend und MCP-Server konsumiert (Refactor ohne Verhaltensänderung der Web-UI).
- `mcp-read-tools`: Owner-isolierte Lese-Tools (`list_vaults`, `get_vault`, `get_portfolio`, `list_automations`, `get_executions`) über bestehende owner-guarded Endpunkte.
- `mcp-step-catalog`: `list_step_types`/`describe_step_type` (JSON-Schema-treu, nur deployte Steps) + Mindest-Annotations-Pass (Rollen-Marker im StepType-Seed).
- `mcp-recipes`: Recipe-Tabelle/Seed/Lese-Endpunkt + `list_recipes` (Shapes mit Platzhaltern, team-kuratiert, gegen Katalog validiert).
- `mcp-policy-gate`: `PolicyGate` (server-erzwungenes Confirm-Gate, Read-only, Max-Betrag, Adress-Allowlist, Capability-Opt-in) + `AuditLog` + erste signierende Aktion `create_vault`.
- `mcp-summary-decoder`: `SummaryDecoder` — schema-getriebene, strukturierte Decode aus kanonischer TX/raw graph (gemeinsame Quelle für Confirm-Summary und Intent-Diff).
- `mcp-automation-build`: `propose_automation` (Build über `shared`-Mapper + bestehendes `/encode`, server-interner Draft-Store) + Intent-Cross-Check + Pool-/Token-Validity-Checks (kein Signieren).
- `mcp-automation-deploy`: `deploy_automation` (nimmt Draft-ID, signiert, liefert On-Chain-ID + TX-Hashes) inkl. Sensibilitäts-Gate, In-Automation-Allowlist, E2E-Fork.
- `mcp-money-movement`: `deposit`/`withdraw` + `Simulator` (Dry-Run) + Schutzschichten (Allowlist, Max-Betrag, Read-only, Fee-Transparenz).
- `mcp-vault-lifecycle`: `top_up_gas_deposit`/`set_min_fee_deposit`/`set_automation_active` über das wiederverwendete PolicyGate.

### Modified Capabilities
<!-- Keine. openspec/specs/ ist leer; alle Capabilities sind neu. Die `shared-encode-boundary`-Extraktion berührt Frontend-Code, ändert aber kein dokumentiertes Spec-Requirement. -->

## Impact

- **Neues Paket**: `packages/mcp` (stdio, MCP SDK, viem). Native Keychain-Dependency (z. B. `keytar`) mit plattformabhängigem Build im pnpm-Workspace (bewusst akzeptiert).
- **`packages/shared`**: Encode-Boundary-Funktionen ziehen ein; `exports`-Map erweitert. **`packages/frontend`**: importiert die `shared`-Version, eigene Kopie in `features/automation-editor/lib/encode-boundary.ts` entfällt.
- **`packages/backend`**: Recipe-Prisma-Entity + Migration + Seed + Lese-Endpunkt; Rollen-Annotationen im StepType-Seed (`prisma/seed.ts`, u. a. `ERC20TransferAction.recipient`). Bestehende Endpunkte (`/auth/*`, `/vaults`, `/encode`, `/encode-update`, `/tokens/*`, `/executions`, `/step-types`) werden nur konsumiert, nicht geändert.
- **Self-Custody**: Schlüssel verlässt nie den Rechner des Nutzers; Audit-Log ist eine lokale append-only Datei.
- **Out of Scope**: Hosted/remote MCP, externer Signer, Per-Zeitfenster-Limits, struktureller Shape-Allowlist-Layer, Multi-Wallet/Team, Strategie-Marktplatz über MCP, Community-Tools, KI-Konsum externer MCP-Server, Fork-basierte Laufzeit-Simulation, Withdraw an Nicht-Allowlist-Adressen, voll cross-checkbare verzweigte Graphen.
