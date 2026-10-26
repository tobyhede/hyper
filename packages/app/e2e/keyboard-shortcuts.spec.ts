import { expect, test } from './fixtures';
import { nodeByTitle, selectResource, selectedCanvas, settled } from './graph';

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

/**
 * Tab walks the Active Graph — Long, A → B → C → D → A′ — from the focused
 * Resource, Shift+Tab walks it back, and past its end Tab is the browser's again.
 */
test('Tab and Shift+Tab walk the Active Graph from the selected Resource', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  await selectResource(a);
  await expect(a).toBeFocused();

  for (const title of ['B', 'C', 'D', 'A′']) {
    await page.keyboard.press('Tab');
    const next = nodeByTitle(page, title).first();
    await expect(next).toBeFocused();
    await expect(next).toHaveClass(/\bselected\b/);
  }

  await page.keyboard.press('Shift+Tab');
  await expect(nodeByTitle(page, 'D').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(nodeByTitle(page, 'A′').first()).toBeFocused();

  // A′ is where Long ends: the next Tab moves focus on as the page would.
  await page.keyboard.press('Tab');
  await expect(nodeByTitle(page, 'A′').first()).not.toBeFocused();
});
