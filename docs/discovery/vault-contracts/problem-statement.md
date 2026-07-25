---
created: 2026-07-25
last_verified: 2026-07-25
git_commit: 7ca671beafc34c201d4980a6ef66297bec67aa7f
extrahiert: aus-bestandscode
---

# Problem-Statement: vault-contracts (Reverse-Spec)

> **Ehrlichkeitshinweis:** Dieses Dokument ist eine Rekonstruktion aus Bestandscode
> (`packages/contracts/contracts/**` + Verhaltens-Belege aus `packages/contracts/test/**`).
> Es beschreibt, was die Contracts heute nachweislich tun — nicht, was ursprünglich
> geplant war. Im Zweifel gilt der Code.

## Problem

DeFi-Nutzer, die Strategien über mehrere Protokolle (Aave V3, PancakeSwap V3 auf BSC)
automatisieren wollen, stehen vor einem Dilemma:

- **Manuelle Ausführung** ist zeitkritisch (Rebalancing, Health-Factor-Management,
  Fee-Harvesting) und praktisch nicht durchzuhalten.
- **Zentrale Automations-Dienste** verlangen die Herausgabe von Geldern oder
  Schlüsseln — der Nutzer verliert Self-Custody.
- **Eigene Bots** brauchen einen Hot-Wallet-Key mit Vollzugriff und individuelle
  Smart-Contract-Entwicklung pro Strategie.

## Lösung (rekonstruiert)

Die On-Chain-Schicht stellt **Self-Custody-Vaults mit programmierbaren Automationen**
bereit:

- Jeder Nutzer bekommt über eine Factory einen **eigenen Vault** (ERC1967-Proxy),
  dessen alleiniger Owner er ist. Nur der Owner kann Gelder einzahlen, abheben und
  Automationen konfigurieren.
- Eine Automation ist ein **gerichteter Schritt-Graph** aus Conditions (read-only
  Trigger/Verzweigungen) und Actions (DeFi-Operationen per delegatecall im
  Vault-Kontext). Ein geteilter, persistenter Kontext (`bytes[]`) verdrahtet
  Outputs eines Schritts mit Inputs späterer Schritte.
- **Beliebige Dritte (Keeper/Executor)** dürfen eine Automation ausführen — aber
  nur, wenn deren Trigger-Condition on-chain erfüllt ist. Der Vault vergütet dem
  Executor die Gaskosten aus einem vorfinanzierten Depot im FeeRegistry.
- **Fees** fallen ausschließlich an der Vault-Grenze an (Einzahlung/Abhebung,
  flat BPS, hart auf 10 % gedeckelt), nicht pro Aktion.
- Actions/Registries sind **stateless bzw. immutable** deployte Bausteine
  (Aave-Supply/Borrow/Withdraw/Repay, Pancake-Swap/Mint/Increase/Decrease/Collect),
  die der Vault per Selector referenziert.

## Warum on-chain?

Die Garantien (Owner-Exklusivität der Gelder, Trigger-Gate für fremde Executor,
Fee-Cap, Gas-Kompensations-Invariante) sollen nicht vom Wohlverhalten eines
Off-Chain-Dienstes abhängen, sondern per `require`/`revert` erzwungen sein.
Frontend, Backend und MCP-Server bauen darauf auf, erzwingen aber nichts davon selbst.

## Bewusst akzeptierte Risiken (im Code dokumentiert)

- Swaps laufen ohne On-Chain-Slippage-Schutz (`amountOutMinimum = 0` by design,
  MEV-Exposition als MVP-Trade-off; Forward-Compat-Felder für späteren Schutz
  existieren bereits).
- Der Vault whitelisted keine Action-/Condition-Adressen: Der Owner kann beliebige
  Targets per delegatecall einbinden — Self-Custody heißt hier auch
  Selbstverantwortung.
