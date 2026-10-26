import { expect, test } from './fixtures';
import { nodeByTitle, selectedCanvas, settled } from './graph';

/**
 * The canvas's keys answer wherever focus is, except a surface that owns its
 * keys (`packages/app/src/key-bindings.ts`), so a control on the Dock does not
 * swallow them.
 */
test('C adds a Resource while a Dock control has focus', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A')).toBeVisible();
  await settled(page);
  const resources = page.locator('.react-flow__node');
  const before = await resources.count();

  await selectedCanvas(page).focus();
  await page.keyboard.press('c');

  await expect(resources).toHaveCount(before + 1);
});
