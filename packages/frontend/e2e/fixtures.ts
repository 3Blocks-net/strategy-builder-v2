import { type Page } from '@playwright/test';

export async function waitForCanvas(page: Page) {
  await page.waitForSelector('.react-flow__renderer', { timeout: 10_000 });
}

export async function addStepFromDropdown(page: Page, stepName: string) {
  await page.click('button:has-text("Add Step")');
  await page.click(`button:has-text("${stepName}")`);
}

export async function getNodeCount(page: Page): Promise<number> {
  return page.locator('.react-flow__node').count();
}

export async function getEdgeCount(page: Page): Promise<number> {
  return page.locator('.react-flow__edge').count();
}

export async function clickNode(page: Page, index: number) {
  const nodes = page.locator('.react-flow__node');
  await nodes.nth(index).click();
}

export async function mockAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('accessToken', 'mock-token-for-e2e');
    localStorage.setItem('refreshToken', 'mock-refresh-for-e2e');
  });
}
