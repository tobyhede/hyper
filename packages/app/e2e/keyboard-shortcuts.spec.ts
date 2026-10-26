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

  // A Dock button, outside the canvas, and Zoom out, a button inside it: the
  // canvas once answered `C` only from its own wrapper, and never from a button.
  await presentControl(page).focus();
  await page.keyboard.press('c');
  await expect(resources).toHaveCount(before + 1);

  await page.getByRole('button', { name: 'Zoom out' }).focus();
  await page.keyboard.press('c');
  await expect(resources).toHaveCount(before + 2);
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
 * Space reads the focused Resource in Full View over the canvas. Inside it Tab
 * and the arrows go along the Active Graph, Escape leaves back to the Resource
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
  await selectResource(a);

  await page.keyboard.press('Space');
  const fullView = page.getByRole('region', { name: 'Full View' });
  await expect(fullView).toBeFocused();
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('A');
  await expect(page.getByRole('toolbar', { name: 'Command Dock' })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('B');
  await page.keyboard.press('Shift+Tab');
  await expect(fullView.getByRole('heading', { level: 2 })).toHaveText('A');
  await page.keyboard.press('Tab');

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

/**
 * Shift+Enter Opens D, the fixture's long Resource, and grows it to fit its
 * content in one Edit: its text no longer overflows, A′ to its right makes
 * room, and the camera frames the whole of it. The Actions menu's Open and
 * Expand is the same Edit.
 */
test('Shift+Enter and Open and Expand open a Resource grown to fit its content', async ({
  page,
}) => {
  await page.goto('/');
  const d = nodeByTitle(page, 'D').first();
  const neighbour = nodeByTitle(page, 'A′').first();
  await expect(d).toBeVisible();
  await settled(page);
  const gapOf = async () => {
    const [left, right] = await Promise.all([d.boundingBox(), neighbour.boundingBox()]);
    if (left === null || right === null) throw new Error('D and A′ are drawn');
    return { left, gap: right.x - (left.x + left.width) };
  };
  const closed = await gapOf();
  const persistence = page.getByTestId('persistence-status');
  const revision = Number(await persistence.getAttribute('data-revision'));

  await selectResource(d);
  await page.keyboard.press('Shift+Enter');

  await expect(d.locator('.canvas-resource[data-open="true"]')).toHaveCount(1);
  await expect(persistence).toHaveAttribute('data-revision', String(revision + 1));
  await settled(page);
  const body = d.locator('.markdown-resource-body__rendered');
  await expect(body).toContainText('fifteen');
  expect(
    await body.evaluate((element) => element.scrollHeight - element.clientHeight),
  ).toBeLessThanOrEqual(1);
  const open = await gapOf();
  expect(open.left.width).toBeGreaterThan(closed.left.width);
  expect(open.left.height).toBeGreaterThan(closed.left.height);
  // A′ took the width change, so the room between them is what it was.
  expect(Math.abs(open.gap - closed.gap)).toBeLessThanOrEqual(1);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(open.left.x).toBeGreaterThanOrEqual(0);
  expect(open.left.y).toBeGreaterThanOrEqual(0);
  expect(open.left.x + open.left.width).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(open.left.y + open.left.height).toBeLessThanOrEqual(viewport?.height ?? 0);

  // Already Open at the size it fits: the same Edit again changes nothing.
  await (
    await resourceActions(page, 'D')
  )
    .getByRole('menuitem', { name: 'Open and Expand' })
    .click();
  await settled(page);
  await expect(persistence).toHaveAttribute('data-revision', String(revision + 1));
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
