import { expect, test } from './fixtures';
import { nodeByTitle, presentControl, selectResource, settled } from './graph';

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

  // A Dock button, outside the canvas, and Zoom out, a button inside it: `C`
  // is answered from a focused button in either place.
  await presentControl(page).focus();
  await page.keyboard.press('c');
  await expect(resources).toHaveCount(before + 1);

  await page.getByRole('button', { name: 'Zoom out' }).focus();
  await page.keyboard.press('c');
  await expect(resources).toHaveCount(before + 2);
});

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
 * From a selected Resource, a plain arrow follows the Active Graph's Edge that
 * way, either direction, and no longer moves the Resource; Shift and an arrow
 * does.
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

  // A held arrow's repeats are spent: toward B, where the first press would
  // go, a repeat neither walks nor nudges, and nor does the arrow with Ctrl.
  await a.dispatchEvent('keydown', { key: towardB, repeat: true, bubbles: true });
  await page.keyboard.press(`Control+${towardB}`);
  await expect(a).toBeFocused();
  expect(await a.boundingBox()).toEqual(aBox);

  // Only from a selected Resource: A focused once Escape has unselected it, as
  // the browser's Tab would leave it, keeps the arrow toward B to itself.
  await page.keyboard.press('Escape');
  await expect(a).not.toHaveClass(/\bselected\b/);
  await a.focus();
  await page.keyboard.press(towardB);
  await expect(a).toBeFocused();
  await expect(b).not.toHaveClass(/\bselected\b/);
  await selectResource(a);

  await page.keyboard.press('Shift+ArrowDown');
  await expect.poll(async () => (await a.boundingBox())?.y).toBeGreaterThan(aBox.y);
});
