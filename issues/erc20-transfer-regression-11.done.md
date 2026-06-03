# ERC-20 Transfer — regression coverage

## Parent PRD

PEC-218-defi-actions-prd.md

## What to build

`ERC20TransferAction` already exists (see CLAUDE.md _Example Contracts_). This slice adds/locks in regression coverage so the existing transfer behavior keeps working as the new DeFi actions, `ActionLib`, and the per-protocol token infrastructure land alongside it. No new contract.

End-to-end behavior to protect (PRD User Stories 1–4): transfer an ERC-20 from the vault to an address; optionally deduct the protocol withdraw fee (reads `withdrawFeeBps` dynamically); transfer the **full vault balance** via the zero-toggle; and source the transfer **amount from a context slot** written by a previous step.

## Acceptance criteria

- [ ] Forked/unit test: transfer of a fixed amount delivers tokens to the recipient.
- [ ] Test: withdraw-fee deduction is correct when `feeRegistry` is set (and skipped when address(0)).
- [ ] Test: full-balance zero-toggle transfers the entire vault balance.
- [ ] Test: amount sourced from a context slot forwards a previous step's output.
- [ ] Tests pass unchanged after the #1 `ActionLib` refactor (no regression from shared amount-resolution helpers, if reused).

## Blocked by

None — can start immediately. (Independent of the new actions; touch base with #1 if `ERC20TransferAction` is migrated onto `ActionLib`'s amount-resolution helpers.)

## User stories addressed

- User story 1
- User story 2
- User story 3
- User story 4
