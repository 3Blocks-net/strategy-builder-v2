# PEC-216-13: Playwright E2E Setup + Golden Path Test

## Parent PRD

docs/PRD-PEC-216-automation-editor.md

## What to build

Set up Playwright in the monorepo and write one end-to-end golden-path test that proves the full automation creation flow works from the user's perspective.

**Playwright setup:**
- Install `@playwright/test` as a dev dependency in the frontend package (or root).
- Create `playwright.config.ts` with:
  - Base URL pointing to the Vite dev server.
  - Single browser (Chromium) for MVP.
  - Screenshot on failure.
  - Reasonable timeouts for TX-dependent steps.
- Add `pnpm frontend:test:e2e` script to root and frontend package.json.
- Create a test fixtures file with helpers for common operations (navigate to vault, wait for React Flow canvas to render, etc.).

**Golden-path test:**
Test scenario: create a simple "IntervalCondition → ERC20TransferAction" automation.

1. **Navigate to vault detail page** — assume a vault exists (seeded in test setup or created as a prerequisite step).
2. **Click "Create Automation"** — navigates to the editor.
3. **Add a condition node** — open toolbar dropdown, click "Interval Condition". Verify node appears on canvas.
4. **Add an action node** — open toolbar dropdown, click "ERC20 Transfer Action". Verify second node appears.
5. **Connect them** — drag from condition's "True" handle to action's target handle. Verify edge appears with "True" label.
6. **Configure the condition** — click the condition node, verify side panel opens. Fill in interval (e.g., 3600), select/create a context slot for timeSlot.
7. **Configure the action** — click the action node, verify side panel opens. Select a token, enter a recipient address, enter an amount.
8. **Verify validation passes** — no red borders, no errors in validation panel, Deploy button is enabled.
9. **Click Deploy** — verify deploy dialog appears with automation summary and context changes.
10. **Mock TX confirmation** — since we can't sign real TXs in E2E without a wallet extension, either:
    - Mock the `writeContractAsync` call to resolve immediately with a fake TX hash, and mock `waitForTransactionReceipt` to return a receipt with a fake `AutomationCreated` event, OR
    - Use a test wallet connected to the local Hardhat fork (if the E2E setup includes a running fork).
11. **Verify automation appears in the list** — navigate back to vault detail, see the automation in the list.

**Test data / fixtures:**
- The test assumes the backend is running with a seeded DB (step types exist) and optionally a Hardhat fork is running.
- If TX mocking is used, the test verifies the UI flow without real blockchain interaction.

## Acceptance criteria

- [ ] `@playwright/test` is installed and configured in the monorepo
- [ ] `pnpm frontend:test:e2e` runs the Playwright test suite
- [ ] `playwright.config.ts` exists with Chromium browser, base URL, screenshot on failure
- [ ] Golden-path test passes: create automation with condition + action, connect, configure, deploy
- [ ] Test verifies: node addition, edge creation, side panel form filling, validation passing, deploy dialog
- [ ] Test handles TX submission (via mocking or fork wallet)
- [ ] Test takes <60 seconds to run
- [ ] Screenshots are captured on failure for debugging
- [ ] Test is idempotent (can run multiple times without cleanup issues)

## Blocked by

- PEC-216-07 (needs working deploy flow for the golden-path test)
- PEC-216-10 (needs automation list to verify the result)

## User stories addressed

Cross-cutting: verifies the integration of user stories 3, 4, 5, 7, 9, 11, 18, 19.
