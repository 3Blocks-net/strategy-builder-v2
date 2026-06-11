<!--
Die 11 Task-Gruppen entsprechen 1:1 den Tracer-Bullet-Slices des Change (eine Capability je Slice).
Abhängigkeiten: 1 → {2,3,4,5} → 6 & 7 → 8 → 9 → {10,11}.
Story 7 (Schutz) wird mit Slice 6 designt; Security-Review-Gate vor jeder schreibenden Slice (6, 9, 10, 11).
-->

## 1. MCP-Spine + SIWE-Auth + whoami (Slice 01 — keine Blocker)

- [x] 1.1 `packages/mcp` als pnpm-Workspace-Paket anlegen (stdio, offizielles MCP SDK, viem); in Claude Desktop per command/stdio registrierbar dokumentieren
- [x] 1.2 `WalletSigner` (deep module): verschlüsselter JSON-Keystore, Owner-Adresse ableiten, Key-Material nie nach außen reichen/loggen
- [x] 1.3 Init/Onboarding-CLI-Command: Keystore-Passwort interaktiv in den OS-Keychain schreiben; Runtime liest headless
- [x] 1.4 `AuthClient` (deep module): nonce → SIWE bauen+signieren (Frontend-Host als `domain`) → verify → JWT speichern/refreshen; gegen gemocktes Backend getestet
- [x] 1.5 Owner-Session etablieren; Tool `whoami` liefert die abgeleitete Owner-Adresse
- [x] 1.6 Kein-Key-Leak absichern (Logs/Fehler/Tool-Ausgaben) + Test mit erzwungenem Fehlerpfad
- [x] 1.7 Sichere Fehlermeldung bei fehlendem/ungültigem Zugang; Erst-Verbindungs-Sicherheitshinweis + dokumentierter Trenn-/Entfern-Weg
- [x] 1.8 Quick-Start-Doku: roher Private Key nur als gekennzeichnetes Beispiel, nicht als Standard

## 2. shared-Extraktion der Encode-Boundary (Slice 02 — keine Blocker)

- [x] 2.1 `mapGraphToRaw`/`buildContextOverrides`/`mapParamsToRaw` (+ Typen) nach `packages/shared` ziehen, über `exports`-Map verfügbar machen
- [x] 2.2 Frontend auf die `shared`-Version refactoren; alte Kopie in `features/automation-editor/lib/encode-boundary.ts` entfernen (keine Duplikation)
- [x] 2.3 Bestehende Mapper-Tests auf die `shared`-Version umziehen (table-driven, kein LLM, keine Chain), grün
- [x] 2.4 `pnpm shared:build` + `frontend:build` + `frontend:test` unverändert grün verifizieren

## 3. Read-/Discovery-Tools (Slice 03 — blocked by 1)

- [x] 3.1 `list_vaults`, `get_vault`, `get_portfolio`, `list_automations`, `get_executions` gegen bestehende owner-guarded Endpunkte mit Session-JWT
- [x] 3.2 Strukturierte, LLM-freundliche Ergebnisse (kein Roh-Hex)
- [x] 3.3 Owner-Isolation gegen gemockte Backend-Antworten testen (nur eigene Vaults; Fremd-Zugriff unmöglich)
- [x] 3.4 `get_executions`: erfolgreiche Runs, Deposits/Withdraws + dekodierte Fehlschläge (`Step N: <reason>`)
- [x] 3.5 Leerzustand (Vault ohne Daten) klar von Fehler unterscheiden; alle Read-Tools bestätigungsfrei
- [x] 3.6 `get_positions` über `GET /vaults/:address/positions` (USD-Positionssicht: idle + Gas-Reserve + Protokoll-Adapter + Netto-Equity; optional `refresh`), owner-isoliert
- [x] 3.7 `get_performance` & `get_value_history` über `/performance` bzw. `/value-history` mit `range` (`24h|7d|30d|all`)
- [x] 3.8 Tests: korrekter Endpunkt + Query, Passthrough der strukturierten View, Fremd-Vault (403) → Ablehnung

## 4. Katalog-Tools + Mindest-Annotations-Pass (Slice 04 — blocked by 1)

- [x] 4.1 `list_step_types` (deployte Conditions+Actions; Null-Adress-Bausteine ausschließen)
- [x] 4.2 `describe_step_type` (`paramSchema` JSON-Schema-treu inkl. Defaults, Param-Bedeutungen, Kontext-Slots soweit ableitbar)
- [x] 4.3 Mindest-Annotations-Pass im StepType-Seed (Rollen-Marker Token/Betrag/Empfänger/Richtung); `ERC20TransferAction.recipient` annotieren (`seed.ts`)
- [x] 4.4 `prisma:seed` läuft durch; Frontend-Form-Widgets unverändert funktionsfähig
- [x] 4.5 Test: Step ohne Empfänger-Annotation wird als Lücke erkannt

## 5. Recipes (Slice 05 — blocked by 1)

- [x] 5.1 Prisma-Recipe-Entity + Migration
- [x] 5.2 Seed mit DCA, Stop-Loss, HF-Schutz als Shape-mit-Platzhaltern (Step-Type-IDs, keine Adressen)
- [x] 5.3 Lese-Endpunkt (analog/neben `/step-types`) + MCP-Tool `list_recipes`
- [x] 5.4 Seed-Validierung gegen den Katalog: unbekannter Step-Type / Param-Drift → nicht ausgeliefert (Test)
- [x] 5.5 Sicherstellen: kein Schreibpfad für User/Community (nur seed-/team-kuratiert)
- [x] 5.6 **HITL:** Kuratierung der Strategien/Shapes mit dem Team reviewen

## 6. PolicyGate-Skelett + create_vault (Slice 06 — blocked by 1; Story-7-Design)

- [x] 6.1 `PolicyGate` (deep module): Entscheidungslogik (Confirm nötig? Read-only?) + IO-Adapter
- [x] 6.2 Confirm via MCP-Elicitation; Fallback localhost-Bestätigungsseite (Summary vom Server-Prozess)
- [x] 6.3 Freigabe = server-interner Zustand (einmaliges Approval-Token, vom LLM nicht fälschbar); write-Tool blockiert synchron; Timeout = hartes Fail
- [x] 6.4 `AuditLog` (module): append-only lokale Datei (Zeitpunkt, Tool, Parameter, TX-Hash, Ergebnis); jeder Confirm-Pfad schreibt Summary + Outcome
- [x] 6.5 `create_vault`: Deposit-Token gegen FeeRegistry validieren (sonst klare Fehlermeldung, keine TX); sign+send; neue Vault-Adresse + TX-Hash; Revert → dekodiert
- [x] 6.6 Verhaltenstests: Prompt-Injection-Versuch, simulierte LLM-Selbstbestätigung wird abgelehnt, Timeout-Fail; Vault erscheint in `list_vaults` + Web-UI
- [x] 6.7 Security-Review-Gate (Key-Handling + Prompt-Injection)

## 7. SummaryDecoder (Slice 07 — blocked by 4)

- [x] 7.1 `SummaryDecoder` (deep module): raw graph / Calldata → strukturierte Summary (Funktion, Token, human-Betrag, Empfänger, Richtung, Trigger, `execution`)
- [x] 7.2 Schema-getrieben aus Rollen-Annotationen (kein per-step-type-Code); neuer annotierter Step braucht keinen Decoder-Code
- [x] 7.3 Beweis-Test: manipulierter raw graph → abweichende Summary (Summary aus TX, nicht aus Tool-Args)
- [x] 7.4 Step ohne Rollen-Annotation am Empfänger-/Betrag-Feld → Decode schlägt fehl/markiert (kein stilles Weglassen)
- [x] 7.5 Base-Units → human-Beträge mit korrekten Token-Decimals (table-driven Tests)

## 8. propose_automation + Intent-Cross-Check (Slice 08 — blocked by 2, 5, 7)

- [x] 8.1 `propose_automation`: Agent-Graph → `shared`-Mapper → bestehendes `/encode` (raw-mode-Validierung); ungültige Graphen mit Erklärung ablehnen (kein Deploy)
- [x] 8.2 Server-interner Draft-Store (in-memory, pro Session, TTL); Draft-ID zurückgeben; LLM kann Entwurf nicht mutieren
- [x] 8.3 Intent-Cross-Check: flacher Intent vs. `SummaryDecoder`-Decode → Reject mit Diff bei Abweichung; `execution` ≠ Topologie → Reject; verzweigte Graphen markieren
- [x] 8.4 Pool-Existenz-Check (`factory.getPool` via viem) + Token-Allowlist über `tokenDecimals`-Auflösung (nicht-kuratierter Token → harter Fail vor TX)
- [x] 8.5 Keine erfundenen Adressen/Selektoren (nur seed-/katalog-gestützte StepTypes)
- [x] 8.6 Prompt-Injection-Testfall: Bauen am Cross-Check vorbei wird abgelehnt

## 9. deploy_automation (Slice 09 — blocked by 6, 8)

- [x] 9.1 `deploy_automation` nimmt **nur** die Draft-ID; signiert Kontext-Setup + create/update; liefert On-Chain-Automation-ID + TX-Hash(es)
- [x] 9.2 Confirm zeigt `SummaryDecoder`-Decode des gespeicherten Entwurfs inkl. `execution`; verzweigte Graphen hervorgehoben
- [x] 9.3 Sensibilitäts-Gate: sensibel markierter Step erzwingt Confirm (PolicyGate); ohne Bestätigung kein Deploy
- [x] 9.4 In-Automation-Adress-Allowlist: `ERC20Transfer.recipient` schema-getrieben prüfen → Nicht-Allowlist-Ziel ablehnen; Capability-Opt-in: nicht freigeschaltete sensible Steps nicht verbaubar
- [x] 9.5 Automation erscheint in `list_automations` + Web-UI; Revert → dekodierte Fehlermeldung
- [x] 9.6 E2E-Fork: ≥1 AI-Muster end-to-end bis zur feuernden Automation; ungültiger Graph abgelehnt; kein Deploy ohne Bestätigung
- [x] 9.7 Security-Review-Gate (schreibende Story)

## 10. Geldbewegung 6a: deposit / withdraw + Schutzschichten (Slice 10 — blocked by 6)

- [x] 10.1 `deposit`/`withdraw`: Beträge korrekt in Base-Units (Token-Decimals); durch Confirm-Gate mit dekodierter Summary
- [x] 10.2 Adress-Allowlist: Withdraw-Empfänger außerhalb der Allowlist → Ablehnung (Verhaltenstest)
- [x] 10.3 Max-Betrag-Limit pro Aktion (pro Token, Config) → Überschreitung blockiert/erfordert Freigabe; Read-only-Modus deaktiviert alle Write-Tools (Tests)
- [x] 10.4 `Simulator`: Dry-Run via viem `simulateContract`/`estimateGas` für deposit/withdraw (erwartetes Ergebnis + Fees/Gas, ohne Senden)
- [x] 10.5 Fees (Deposit/Withdraw-BPS) vor Bestätigung transparent machen; Revert → dekodierte Fehlermeldung
- [x] 10.6 Security-Review-Gate (schreibende Story)

## 11. Lifecycle 6b: Gas-Deposit + set_automation_active (Slice 11 — blocked by 6)

- [x] 11.1 `top_up_gas_deposit` (`depositFees`) füllt Gas-Comp-Reserve; neuer Stand in `get_vault`/`get_portfolio` + Web-UI
- [x] 11.2 `set_min_fee_deposit` setzt `minFeeDeposit` korrekt
- [x] 11.3 `set_automation_active` schaltet aktiv/pausiert; spiegelt sich in `list_automations` + Web-UI
- [x] 11.4 Writes durch PolicyGate (Confirm bei Sensibilität, Read-only respektiert); Revert → dekodierte Fehlermeldung
- [x] 11.5 Security-Review-Gate (schreibende Story)

## 12. Folge-Task: Geführtes Onboarding (`pecunity-mcp-init`-Ausbau)

<!--
Nachgelagert zu Slice 1, NICHT Teil der initialen Slice-1-DoD.
Bewusst auf den sicherheitsneutralen Teil beschränkt (best practice):
orchestriert nur bestehende sichere Bausteine + verify-before-store.
Das Einlesen eines ROHEN Private Keys im Prompt ist sicherheitsrelevant
(Shell-History/Scrollback/Key-Material) und bleibt AUSGESCHLOSSEN —
der rohe Key bleibt das markierte Dev-Beispiel (make-keystore.mjs).
-->

- [ ] 12.1 `pecunity-mcp-init` führt durch: Keystore-Pfad übernehmen (Arg/Env/Prompt), Datei-Existenz + Lesbarkeit prüfen
- [ ] 12.2 Passwort maskiert abfragen und **verify-before-store**: über `WalletSigner.fromKeystore` prüfen, dass es den Keystore wirklich entschlüsselt; bei Fehlschlag **nichts** in den Keychain schreiben (fail-fast)
- [ ] 12.3 Erst nach erfolgreicher Verifikation Passwort in den OS-Keychain legen; abgeleitete Owner-Adresse ausgeben
- [ ] 12.4 Fertigen `claude_desktop_config.json`-Schnipsel ausgeben (ohne Passwort)
- [ ] 12.5 Tests: falsches Passwort → kein Keychain-Write; kein Key-/Passwort-Leak in Ausgaben
- [ ] 12.6 **Ausgeschlossen (sicherheitsrelevant):** kein First-Class-Einlesen roher Private Keys — bleibt markiertes Dev-Beispiel

## 13. Folge-Task: Preis- & Health-Factor-Conditions (schaltet Stop-Loss / HF-Schutz-Recipes frei)

<!--
Wahrscheinlich EIGENES Epic/PRD: berührt die Contracts-Schicht (neue Condition-
Contracts), nicht nur den MCP-Change. Hier nur als Referenz getrackt, damit es
nicht vergessen wird. Aktuell fehlen im Katalog Preis- und Health-Factor-
Conditions → Stop-Loss und HF-Schutz sind nicht ausdrückbar und wurden in Slice 5
bewusst ausgelassen (siehe recipe-seed-data.ts + Spec mcp-recipes).
-->

- [ ] 13.1 **Preis-Condition** (StepType): on-chain Preis-Trigger (z. B. PancakeSwap-V3-Pool/Oracle) — Contract + Seed mit `paramSchema`/`abiFragment` + Rollen-Annotationen
- [ ] 13.2 **Health-Factor-Condition** (StepType): Aave-HF unter/über Schwelle — Contract + Seed
- [ ] 13.3 Recipe **Stop-Loss** (Preis-Condition → Swap) ergänzen; Seed-Validierung muss greifen
- [ ] 13.4 Recipe **HF-Schutz** (HF-Condition → Aave Repay) ergänzen
- [ ] 13.5 Spec `mcp-recipes` zurück auf den vollen Satz (inkl. Stop-Loss/HF) aktualisieren, sobald ausdrückbar

## 14. Folge-Task: Offene Security-Review-Findings (deferred)

<!--
Reste aus den Security-Review-Gates Slice 6 (A1/A2) und Slice 9 (B1/B2). Beide
Reviews sind APPROVE; dies sind KEINE Merge-Blocker (info/warning-dormant). Bewusst
nachgelagert: erst nach Fertigstellung der Slices (10, 11) abarbeiten.
-->

- [ ] 14.1 **A2** (kosmetisch): `VAULT_FACTORY_ABI`-Event-Param-Namen in `chain.ts` korrigieren (`owner→vaultOwner`, `salt→vaultIndex`); Topic-Hash nutzt nur Typen → kein Verhaltensimpact
- [ ] 14.2 **B1**: Startup-Config-Validierung — warnen, wenn `enabledSensitiveSteps`-Namen nicht zum Katalog passen (Tippfehler/Case → stiller Capability-Block) oder `addressAllowlist`-Einträge keine gültigen EVM-Adressen sind
- [ ] 14.3 **B2**: Doc-Kommentar an `BackendClient.patch` (PATCH liefert heute kein 409; künftige „bereits finalisiert"-Semantik hier behandeln)
- [ ] 14.4 **A1** (dormant): Signer-Hardening gegen Injection-Landmine (`sendContractTransaction`/`sendRawTransaction`). Heute isoliert (Tools bekommen nur Closures, nie den rohen Signer). Ansatz bei Umsetzung wählen: Branded-Type (Compile-Zeit, empfohlen) / Status-quo+Doku / Runtime-Selector-Allowlist