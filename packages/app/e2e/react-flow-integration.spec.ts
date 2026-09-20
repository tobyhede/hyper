import { expect, test } from './fixtures';
import { nodeByTitle, selectCanvas, settled } from './graph';

test('a focused Resource opens with Enter and Space', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const resource = nodeByTitle(page, 'A').first();
  await expect(resource).toBeVisible();
  await settled(page);

  // The guard that opening did not follow the pointer off the Resource when it
  // stopped being a gesture (ADR 0036, 0037).
  await resource.focus();
  await expect(resource).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(resource).toContainText('entry point');

  await resource.hover();
  await resource.getByRole('button', { name: 'Close Resource A' }).click();
  await resource.focus();
  await expect(resource).toBeFocused();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(resource).toContainText('entry point');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test('the graph shows React Flow attribution', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('.react-flow__attribution a[href*="reactflow.dev"]')).toBeVisible();
});
