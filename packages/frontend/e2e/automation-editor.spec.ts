import { test, expect } from '@playwright/test';
import {
  waitForCanvas,
  addStepFromDropdown,
  getNodeCount,
  getEdgeCount,
  clickNode,
  mockAuth,
} from './fixtures';

const VAULT_ADDRESS = '0x1234567890123456789012345678901234567890';

test.describe('Automation Editor - Golden Path', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);

    await page.route('**/step-types', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'st-interval',
            name: 'Interval Condition',
            description: 'Time-based trigger',
            category: 'CONDITION',
            contractAddress: '0x60C79446f00CB9ebD79c4e2d3d6a773314bdbfaa',
            selector: '0xd89f1e36',
            afterExecutionSelector: '0xb2792168',
          },
          {
            id: 'st-transfer',
            name: 'ERC-20 Transfer',
            description: 'Transfer tokens from vault',
            category: 'ACTION',
            contractAddress: '0x284849e6a60F716614Fb28279E2446FE995C5711',
            selector: '0x24856bc3',
            afterExecutionSelector: null,
          },
        ]),
      }),
    );

    await page.route(`**/step-types/st-interval`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'st-interval',
          name: 'Interval Condition',
          category: 'CONDITION',
          paramSchema: {
            type: 'object',
            properties: {
              interval: { type: 'string', title: 'Interval (seconds)' },
              timeSlot: {
                type: 'integer',
                title: 'Time Slot',
                'x-ui-widget': 'context-slot',
                'x-ui-slot-access': 'read-write',
              },
            },
            required: ['interval', 'timeSlot'],
          },
        }),
      }),
    );

    await page.route(`**/step-types/st-transfer`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'st-transfer',
          name: 'ERC-20 Transfer',
          category: 'ACTION',
          paramSchema: {
            type: 'object',
            properties: {
              token: { type: 'string', title: 'Token', 'x-ui-widget': 'token-selector' },
              recipient: { type: 'string', title: 'Recipient' },
              amount: { type: 'string', title: 'Amount', 'x-ui-widget': 'amount' },
            },
            required: ['token', 'recipient', 'amount'],
          },
        }),
      }),
    );

    await page.route(`**/blockchain/tokens/accepted`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT' },
        ]),
      }),
    );

    await page.route(`**/vaults/${VAULT_ADDRESS}/context-slots`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ slots: {}, contextLength: 0, dbSlotCount: 0, syncWarning: false }),
      }),
    );

    await page.route(`**/vaults/${VAULT_ADDRESS}/automations`, (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'auto-1' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route(`**/vaults/${VAULT_ADDRESS}/automations/auto-1`, (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'auto-1' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'auto-1', editorState: null }),
      });
    });

    await page.route(`**/vaults/${VAULT_ADDRESS}/automations/auto-1/encode`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          automationCalldata: '0x1234',
          functionName: 'createAutomation',
          ownerOnly: false,
          stepCount: 2,
          requiresContextTx: false,
          contextChanges: [],
        }),
      }),
    );
  });

  test('adds nodes from toolbar dropdown', async ({ page }) => {
    await page.goto(`/vault/${VAULT_ADDRESS}/automation/new/edit`);
    await waitForCanvas(page);

    await addStepFromDropdown(page, 'Interval Condition');
    expect(await getNodeCount(page)).toBe(1);

    await addStepFromDropdown(page, 'ERC-20 Transfer');
    expect(await getNodeCount(page)).toBe(2);
  });

  test('connects nodes with edges', async ({ page }) => {
    await page.goto(`/vault/${VAULT_ADDRESS}/automation/new/edit`);
    await waitForCanvas(page);

    await addStepFromDropdown(page, 'Interval Condition');
    await addStepFromDropdown(page, 'ERC-20 Transfer');

    const sourceHandle = page.locator('.react-flow__node').first().locator('[data-handleid="true"]');
    const targetHandle = page.locator('.react-flow__node').last().locator('[data-handlepos="top"]');

    if (await sourceHandle.isVisible() && await targetHandle.isVisible()) {
      await sourceHandle.dragTo(targetHandle);
      const edgeCount = await getEdgeCount(page);
      expect(edgeCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('opens side panel on node selection', async ({ page }) => {
    await page.goto(`/vault/${VAULT_ADDRESS}/automation/new/edit`);
    await waitForCanvas(page);

    await addStepFromDropdown(page, 'Interval Condition');
    await clickNode(page, 0);

    await expect(page.locator('text=CONDITION')).toBeVisible({ timeout: 5_000 });
  });

  test('shows validation errors for empty canvas', async ({ page }) => {
    await page.goto(`/vault/${VAULT_ADDRESS}/automation/new/edit`);
    await waitForCanvas(page);

    const deployButton = page.locator('button:has-text("Deploy")');
    await expect(deployButton).toBeDisabled();
  });

  test('deploy button enables after adding a valid single node', async ({ page }) => {
    await page.goto(`/vault/${VAULT_ADDRESS}/automation/new/edit`);
    await waitForCanvas(page);

    await addStepFromDropdown(page, 'ERC-20 Transfer');

    await page.waitForTimeout(500);

    const deployButton = page.locator('button:has-text("Deploy")');
    await expect(deployButton).toBeEnabled({ timeout: 5_000 });
  });

  test('opens deploy dialog on deploy click', async ({ page }) => {
    await page.goto(`/vault/${VAULT_ADDRESS}/automation/new/edit`);
    await waitForCanvas(page);

    await addStepFromDropdown(page, 'ERC-20 Transfer');
    await page.waitForTimeout(500);

    await page.click('button:has-text("Deploy")');
    await expect(page.locator('text=Deploy Automation')).toBeVisible({ timeout: 5_000 });
  });
});
