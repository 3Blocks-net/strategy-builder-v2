# Research: n8n als Vorbild — "n8n für die Blockchain"

> **Expiry:** Löschen nach Abschluss des "Node-Schema & AI-Integration"-Sprints (Strategie-Input, keine API-Integration). Letzter Stand der n8n-Fakten: Juni 2026.
> **Docs source:** Context7 `/n8n-io/n8n-docs` + n8n Docs (docs.n8n.io) Web-Fetch. n8n ist hier **Referenzprodukt/Inspiration**, KEINE Dependency, die wir installieren — daher keine Versions-Pins/Learning-Tests, sondern eine **Architektur- & Produkt-Vergleichsanalyse**.

## Worum geht es?

Wir bauen ein On-Chain-Automatisierungsprotokoll (BSC): Nutzer erstellen **Vaults** und konfigurieren **Automations** als gerichtete Graphen aus **Conditions** (Trigger/Verzweigung) und **Actions** (DeFi-Schritte). Ein öffentlicher Executor/Keeper ruft `executeAutomation`. n8n ist das De-facto-Open-Source-Vorbild für visuelle Workflow-Automatisierung (400+ Integrationen, Node-Graph, native AI). Unser Anspruch: **"n8n für die Blockchain"** — gleiche UX-Klasse (visueller Graph, selbsterklärende Nodes, AI-Anbindung), aber die Ausführung ist **trustless on-chain** statt auf einem zentralen Server.

Diese Datei beantwortet drei Fragen:
1. Wie ist unser "Node"-System aufgebaut vs. n8n?
2. Was macht n8n besser — und was übernehmen wir?
3. Wie nutzt n8n seine Nodes als **Informationsquelle für externe AI** — und was ist unser (großer) Vorsprung dabei?

---

## Begriffs-Mapping: n8n ↔ unser System

| n8n | Unser System | Anmerkung |
|---|---|---|
| **Node** (`INodeType`) | **StepType** (DB-Row) + Action/Condition-Contract | unsere "Node-Definition" |
| `INodeTypeDescription` | `StepType` (`name`, `description`, `category`, `paramSchema`, `abiFragment`) | reiner Daten-Deskriptor, an Frontend serialisiert |
| `properties[]` (`INodeProperties`) | `paramSchema.properties` (JSON-Schema) | **wir sind hier schon JSON-Schema-nativ** |
| `displayOptions` (bedingte Sichtbarkeit) | `x-ui-widget` + hartkodierte Logik in `dynamic-form.tsx` | n8n deklarativer (s.u.) |
| `typeOptions` / `loadOptions` (dynamische Dropdowns) | `/tokens?protocol=…`, `account-selector`, `usePoolValidity` | bei uns ad-hoc pro Widget |
| Expression-Engine (`{{ $json.x }}`, `$node[...]`) | **Context-Slots** (`bytes[]`, indexbasiert) | **größter konzeptioneller Unterschied** |
| Trigger-Node (Webhook/Poll/Cron) | step 0 = CONDITION (Interval/Timer/Balance) + öffentlicher Keeper | unser Trigger ist on-chain `isTriggerMet` |
| Execution / Execution-History | Indexer (`Execution`, `VaultEvent`, `ExecutionFailure`) + WS-Push | wir haben das bereits real-time |
| Credentials (verschlüsselt, OAuth) | Wallet / Vault-Ownership | **wir brauchen keine Secret-Verwaltung → Vorteil** |
| `usableAsTool` / `$fromAI()` / MCP-Trigger | **— existiert bei uns NICHT —** | größte AI-Lücke (s.u.) |
| Codex-File (Kategorien, Doku-URL, Alias) | nur `name` + `description` | Metadaten-Lücke (s.u.) |
| Sub-Workflow (`Execute Workflow`) | — (jede Automation ist flach) | mögliches Feature |
| Node-Versionierung (`typeVersion`) | `(contractAddress, selector)` Unique-Key | Redeploy ⇒ neue Adresse, keine Migration |
| Template-Library / Community-Nodes (npm) | — | Ökosystem-Lücke |

**Kernbefund:** Unser `paramSchema` ist bereits ein **JSON-Schema mit Vendor-Extensions** (`x-ui-widget`, `x-ui-amount-token-field`, `x-ui-zero-toggle`, …). n8n verwendet ein **proprietäres** `INodeProperties`-Format. Für die AI-Anbindung ist das ein **struktureller Vorsprung von uns** — JSON-Schema ist genau das Format, das LLMs/MCP-Tools nativ konsumieren. Wir haben die halbe Miete schon liegen, nutzen sie nur noch nicht für AI.

---

## n8n Node-Architektur (Deep-Dive)

### 1. Zwei Node-Stile
- **Declarative style** (JSON-artig, `routing` im Property) — für reine REST-API-Wrapper. Keine `execute()`-Funktion, n8n macht den HTTP-Call aus den Property-Metadaten.
- **Programmatic style** (`execute()`-Funktion in TS) — für komplexe Logik, Binärdaten, Transforms.

→ **Für uns relevant:** Unsere Actions sind *immer* "programmatic" (Solidity-Contract via delegatecall). Aber der **Deskriptor** (`paramSchema`) ist deklarativ — wie n8ns declarative Properties. Gut so.

### 2. `INodeTypeDescription` — der serialisierbare Deskriptor
Wird komplett ans Frontend übertragen und rendert die UI. Felder u.a.:
`displayName`, `name`, `icon`, `group`, `version`, `description`, `defaults`, `inputs`/`outputs`, `credentials`, `properties[]`, `codex`, `usableAsTool`.

### 3. `properties[]` — die einzelnen Felder
Jedes Feld (`INodeProperties`): `displayName`, `name`, `type` (string/number/boolean/options/collection/resourceLocator/…), `default`, `description`, `placeholder`, `hint`, sowie zwei mächtige Mechanismen:

- **`displayOptions`** — deklarative bedingte Sichtbarkeit: `{ show: { resource: ['message'], operation: ['send'] } }`. Felder erscheinen nur, wenn andere Felder bestimmte Werte haben. **Rein datengetrieben, kein Code.**
- **`typeOptions`** — u.a. `loadOptionsMethod` (dynamische Dropdowns vom Backend/API), `multipleValues`, `minValue`/`maxValue`, `editor` (Code-Editor), `password`.

→ **Bei uns** ist bedingte Sichtbarkeit (z.B. `aave-amount-mode` blendet je nach Modus Amount-Input / Slot-Picker / "full balance"-Hinweis ein) **in `dynamic-form.tsx` hartkodiert**. n8n macht das **deklarativ im Schema** → neue Felder ohne Frontend-Code. Das ist ein direkter Verbesserungspunkt.

### 4. Codex-File — Metadaten für Discovery & AI-Kategorisierung
Separate JSON-Datei pro Node mit: **categories**, **subcategories** (verschachtelt, z.B. OpenAI → Assistant/Audio/Image/Text), **resources** (Doku-URL, "Common issues"-URL, Credential-Doku), **alias** (Such-Synonyme). Wird **zur Laufzeit für AI-Kategorisierungs-Queries und Telemetrie gelesen** und steuert die Node-Palette/Suche.

→ **Bei uns** hat `StepType` nur `name` + `description` + `category` (CONDITION/ACTION). Es fehlen: Subkategorie-Taxonomie (Aave/PancakeSwap/Time/…), Doku-URL, Alias/Synonyme, Anwendungsbeispiele, "wann benutzen". Das ist genau die "gute Informationsquelle für außenstehende AI", die der Auftrag erwähnt.

### 5. Datenfluss-Modell (der fundamentale Unterschied)
n8n schickt zwischen Nodes ein **Array typisierter JSON-Items**. Jedes Feld kann per **Expression** auf Outputs vorheriger Nodes verweisen: `{{ $json.amount }}`, `{{ $node["HTTP Request"].item.json.price }}`. **Item-Pairing** verfolgt, welches Output-Item aus welchem Input-Item entstand.

→ **Bei uns:** ein **flaches, indexbasiertes `bytes[]`-Context-Array**, das alle Steps teilen. Slots werden im Backend per Name→Index alloziert (`ContextService.allocateSlots`). Es gibt **keine typisierten Step-Outputs, keine Expression-Sprache, keine Referenz-Syntax** — nur "schreibe Ergebnis in Slot N, lies aus Slot N". Das ist:
- **Vorteil:** billig & deterministisch on-chain (kein Interpreter im EVM).
- **Nachteil:** für Nutzer & AI deutlich schwerer zu verstehen als `{{ $node.Swap.amountOut }}`. Die Slot-Mechanik ist Implementierungs-Leakage.

### 6. Node-Versionierung
`typeVersion` pro Node erlaubt **mehrere Versionen parallel** — alte Workflows laufen mit v1 weiter, neue nutzen v2. n8n liefert Migrationslogik mit.

→ **Bei uns** identifiziert `(contractAddress, selector)` einen StepType. Redeploy ⇒ neue Adresse ⇒ bereits deployte Automations zeigen auf tote Adressen (siehe CLAUDE.md "drifted automation" / `ConditionCallFailed`). Es gibt **kein semantisches Versions-/Migrationskonzept** für StepTypes.

### 7. Error-Handling (graph-nativ)
Pro Node konfigurierbar: **Stop Workflow** | **Continue (last valid data)** | **Continue (using error output)** — letzteres erzeugt einen **zweiten Output-Branch** für Fehlerbehandlung. Zusätzlich `retryOnFail` (+ Anzahl/Intervall) und **Error-Workflows** (globaler `Error Trigger`, der bei jedem Fehler ein Benachrichtigungs-Workflow auslöst, z.B. Slack).

→ **Bei uns** ist On-Chain-Ausführung **atomar** — ein Revert rollt alles zurück (by design korrekt). Aber es fehlt das *Produkt*-Äquivalent: kein "On-Error → fallback action", kein Retry-Hinweis, keine Owner-Benachrichtigung bei Fehlschlag. Unser Indexer **dekodiert** Fehler bereits sauber (`Step N: <reason>`, Aave-Codes) und pusht sie real-time — das ist ein **starkes Fundament**, auf dem ein "Error-Branch / Notify"-Feature aufsetzen kann.

---

## n8ns AI-Integration (das Herzstück der Anfrage)

n8n nutzt seine Nodes in **zwei Richtungen** für AI — beide sind für uns relevant:

### Richtung A — Nodes *beschreiben sich* AI-lesbar (Input für AI)
Die `description`-Felder (Node + jede Property), das Codex-File und das serialisierbare `INodeTypeDescription` machen jeden Node **selbsterklärend**. Ein LLM kann daraus ableiten, was ein Node tut, welche Parameter er braucht und wann man ihn einsetzt. Das ist die "gute Informationsquelle", die im Auftrag gemeint ist.

### Richtung B — Nodes werden *zu AI-Tools* (Output an AI)
1. **`usableAsTool: true`** im Node-Deskriptor markiert einen Node als von einem AI-Agent aufrufbares **Tool**. Der **AI Agent Node** (LangChain-Cluster) bekommt solche Nodes als Sub-Nodes angehängt und ruft sie via Tool-Calling auf.
2. **`$fromAI(key, description?, type?, defaultValue?)`** — eine Expression, die ein **Parameterfeld vom LLM füllen lässt**. Beispiel: `amount = {{ $fromAI("amount", "Menge in USDT", "number") }}`. Der Agent entscheidet zur Laufzeit den Wert. Funktioniert nur für Tools am AI-Agent-Node.
3. **MCP Server Trigger Node** — macht **jeden n8n-Workflow zu einem MCP-Server**. Externe Agents (Claude Desktop, Cursor, VS Code) **entdecken und rufen** die Workflows als MCP-Tools.
4. **MCP Client (Tool) Node** — umgekehrt: n8n-Agent konsumiert externe MCP-Server und entdeckt deren Tools automatisch.

→ **Bei uns existiert von alledem NICHTS.** Das ist die größte AI-Lücke — gleichzeitig die größte Chance, weil unser `paramSchema` bereits JSON-Schema ist (das native MCP/Tool-Format).

---

## Was n8n besser macht → unser Verbesserungs-Backlog

Priorisiert nach Hebel (Impact × wie nah wir schon dran sind):

### 🟢 Quick Wins (Fundament vorhanden)
1. **StepType-Metadaten anreichern (Codex-Äquivalent).** Felder ergänzen: `subcategory`/`protocol` (Aave/PancakeSwap/Time/Token), `docsUrl`, `aliases[]`, `examples[]`, `whenToUse`, `effects`/`outputs`-Schema, `riskLevel`. Macht die Node-Palette filterbar **und** liefert die AI-Informationsquelle. Reine DB/Seed-Erweiterung — kein Contract-Change.
2. **`displayOptions` deklarativ machen.** Die hartkodierte bedingte Sichtbarkeit in `dynamic-form.tsx` durch ein Schema-Feld (`x-ui-show-when: { field: value }`) ersetzen — analog n8n. Neue Felder ohne Frontend-Patch.
3. **Step-Output-Schema deklarieren.** Jeder Action-StepType bekommt ein `outputs`-Schema ("schreibt `amountOut: uint256` in Slot X"). Macht Slot-Verdrahtung für Nutzer & AI verständlich und ist Voraussetzung für eine Referenz-Syntax.

### 🟡 Mittel (echtes Feature, klarer Wert)
4. **Expression-/Referenz-Layer über Context-Slots.** Eine UI-Schicht `{{ Swap.amountOut }}` → kompiliert zu Slot-Index beim Encode. On-chain bleibt es indexbasiert (kein EVM-Interpreter), aber Nutzer/AI denken in benannten Referenzen statt rohen Slots. Adressiert den fundamentalsten UX-Unterschied.
5. **Error-/Notify-Branch.** Da On-Chain-Revert atomar ist: "Bei Fehlschlag → Owner-Benachrichtigung" auf Basis des bereits dekodierten `ExecutionFailure`-Stroms (WS/E-Mail/Telegram). Optional graph-nativer `nextOnError`-Branch für nicht-atomare Fälle (z.B. „wenn Swap nicht möglich, dann nur Supply").
6. **Template-/Recipe-Library.** Kuratierte Automations (DCA, Stop-Loss, Auto-Compound, HF-Schutz) als 1-Klick-Vorlagen. n8ns Template-Galerie ist ein Haupt-Adoption-Treiber.
7. **StepType-Versionierung.** Semantische Version + Migration statt nur `(address, selector)`. Verhindert die "drifted automation"-Klasse von Bugs strukturell.

### 🔵 Strategisch (Differenzierung)
8. **AI-Tool-Exposition via MCP (s. eigener Abschnitt).** Größter strategischer Hebel.
9. **Community-/Third-Party-Actions.** n8ns npm-Community-Nodes sind ein Ökosystem-Motor. Bei uns durch **delegatecall + Audit-Zwang** sicherheitskritisch — nur über ein kuratiertes/auditiertes Registry denkbar. Langfristig, mit Governance.

---

## Unser AI-Plan (konkret, nutzt vorhandene Bausteine)

Wir müssen n8n hier nicht kopieren — wir können es **überholen**, weil unser Deskriptor schon JSON-Schema ist und wir eine **validierende Encode-Boundary** haben, die fehlerhaften AI-Output abfängt.

**Bestehende Bausteine, die direkt passen:**
- `GET /step-types` liefert `paramSchema` + `abiFragment` → fertiger **Tool-Katalog**.
- `mapGraphToRaw` + `validateParams(mode:'raw')` + Raw-Mode-Guards → **Guardrails**: AI generiert Graph-JSON, unsere Boundary lehnt Ungültiges mit HTTP 400 ab, bevor irgendwas on-chain geht.
- Indexer/WS → **Feedback-Loop** für den Agent (hat die Automation gefeuert? warum fehlgeschlagen?).

**Vorgeschlagene Schritte (grob):**
1. **MCP-Server** (eigener Backend-Endpoint), der die StepTypes als Tools exponiert: `list_actions`, `describe_action(name)`, `build_automation(graph)`, `simulate/encode`, `read_executions(vault)`. Externe Agents (Claude, Cursor) können damit **on-chain Automations bauen und überwachen** — das direkte Analogon zu n8ns "MCP Server Trigger".
2. **`$fromAI`-Äquivalent**: Parameterfelder, die ein Agent zur Laufzeit/Designzeit füllt — getrieben vom vorhandenen `paramSchema` (Titel/Description/Default sind schon da).
3. **AI-Metadaten in StepType** (Backlog #1) sind die Voraussetzung, dass der Agent Tools sinnvoll auswählt ("wann benutze ich Borrow vs. Withdraw").

---

## Wo WIR besser sind als n8n (Differenzierung, nicht verlieren)

| Aspekt | n8n | Wir |
|---|---|---|
| **Ausführung** | zentraler Server (n8n-Instanz muss laufen) | **trustless on-chain**, öffentlicher Keeper, kein Single-Point-of-Failure |
| **Verifizierbarkeit** | Server-Logs | **deterministisch, atomar, on-chain auditierbar** |
| **Custody/Secrets** | verschlüsselte Credentials (Angriffsfläche) | **Self-Custody Vault**, keine Secret-Verwaltung nötig |
| **Ausführungsgarantie** | hängt vom Hosting ab | **jeder** kann ausführen, gas-kompensiert |
| **Atomarität** | Workflow kann halb-fertig sterben | Revert rollt **alles** zurück |

Diese Punkte sind unser USP — die n8n-Lektionen (UX, Node-Selbstbeschreibung, AI-Tools) sollen das **veredeln, nicht ersetzen**.

---

## Gotchas / Nicht-offensichtliches beim Übertragen von n8n

- **Expressions NICHT im EVM interpretieren.** n8ns Expression-Engine läuft serverseitig. Bei uns muss jede „Referenz-Syntax" **zur Encode-Zeit** in Slot-Indizes kompilieren — der Contract bleibt indexbasiert. Sonst Gas-/Sicherheits-Albtraum.
- **`usableAsTool` ist mehr als ein Flag.** n8n hat dahinter die ganze LangChain-Tool-Calling-Maschinerie. Unser Äquivalent ist ein **MCP-Server**, nicht ein Boolean im Schema.
- **Codex wird zur Laufzeit gelesen** (AI-Kategorisierung/Telemetrie) — Metadaten sind also nicht nur Doku, sondern funktional. Bei uns: in `StepType` packen, nicht in README.
- **Delegatecall verbietet das offene npm-Community-Modell.** n8ns Stärke (jeder published einen Node) ist bei uns ein **Sicherheitsrisiko** (Actions laufen im Vault-Storage-Kontext). Drittanbieter-Actions nur über auditiertes Registry.
- **Atomare Reverts ≠ n8n-Fehlerbranches.** Ein graph-nativer `nextOnError` ist nur für *bewusst nicht-atomare* Teilstrategien sinnvoll; der Default bleibt "alles-oder-nichts".
- **JSON-Schema-Vorsprung nicht verspielen.** Bleibt strikt bei JSON-Schema + `x-ui-*`-Extensions (statt n8ns proprietärem `INodeProperties` nachzubauen) — das ist genau das, was MCP/LLMs nativ verstehen.

---

## Quellen
- Context7: `/n8n-io/n8n-docs` (Codex, `$fromAI`, Versionierung, Error-Handling, Properties)
- [Codex files | n8n Docs](https://docs.n8n.io/integrations/creating-nodes/build/reference/node-codex-files/)
- [n8n metadata | n8n Docs](https://docs.n8n.io/code/builtin/n8n-metadata/)
- [Tools AI Agent node | n8n Docs](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent/)
- [MCP Server Trigger | n8n Docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcptrigger/)
- [MCP Client | n8n Docs](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.mcpClient/)
- [$fromAI() Beispiel | n8n Docs](https://docs.n8n.io/advanced-ai/examples/using-the-fromai-function/)
- [Node Type System | DeepWiki n8n](https://deepwiki.com/n8n-io/n8n/4.1-node-type-system-and-registration)
- Eigener Code: `packages/backend/prisma/seed.ts` (StepType/paramSchema), `schema.prisma` (StepType-Model), CLAUDE.md (Encode-Boundary, Indexer, Context-Slots)
