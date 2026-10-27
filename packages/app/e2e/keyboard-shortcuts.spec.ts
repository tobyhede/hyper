import { expect, test } from './fixtures';
import {
  nodeByTitle,
  presentControl,
  presentedName,
  resourceActions,
  selectResource,
  settled,
  stage,
} from './graph';

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

/**
 * P presents the Active Graph from the selected Resource, with a Traversal that
 * begins there, so there is nothing to go Back to; the Resource's Actions menu
 * offers the same command.
 */
test('P and Present from Here present from the selected Resource', async ({ page }) => {
  await page.goto('/');
  const b = nodeByTitle(page, 'B').first();
  await expect(b).toBeVisible();
  await settled(page);
  await selectResource(b);

  await page.keyboard.press('p');

  await expect(stage(page)).toBeVisible();
  await expect(presentedName(page)).toHaveText('B');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(stage(page)).toHaveCount(0);

  const menu = await resourceActions(page, 'C');
  await menu.getByRole('menuitem', { name: 'Present from Here' }).click();

  await expect(stage(page)).toBeVisible();
  await expect(presentedName(page)).toHaveText('C');
});

/**
 * Space reads the focused Resource in Full View over the canvas. Inside it the
 * arrows go along the Active Graph, Escape leaves back to the Resource
 * last read, and Enter leaves and Opens it. Reading is no Edit, so the Space's
 * revision does not move until that Open.
 */
test('Space reads a Resource in Full View, walks the Active Graph and leaves', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  const persistence = page.getByTestId('persistence-status');
  const revision = await persistence.getAttribute('data-revision');
  const aBox = await a.boundingBox();
  const bBox = await nodeByTitle(page, 'B').first().boundingBox();
  if (aBox === null || bBox === null) throw new Error('A and B are drawn');
  const towardB = arrowToward(aBox, bBox);
  await selectResource(a);

  await page.keyboard.press('Space');
  const fullView = page.getByRole('region', { name: 'Full View' });
  await expect(fullView).toBeFocused();
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('A');
  await expect(page.getByRole('toolbar', { name: 'Command Dock' })).toBeVisible();

  // Modal over the canvas: Shift+Tab moves focus by the browser's order, which
  // skips the covered Map, and the canvas's keys pressed from there leave that
  // Map alone.
  await page.keyboard.press('Shift+Tab');
  await expect(fullView).not.toBeFocused();
  await expect(page.locator('.react-flow__node:focus-within')).toHaveCount(0);
  await page.keyboard.press('c');
  await page.keyboard.press('F2');
  await expect(page.locator('.react-flow').getByRole('textbox')).toHaveCount(0);
  await expect(persistence).toHaveAttribute('data-revision', revision ?? '');
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('A');
  await fullView.focus();

  await page.keyboard.press(towardB);
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('B');
  await page.keyboard.press(opposite[towardB]);
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('A');
  await page.keyboard.press(towardB);

  await page.keyboard.press('Escape');
  await expect(fullView).toHaveCount(0);
  const b = nodeByTitle(page, 'B').first();
  await expect(b).toBeFocused();
  await expect(persistence).toHaveAttribute('data-revision', revision ?? '');

  await page.keyboard.press('Space');
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('B');
  await page.keyboard.press('Enter');
  await expect(fullView).toHaveCount(0);
  await expect(b.locator('.canvas-resource[data-open="true"]')).toHaveCount(1);
});

/** A presentation clicker sends Page Down and Page Up; Home starts the Graph again. */
test('Page Down, Page Up and Home move through a presentation', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  await selectResource(a);
  await page.keyboard.press('p');
  await expect(presentedName(page)).toHaveText('A');

  await page.keyboard.press('PageDown');
  await expect(presentedName(page)).toHaveText('B');
  await page.keyboard.press('PageDown');
  await expect(presentedName(page)).toHaveText('C');
  await page.keyboard.press('PageUp');
  await expect(presentedName(page)).toHaveText('B');

  await page.keyboard.press('Home');
  await expect(presentedName(page)).toHaveText('A');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toHaveCount(0);
});
