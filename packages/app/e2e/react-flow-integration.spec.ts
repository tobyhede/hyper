import { expect, test } from './fixtures';
import { nodeByTitle, selectCanvas, settled } from './graph';

test('a focused Thing opens with Enter and Space', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await settled(page);

  // The guard that opening did not follow the pointer off the Thing when it
  // stopped being a gesture (ADR 0036, 0037).
  await thing.focus();
  await expect(thing).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(thing).toContainText('entry point');

  await thing.hover();
  await thing.getByRole('button', { name: 'Close Thing A' }).click();
  await thing.focus();
  await expect(thing).toBeFocused();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(thing).toContainText('entry point');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test('the graph shows React Flow attribution', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('.react-flow__attribution a[href*="reactflow.dev"]')).toBeVisible();
});
