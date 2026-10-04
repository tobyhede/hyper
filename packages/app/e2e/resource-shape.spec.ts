import { COLLAPSED_RESOURCE_SIZE } from '@project/core';
import { expect, test, type Locator, type Page } from './fixtures';
import {
  authoringHandle,
  connectHandles,
  nodeByTitle,
  openResource,
  positionOf,
  resourceActions,
  resourceControls,
  resourceToolbar,
  selectCanvas,
  settled,
} from './graph';

/**
 * A Resource's Shape (ADR 0117): chosen from the Resource's Actions menu, drawn
 * by a Closed Resource inside its fixed Closed Size, and replaced by the
 * rectangle while the Resource is Open.
 */

const LONG = '00000000-0000-4000-8000-000000000023';
const RESOURCE_A = '00000000-0000-4000-8000-000000000002';
/** The fixture's three-line Title `T`, placed directly below A. */
const RESOURCE_T = '00000000-0000-4000-8000-00000000000e';

/** Half the 24-unit anchor: React Flow ends an Edge on the handle's outer rim. */
const RADIUS = 12;

const face = (node: Locator): Locator => node.locator('.canvas-resource');

/**
 * Open A's Actions menu and its Shape choice, answering the list of Shapes.
 *
 * A Resource whose toolbar is already drawn is not pressed again: a press on a
 * selected Open Markdown Resource begins editing its body.
 */
async function resourceShapeChoice(page: Page): Promise<Locator> {
  const a = nodeByTitle(page, 'A').first();
  const toolbar = await resourceToolbar(page, a);
  if ((await toolbar.count()) === 0) await resourceActions(page, 'A');
  else await toolbar.getByRole('button', { name: 'Actions for Resource A' }).click({ delay: 120 });
  await page.getByRole('menu').last().getByRole('menuitem', { name: 'Shape' }).click();
  const resourceShapes = page.getByRole('group', { name: 'Shape' });
  await expect(resourceShapes).toBeVisible();
  return resourceShapes;
}

/** The checked Shape in an open Shape choice. */
const chosenResourceShape = (resourceShapes: Locator): Locator =>
  resourceShapes.getByRole('menuitemradio', { checked: true });

/**
 * The drawn diamond's rect against its Resource's, in screen pixels: the
 * diamond is stretched to the rect, so its vertices are the side midpoints.
 */
const outlineOffset = (node: Locator) =>
  node.evaluate((element) => {
    const resource = element.querySelector('.canvas-resource');
    const outline = element.querySelector('.canvas-resource__outline');
    if (resource === null || outline === null) return null;
    const outer = resource.getBoundingClientRect();
    const drawn = outline.getBoundingClientRect();
    return Math.max(
      Math.abs(outer.x - drawn.x),
      Math.abs(outer.y - drawn.y),
      Math.abs(outer.width - drawn.width),
      Math.abs(outer.height - drawn.height),
    );
  });

/** The end of a drawn Edge, in flow coordinates (`M… C… <x>,<y>`). */
async function edgeEnd(page: Page, edge: string): Promise<{ x: number; y: number }> {
  const d = await page
    .locator(`.react-flow__edge[data-id="${edge}"] .react-flow__edge-path`)
    .getAttribute('d');
  const numbers = (d ?? '').match(/-?\d+(?:\.\d+)?/g) ?? [];
  expect(numbers, `path "${d}" should be a bezier with four points`).toHaveLength(8);
  return { x: Number(numbers[6]), y: Number(numbers[7]) };
}

test('a Diamond chosen from the Actions menu is drawn Closed, kept on reload, and a rectangle while Open', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(face(a)).toHaveAttribute('data-resource-shape', 'rectangle');

  const resourceShapes = await resourceShapeChoice(page);
  await expect(resourceShapes.getByRole('menuitemradio')).toHaveText([
    'Rectangle',
    'Pill',
    'Ellipse',
    'Diamond',
    'Hexagon',
  ]);
  await expect(chosenResourceShape(resourceShapes)).toHaveText('Rectangle');
  await resourceShapes.getByRole('menuitemradio', { name: 'Diamond' }).click();

  await expect(face(a)).toHaveAttribute('data-resource-shape', 'diamond');
  await expect.poll(() => outlineOffset(a)).toBeLessThan(0.5);
  // The Shape changes no rect: the Resource keeps the fixed Closed Size.
  expect(
    await face(a).evaluate((element) =>
      element instanceof HTMLElement ? [element.offsetWidth, element.offsetHeight] : [],
    ),
  ).toEqual([COLLAPSED_RESOURCE_SIZE.width, COLLAPSED_RESOURCE_SIZE.height]);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

  await page.reload();
  await selectCanvas(page, 'Collection 1');
  const reloaded = nodeByTitle(page, 'A').first();
  await expect(face(reloaded)).toHaveAttribute('data-resource-shape', 'diamond');

  // Offered Open as well as Closed, with the recorded Shape still chosen.
  await openResource(reloaded, 'A');
  await expect(face(reloaded)).toHaveAttribute('data-open', 'true');
  await expect(face(reloaded)).toHaveAttribute('data-resource-shape', 'rectangle');
  await expect(reloaded.locator('.canvas-resource__outline')).toHaveCount(0);
  const openResourceShapes = await resourceShapeChoice(page);
  await expect(chosenResourceShape(openResourceShapes)).toHaveText('Diamond');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await (
    await resourceControls(page, reloaded)
  )
    .getByRole('button', { name: 'Close Resource A' })
    .click();
  await expect(face(reloaded)).toHaveAttribute('data-open', 'false');
  await expect(face(reloaded)).toHaveAttribute('data-resource-shape', 'diamond');
});

test('an Edge drawn to a Closed diamond meets its outline', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  const t = page.locator(`.react-flow__node[data-id="${RESOURCE_T}"]`);
  await expect(a).toBeVisible();

  const resourceShapes = await resourceShapeChoice(page);
  await resourceShapes.getByRole('menuitemradio', { name: 'Diamond' }).click();
  await expect(face(a)).toHaveAttribute('data-resource-shape', 'diamond');
  await settled(page);

  // T sits directly below A, so the Edge it draws rises into A's bottom side.
  const before = await page.locator('.react-flow__edge').count();
  await t.hover();
  await connectHandles(
    page,
    authoringHandle(t, 'source', 'top'),
    authoringHandle(a, 'target', 'bottom'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
  await settled(page);

  // The diamond's bottom vertex is the midpoint of A's bottom side, and the
  // Edge ends on the handle centred there.
  const at = await positionOf(a);
  const end = await edgeEnd(page, `${LONG}::${RESOURCE_T}::${RESOURCE_A}`);
  const vertex = {
    x: at.x + COLLAPSED_RESOURCE_SIZE.width / 2,
    y: at.y + COLLAPSED_RESOURCE_SIZE.height,
  };
  expect(Math.abs(end.x - vertex.x), 'the Edge meets the vertex on its axis').toBeLessThan(2);
  expect(Math.abs(end.y - (vertex.y + RADIUS)), 'the Edge ends at the vertex').toBeLessThan(2);
  await expect.poll(() => outlineOffset(a)).toBeLessThan(0.5);
});
