# Lifecycle (6b): Gas-Deposit + `set_automation_active`

## Parent PRD

mcp-integration.md

## What to build

Der Vault-Betreiber verwaltet den laufenden Betrieb per Chat — die risikoärmeren Lifecycle-
Schreibaktionen, die das bereits reviewte PolicyGate (Slice 06) wiederverwenden:

- **`top_up_gas_deposit`** (`depositFees`) füllt die Gas-Comp-Reserve aus dem Vault-
  Guthaben auf; **`set_min_fee_deposit`** setzt das Auto-Top-up-Ziel.
- **`set_automation_active`** aktiviert/deaktiviert eine Automation; das spiegelt sich in
  Slice 03 und der Web-UI.

Diese Aktionen bewegen kein Vermögen an externe Ziele (Gas-Reserve fließt in die FeeRegistry-
Einlage des eigenen Vaults), laufen aber als signierende Writes weiterhin durch das Confirm-
Gate, sofern als sensibel markiert. Revert → dekodierte Fehlermeldung. Siehe PRD _Geld
bewegen & Lifecycle (Story 6)_.

## Acceptance criteria

- [ ] `top_up_gas_deposit` füllt die Gas-Comp-Reserve auf; der neue Stand erscheint in `get_vault`/`get_portfolio` (Slice 03) und der Web-UI.
- [ ] `set_min_fee_deposit` setzt `minFeeDeposit` korrekt.
- [ ] `set_automation_active` schaltet aktiv/pausiert; Änderung spiegelt sich in `list_automations` und der Web-UI.
- [ ] Diese Writes laufen durch das PolicyGate (Confirm bei Sensibilität, Read-only-Modus respektiert); Revert → dekodierte Fehlermeldung.

## Blocked by

- Blocked by #06

## User stories addressed

- User story 40
- User story 41
- User story 46
