---
created: 2026-07-27
last_verified: 2026-07-27
git_commit: d2243f1
---

# Problem Statement: Absicherungs-Paket

## Beteiligte

| Rolle          | Person / Team |
|----------------|---------------|
| Verantwortlich | Florian (solo — fachlich + technisch) |
| Mitwirkende    | Smart-Contract-Entwicklung, ggf. externer Auditor (Ende H1) |
| Zu informieren | Community/Nutzer bei Launch (Changelog, Doku) |

## Strategische Einordnung

Erste Säule der H1-Roadmap „Vertrauen zuerst" (Produkt-Analyse `docs/discovery/produkt-strategie/analyse.md`, Abschnitt G): Kein Fee-Launch und keine Einsteiger-Welle auf einem Produkt mit dokumentierten Schutz-Lücken. Direkter Zubringer für den Ende H1 beauftragten Audit — die hier geschlossenen Lücken sind dessen Kern-Scope.

## Problemdefinition

**Wir haben das Problem, dass** Vault-Owner (heute Power-User, perspektivisch Einsteiger) derzeit nicht in der Lage sind, Strategien mit verlässlicher Verlust-Begrenzung zu betreiben, **weil** (1) v1-Swap-Actions ohne On-Chain-Slippage-Schutz (kein minOut) ausgeliefert sind und (2) der Vault beliebige, unkuratierte delegatecall-Targets als Actions/Conditions akzeptiert — eine bösartige Action kann den gesamten Vault-Storage inklusive Owner-Slot überschreiben.

**Das führt dazu, dass** ein einziger Sandwich-Angriff oder eine untergeschobene Action Nutzer-Gelder vernichten kann; jeder solcher Vorfall wäre für ein Self-Custody-Produkt vor Fee-Launch existenzbedrohend (Vertrauensverlust > jeder Umsatz).

**Wir wissen, dass das Problem gelöst ist, wenn** (a) kein Swap-Step mehr ohne Slippage-Schutz deploybar ist, (b) Standard-Deploys ausschließlich kuratierte Actions/Conditions zulassen und (c) der externe Audit die beiden Lücken-Klassen ohne Critical-Finding bestätigt.

### Wie lösen sie diese Probleme heute?

- Slippage: gar nicht — dokumentiertes, bewusst ausgeliefertes MVP-Risiko (Reverse-Spec vault-contracts). Workaround: Nutzer wählen liquide Pools und hoffen.
- Bösartige Actions: Vertrauen in die eigene Sorgfalt — das UI bietet ohnehin nur Katalog-Steps an, aber on-chain ist nichts erzwungen (direkter Contract-Call umgeht das UI vollständig).
- Verlust-Begrenzung: manuelles Beobachten des Cockpits (kein Stop-Loss-Baustein — der kommt als eigenes Epic E in H2).

## Validierung

### Wie haben wir das validiert?

Beide Lücken sind aus dem Bestandscode belegt (Reverse-Spec `docs/discovery/vault-contracts/epic.md`: „Swaps bewusst ohne On-Chain-Slippage-Schutz ausgeliefert (dokumentiertes MVP-Risiko)"; „Annahmen & offene Fragen Nr. 1: keine Action-/Condition-Whitelist … könnte den gesamten Vault-Storage überschreiben"). Kein realer Schadensfall bekannt (Produkt vor Mainnet-Traktion). Noch nicht validiert: tatsächliche Angriffs-Häufigkeit auf BSC-Vaults dieser Bauart.

### Annahmen

1. Wenn Swaps ein Pflicht-minOut bekommen, dann sinkt das Sandwich-/Slippage-Risiko auf das vom Nutzer explizit akzeptierte Maß.
2. Wenn Standard-Deploys nur kuratierte Actions zulassen, dann ist der „bösartige Action"-Pfad für UI-/MCP-Nutzer geschlossen, ohne Self-Custody aufzugeben (Experten-Opt-out bleibt).
3. Wenn beide Lücken vor dem Audit geschlossen sind, dann verkürzt/verbilligt sich der Audit und das Ergebnis wird vermarktbar.
4. Wenn bestehende (ungeschützte) Automationen weiterlaufen dürfen, dann braucht es eine sichtbare Kennzeichnung, damit Bestandsnutzer migrieren.

### Wissenslücken

1. Welche minOut-Ermittlung ist die richtige Quelle (Oracle-basiert vs. nutzerdefinierte Toleranz vs. beides)?
2. Wie wird die Whitelist on-chain verankert, ohne die nicht-upgradebaren Bestands-Vaults zu brechen (Registry-Gate in neuen Action-Versionen vs. Factory-neue Vault-Version)?
3. Wer pflegt die kuratierte Liste operativ (Rolle, Prozess, Zeit bis zur Aufnahme neuer Actions)?
4. Wie viele Bestands-Automationen wären von einer Migration betroffen (Fork/Testnet: intern bekannt; Mainnet: TBD)?

## Ressourcen

- Produkt-Analyse: `docs/discovery/produkt-strategie/analyse.md` (Abschnitte C/E2, G, H)
- Reverse-Spec On-Chain-Schicht: `docs/discovery/vault-contracts/epic.md`
- Reverse-Spec Editor (Schutz-UI-Flächen): `docs/discovery/strategy-graph-editor/epic.md`
- Fee-Entwurf mit Audit-Erfolgskriterium: Linear ENG-48 (Referenz)
