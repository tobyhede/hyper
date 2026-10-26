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

/** Which arrow points from one box's centre toward another's, on the dominant axis. */
const arrowToward = (
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
) => {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'ArrowRight' : 'ArrowLeft';
  return dy > 0 ? 'ArrowDown' : 'ArrowUp';
};

const opposite = {
  ArrowRight: 'ArrowLeft',
  ArrowLeft: 'ArrowRight',
  ArrowUp: 'ArrowDown',
  ArrowDown: 'ArrowUp',
} as const;

/**
 * A plain arrow follows the Active Graph's Edge that way, either direction, and
 * no longer moves the Resource; Shift and an arrow does.
 */
test('the arrow keys follow the Active Graph, and Shift and an arrow move the Resource', async ({
  page,
}) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  const b = nodeByTitle(page, 'B').first();
  await expect(a).toBeVisible();
  await settled(page);
  const aBox = await a.boundingBox();
  const bBox = await b.boundingBox();
  if (aBox === null || bBox === null) throw new Error('A and B are drawn');
  const towardB = arrowToward(aBox, bBox);

  await selectResource(a);
  await page.keyboard.press(opposite[towardB]);
  // Nothing on Long lies that way from A, so nothing moves and A keeps focus.
  await expect(a).toBeFocused();
  expect(await a.boundingBox()).toEqual(aBox);

  await page.keyboard.press(towardB);
  await expect(b).toBeFocused();
  await expect(b).toHaveClass(/\bselected\b/);
  expect(await a.boundingBox()).toEqual(aBox);

  // Back along the same Edge, against its direction.
  await page.keyboard.press(opposite[towardB]);
  await expect(a).toBeFocused();

  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await a.boundingBox())?.y).toBeGreaterThan(aBox.y);
});
