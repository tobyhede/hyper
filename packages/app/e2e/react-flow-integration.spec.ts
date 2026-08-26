import { expect, test } from './fixtures';
import { nodeByTitle, settled } from './graph';

test('a focused Card opens with Enter and Space', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  // The guard that opening did not follow the pointer off the Card when it
  // stopped being a gesture (ADR 0036, 0037).
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card).toContainText('entry point');

  await card.getByRole('button', { name: 'Close Card A' }).click();
  await card.focus();
  await expect(card).toBeFocused();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(card).toContainText('entry point');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test('the graph shows React Flow attribution', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('.react-flow__attribution a[href*="reactflow.dev"]')).toBeVisible();
});
