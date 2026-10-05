import { COLLAPSED_RESOURCE_SIZE } from '@project/core';
import { expect, test, type Locator, type Page } from './fixtures';
import {
  authoringHandle,
  connectHandles,
  createResource,
  dragBy,
  nodeByTitle,
  openResource,
  positionOf,
  resourceActions,
  resourceControls,
  resourceToolbar,
  selectCanvas,
  settled,
} from './graph';
import { drawnOutline, outlineTreatment } from './resource-shape-outline';

/**
 * An Ur Resource's Shape (ADR 0117): chosen from its Actions menu, drawn by a
 * Closed Ur Resource inside its fixed Closed Size, and replaced by the
 * rectangle while it is Open. Only an Ur Resource takes a Shape, so each test
 * creates one; the fixture's Markdown Resources offer no Shape choice.
 */

const LONG = '00000000-0000-4000-8000-000000000023';
/** The fixture's three-line Title `T`, on the row below A. */
const RESOURCE_T = '00000000-0000-4000-8000-00000000000e';
/** The Title every Ur Resource these tests create is given. */
const UR = 'U';

/** Half the 24-unit anchor: React Flow ends an Edge on the handle's outer rim. */
const RADIUS = 12;

const face = (node: Locator): Locator => node.locator('.canvas-resource');

/**
 * On Collection 1, create an Ur Resource titled `U` and move it below the
 * fixture's rows, clear of every other Resource, answering its node.
 */
async function createUr(page: Page): Promise<Locator> {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createResource(page, 'Ur Resource');
  const title = page.getByRole('textbox', { name: 'Resource title' });
  await expect(title).toBeFocused();
  await title.fill(UR);
  await title.press('Enter');
  await expect(title).toHaveCount(0);
  const ur = nodeByTitle(page, UR).first();
  await expect(face(ur)).toHaveAttribute('data-kind', 'ur');
  await settled(page);
  // A new Resource lands at the centre of the view, over the fixture's row.
  await dragBy(page, ur, 0, 250);
  await settled(page);
  return ur;
}

/**
 * Open U's Actions menu and its Shape choice, answering the list of Shapes.
 *
 * A Resource whose toolbar is already drawn is not pressed again, so the same
 * menu is reached Open and Closed.
 */
async function resourceShapeChoice(page: Page): Promise<Locator> {
  const ur = nodeByTitle(page, UR).first();
  const toolbar = await resourceToolbar(page, ur);
  if ((await toolbar.count()) === 0) await resourceActions(page, UR);
  else
    await toolbar.getByRole('button', { name: `Actions for Resource ${UR}` }).click({ delay: 120 });
  await page.getByRole('menu').last().getByRole('menuitem', { name: 'Shape' }).click();
  const resourceShapes = page.getByRole('group', { name: 'Shape' });
  await expect(resourceShapes).toBeVisible();
  return resourceShapes;
}

/** The checked Shape in an open Shape choice. */
const chosenResourceShape = (resourceShapes: Locator): Locator =>
  resourceShapes.getByRole('menuitemradio', { checked: true });

/**
 * The drawn outline's rect against its Resource's, in screen pixels: the
 * outline is stretched to the rect, so it reaches the side midpoints.
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

test('a Diamond chosen from an Ur Resource’s Actions menu is drawn Closed, kept on reload, and a rectangle while Open', async ({
  page,
}) => {
  const ur = await createUr(page);
  await expect(face(ur)).toHaveAttribute('data-resource-shape', 'rectangle');
  const status = page.getByTestId('persistence-status');
  const before = Number(await status.getAttribute('data-revision'));

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

  await expect(face(ur)).toHaveAttribute('data-resource-shape', 'diamond');
  await expect.poll(() => outlineOffset(ur)).toBeLessThan(0.5);
  // The Shape changes no rect: the Resource keeps the fixed Closed Size.
  expect(
    await face(ur).evaluate((element) =>
      element instanceof HTMLElement ? [element.offsetWidth, element.offsetHeight] : [],
    ),
  ).toEqual([COLLAPSED_RESOURCE_SIZE.width, COLLAPSED_RESOURCE_SIZE.height]);
  // One Edit.
  await expect(status).toHaveAttribute('data-revision', String(before + 1));

  await page.reload();
  await selectCanvas(page, 'Collection 1');
  const reloaded = nodeByTitle(page, UR).first();
  await expect(face(reloaded)).toHaveAttribute('data-resource-shape', 'diamond');

  // Offered Open as well as Closed, with the recorded Shape still chosen.
  await openResource(reloaded, UR);
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
    .getByRole('button', { name: `Close Resource ${UR}` })
    .click();
  await expect(face(reloaded)).toHaveAttribute('data-open', 'false');
  await expect(face(reloaded)).toHaveAttribute('data-resource-shape', 'diamond');
});

test('a Markdown Resource offers no Shape choice', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  const menu = await resourceActions(page, 'A');
  await expect(menu.getByRole('menuitem', { name: 'Create Reference' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Shape' })).toHaveCount(0);
});

test('an Edge drawn to a Closed diamond meets its outline', async ({ page }) => {
  const ur = await createUr(page);
  const urId = await ur.getAttribute('data-id');
  if (urId === null) throw new Error('The Ur Resource has no id.');
  const t = page.locator(`.react-flow__node[data-id="${RESOURCE_T}"]`);

  const resourceShapes = await resourceShapeChoice(page);
  await resourceShapes.getByRole('menuitemradio', { name: 'Diamond' }).click();
  await expect(face(ur)).toHaveAttribute('data-resource-shape', 'diamond');
  await page.keyboard.press('Escape');
  await settled(page);

  // The canvas attaches the Edge to whichever of U's sides faces T, so it is
  // asked to end at the vertex on any of them.
  const before = await page.locator('.react-flow__edge').count();
  await t.hover();
  await connectHandles(
    page,
    authoringHandle(t, 'source', 'top'),
    authoringHandle(ur, 'target', 'bottom'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
  await settled(page);

  // Each of the diamond's vertices is the midpoint of one of U's sides, and
  // the Edge ends on the handle centred at one of them, its radius outside.
  const at = await positionOf(ur);
  const end = await edgeEnd(page, `${LONG}::${RESOURCE_T}::${urId}`);
  const { width, height } = COLLAPSED_RESOURCE_SIZE;
  const handleCentres = [
    { x: at.x + width / 2, y: at.y - RADIUS },
    { x: at.x + width + RADIUS, y: at.y + height / 2 },
    { x: at.x + width / 2, y: at.y + height + RADIUS },
    { x: at.x - RADIUS, y: at.y + height / 2 },
  ];
  expect(
    Math.min(
      ...handleCentres.map((centre) =>
        Math.max(Math.abs(end.x - centre.x), Math.abs(end.y - centre.y)),
      ),
    ),
    `the Edge ends at a vertex, not at ${end.x},${end.y}`,
  ).toBeLessThan(2);
  await expect.poll(() => outlineOffset(ur)).toBeLessThan(0.5);
  // The drawn diamond, not only its rect, reaches that midpoint.
  expect((await drawnOutline(face(ur))).touchesSideMidpoints, 'the outline holds the vertex').toBe(
    true,
  );
});

test(
  'each Shape chosen from the Actions menu is drawn Closed at the Closed Size, touching every side midpoint',
  { tag: '@parity:closed-resource-draws-its-shape' },
  async ({ page }) => {
    const ur = await createUr(page);

    for (const [name, resourceShape] of [
      ['Pill', 'pill'],
      ['Ellipse', 'ellipse'],
      ['Diamond', 'diamond'],
      ['Hexagon', 'hexagon'],
    ] as const) {
      const resourceShapes = await resourceShapeChoice(page);
      await resourceShapes.getByRole('menuitemradio', { name }).click();
      await expect(face(ur)).toHaveAttribute('data-resource-shape', resourceShape);
      await expect.poll(() => outlineOffset(ur)).toBeLessThan(0.5);
      expect(await drawnOutline(face(ur)), name).toEqual({
        shape: resourceShape,
        size: [COLLAPSED_RESOURCE_SIZE.width, COLLAPSED_RESOURCE_SIZE.height],
        touchesSideMidpoints: true,
        fillsCorner: false,
        holdsTitleAndGlyph: true,
        shortTitle: { text: UR, oneLine: true, insideBody: true },
      });
    }

    await page.reload();
    await selectCanvas(page, 'Collection 1');
    await expect(face(nodeByTitle(page, UR).first())).toHaveAttribute(
      'data-resource-shape',
      'hexagon',
    );
  },
);

/**
 * The selection ring follows the outline. A Reference Resource made from an
 * Ur Resource in a Shape is not an Ur Resource, so it is the rectangle and
 * offers no Shape.
 */
test(
  "a Closed Shape's selection ring follows its outline, and a Reference Resource made from it is the rectangle",
  { tag: '@parity:closed-resource-treatments-follow-its-shape' },
  async ({ page }) => {
    const ur = await createUr(page);

    // Selected: the ring is the diamond's, not the rect's.
    await (await resourceShapeChoice(page)).getByRole('menuitemradio', { name: 'Diamond' }).click();
    await expect(face(ur)).toHaveAttribute('data-resource-shape', 'diamond');
    await expect(face(ur)).toHaveAttribute('data-state', 'selected');
    await expect
      .poll(() => outlineTreatment(face(ur)))
      .toEqual({
        ringShown: true,
        ringFollowsOutline: true,
        edge: 'solid',
        rectBorder: false,
      });
    await page.keyboard.press('Escape');

    const menu = await resourceActions(page, UR);
    await menu.getByRole('menuitem', { name: 'Create Reference' }).click();
    const title = page.getByRole('textbox', { name: 'Resource title' });
    await expect(title).toBeFocused();
    await title.fill('U, again');
    await title.press('Enter');
    await expect(title).toHaveCount(0);
    await settled(page);
    const reference = nodeByTitle(page, 'U, again');
    await expect(face(reference)).toHaveAttribute('data-kind', 'reference');
    await expect(face(reference)).toHaveAttribute('data-resource-shape', 'rectangle');
    await expect(reference.locator('.canvas-resource__outline')).toHaveCount(0);
    const referenceMenu = await resourceActions(page, 'U, again');
    await expect(
      referenceMenu.getByRole('menuitem', { name: 'Copy link to Target' }),
    ).toBeVisible();
    await expect(referenceMenu.getByRole('menuitem', { name: 'Shape' })).toHaveCount(0);
  },
);
