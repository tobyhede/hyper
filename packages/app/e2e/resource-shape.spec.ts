import { COLLAPSED_RESOURCE_SIZE, encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test, type Locator, type Page } from './fixtures';
import {
  authoringHandle,
  connectHandles,
  createResource,
  dragBy,
  nodeByTitle,
  positionOf,
  resourceActions,
  resourceControls,
  resourceShapeChoice,
  selectCanvas,
  selectedCanvas,
  settled,
} from './graph';
import { seedPositionedMap } from './seed';
import { drawnOutline, outlineTreatment } from './resource-shape-outline';

/**
 * An Ur Resource's Shape (ADR 0121): chosen from its rail and drawn at the
 * Resource's rect — at the Closed Size, and at whatever size it is resized to.
 * Only an Ur Resource takes a Shape, so each test creates or seeds one; the
 * fixture's Markdown Resources offer no Shape choice. An Ur Resource has no
 * content, so it is never Open.
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

/** Open U's Shape choice from its rail. */
const resourceShapeChoiceOfUr = (page: Page): Promise<Locator> =>
  resourceShapeChoice(page, nodeByTitle(page, UR).first());

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

/** The four non-rectangle Shapes, by the name the Shape choice gives each. */
const DRAWN_RESOURCE_SHAPES = [
  ['Pill', 'pill'],
  ['Ellipse', 'ellipse'],
  ['Diamond', 'diamond'],
] as const;

/** Choose a Shape from U's rail and wait for it to be drawn. */
async function chooseResourceShape(
  page: Page,
  ur: Locator,
  name: string,
  resourceShape: string,
): Promise<void> {
  await (await resourceShapeChoiceOfUr(page)).getByRole('menuitemradio', { name }).click();
  await expect(face(ur)).toHaveAttribute('data-resource-shape', resourceShape);
}

/** The rect a Resource's front is drawn at, in canvas units. */
const drawnSize = (node: Locator): Promise<readonly [number, number]> =>
  face(node).evaluate((element) =>
    element instanceof HTMLElement ? [element.offsetWidth, element.offsetHeight] : [0, 0],
  );

/** Wait for a node's placement animations to finish. */
const placementSettled = (node: Locator): Promise<void> =>
  node.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });

/** An Ur Resource seeded at a size an author resized it to. */
const RESIZED_UR = uuidSchema.parse('00000000-0000-4000-8000-0000000000a1');
const RESIZED = [440, 260] as const;

/** Open a Space whose seeded Map holds one Ur Resource `U`, resized and Closed. */
async function seedResizedUr(page: Page): Promise<Locator> {
  const seeded = await seedPositionedMap(
    page,
    'Shapes',
    () => ({
      [RESIZED_UR]: { x: 0, y: 0, open: false, size: { width: RESIZED[0], height: RESIZED[1] } },
    }),
    [{ id: RESIZED_UR, document: { title: UR, kind: 'ur' } }],
  );
  await page.goto(`/spaces/${encodeCompactUuid(seeded.snapshot.id)}`);
  await expect(selectedCanvas(page)).toContainText('Shapes');
  await settled(page);
  const ur = nodeByTitle(page, UR).first();
  await expect(face(ur)).toHaveAttribute('data-kind', 'ur');
  await placementSettled(ur);
  return ur;
}

test(
  'a Diamond chosen from an Ur Resource’s rail is drawn, kept on reload, and the Resource offers no Open',
  { tag: '@parity:ur-resource-shape-chosen-from-its-rail' },
  async ({ page }) => {
    const ur = await createUr(page);
    await expect(face(ur)).toHaveAttribute('data-resource-shape', 'rectangle');
    const status = page.getByTestId('persistence-status');
    const before = Number(await status.getAttribute('data-revision'));
    const toolbar = await resourceControls(page, ur);
    // The rail's face is the Shape the Resource is drawn in; the Actions menu offers none.
    await expect(toolbar.getByRole('button', { name: 'Shape: Rectangle' })).toBeVisible();
    await expect(
      toolbar.getByRole('button', { name: 'Shape: Rectangle' }).locator('svg[data-resource-shape]'),
    ).toHaveAttribute('data-resource-shape', 'rectangle');
    const menu = await resourceActions(page, UR);
    await expect(menu.getByRole('menuitem', { name: 'Create Reference' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Shape/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    const resourceShapes = await resourceShapeChoiceOfUr(page);
    await expect(resourceShapes.getByRole('menuitemradio')).toHaveText([
      'Rectangle',
      'Pill',
      'Ellipse',
      'Diamond',
    ]);
    await expect(resourceShapes.locator('svg[data-resource-shape]')).toHaveCount(4);
    await expect(resourceShapes).not.toContainText('Shape');
    await expect(chosenResourceShape(resourceShapes)).toHaveText('Rectangle');
    await resourceShapes.getByRole('menuitemradio', { name: 'Diamond' }).click();

    await expect(face(ur)).toHaveAttribute('data-resource-shape', 'diamond');
    await expect(
      (await resourceControls(page, ur)).getByRole('button', { name: 'Shape: Diamond' }),
    ).toBeVisible();
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

    // The recorded Shape is still chosen, and an Ur Resource, having no content,
    // offers no Open.
    const reloadedResourceShapes = await resourceShapeChoiceOfUr(page);
    await expect(chosenResourceShape(reloadedResourceShapes)).toHaveText('Diamond');
    await page.keyboard.press('Escape');
    const reloadedControls = await resourceControls(page, reloaded);
    await expect(reloadedControls.getByRole('button', { name: `Open Resource ${UR}` })).toHaveCount(
      0,
    );
    await expect(face(reloaded)).toHaveAttribute('data-open', 'false');
  },
);

test('a Markdown Resource offers no Shape choice', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  const menu = await resourceActions(page, 'A');
  await expect(menu.getByRole('menuitem', { name: 'Create Reference' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Shape/ })).toHaveCount(0);
  await expect(
    (await resourceControls(page, nodeByTitle(page, 'A').first())).getByRole('button', {
      name: /^Shape: /,
    }),
  ).toHaveCount(0);
});

/**
 * The canvas attaches an Edge to the sides its two Resources' rects face each
 * other across, whichever handle the gesture began on (ADR 0087), so U is put
 * directly below T: the Edge leaves T's bottom and enters U's top.
 */
test('an Edge drawn to a Closed diamond meets its outline', async ({ page }) => {
  const ur = await createUr(page);
  const urId = await ur.getAttribute('data-id');
  if (urId === null) throw new Error('The Ur Resource has no id.');
  const t = page.locator(`.react-flow__node[data-id="${RESOURCE_T}"]`);
  const { width, height } = COLLAPSED_RESOURCE_SIZE;

  const tAt = await positionOf(t);
  const urAt = await positionOf(ur);
  await dragBy(page, ur, tAt.x - urAt.x, tAt.y + height + 120 - urAt.y);
  await settled(page);
  const at = await positionOf(ur);
  // Under T, overlapping it horizontally and clear of it vertically.
  expect(Math.abs(at.x - tAt.x)).toBeLessThan(width / 2);
  expect(at.y).toBeGreaterThan(tAt.y + height);

  await chooseResourceShape(page, ur, 'Diamond', 'diamond');
  await page.keyboard.press('Escape');
  await settled(page);

  const before = await page.locator('.react-flow__edge').count();
  await t.hover();
  await connectHandles(
    page,
    authoringHandle(t, 'source', 'bottom'),
    authoringHandle(ur, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
  await settled(page);

  // The diamond's top vertex is the midpoint of U's top side, and the Edge
  // ends on the handle centred there, its radius outside.
  const end = await edgeEnd(page, `${LONG}::${RESOURCE_T}::${urId}`);
  expect(end.x).toBeCloseTo(at.x + width / 2, 0);
  expect(end.y).toBeCloseTo(at.y - RADIUS, 0);
  await expect.poll(() => outlineOffset(ur)).toBeLessThan(0.5);
  // The drawn diamond, not only its rect, reaches that midpoint.
  expect((await drawnOutline(face(ur))).touchesSideMidpoints, 'the outline holds the vertex').toBe(
    true,
  );
});

test(
  'each Shape is drawn at the Closed Size and at the size it is resized to, touching every side midpoint',
  { tag: '@parity:ur-resource-draws-its-shape' },
  async ({ page }) => {
    const ur = await createUr(page);

    for (const [name, resourceShape] of DRAWN_RESOURCE_SHAPES) {
      await chooseResourceShape(page, ur, name, resourceShape);
      await expect.poll(() => outlineOffset(ur)).toBeLessThan(0.5);
      expect(await drawnOutline(face(ur)), name).toEqual({
        shape: resourceShape,
        size: [COLLAPSED_RESOURCE_SIZE.width, COLLAPSED_RESOURCE_SIZE.height],
        touchesSideMidpoints: true,
        fillsCorner: false,
        holdsTitle: true,
        drawsKindGlyph: false,
        shortTitle: { text: UR, oneLine: true, insideBody: true },
      });
    }

    // Resized, the Shape is drawn at the size the Map gives it.
    await page.keyboard.press('Escape');
    const resized = await seedResizedUr(page);
    expect(await drawnSize(resized)).toEqual(RESIZED);
    for (const [name, resourceShape] of DRAWN_RESOURCE_SHAPES) {
      await chooseResourceShape(page, resized, name, resourceShape);
      await page.keyboard.press('Escape');
      await expect.poll(() => outlineOffset(resized)).toBeLessThan(0.5);
      expect(await drawnOutline(face(resized)), `${name} · resized`).toEqual({
        shape: resourceShape,
        size: RESIZED,
        touchesSideMidpoints: true,
        fillsCorner: false,
        holdsTitle: true,
        drawsKindGlyph: false,
        shortTitle: { text: UR, oneLine: true, insideBody: true },
      });
    }

    await page.reload();
    const reloaded = nodeByTitle(page, UR).first();
    await expect(face(reloaded)).toHaveAttribute('data-resource-shape', 'diamond');
    await expect.poll(() => drawnSize(reloaded)).toEqual(RESIZED);
  },
);

/**
 * The selection ring follows the outline, at any size. A Reference Resource
 * made from an Ur Resource in a Shape is not an Ur Resource, so it is the
 * rectangle and offers no Shape.
 */
test(
  "a Shape's selection ring follows its outline at any size, and a Reference Resource made from it is the rectangle",
  { tag: '@parity:ur-resource-treatments-follow-its-shape' },
  async ({ page }) => {
    const ur = await createUr(page);

    // Selected: the ring is the diamond's, not the rect's.
    await (
      await resourceShapeChoiceOfUr(page)
    )
      .getByRole('menuitemradio', { name: 'Diamond' })
      .click();
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
    await expect(
      (await resourceControls(page, reference)).getByRole('button', { name: /^Shape: / }),
    ).toHaveCount(0);

    // Resized and selected, the ring is still the diamond's.
    const resized = await seedResizedUr(page);
    await chooseResourceShape(page, resized, 'Diamond', 'diamond');
    await expect(face(resized)).toHaveAttribute('data-state', 'selected');
    await expect
      .poll(() => outlineTreatment(face(resized)))
      .toEqual({
        ringShown: true,
        ringFollowsOutline: true,
        edge: 'solid',
        rectBorder: false,
      });
  },
);

test(
  'a selected Shape frames its rect with the resize control on its corner, and resizing it Closed keeps it Closed',
  { tag: '@parity:selected-shape-frames-its-rect-for-resize' },
  async ({ page }) => {
    const ur = await seedResizedUr(page);
    const control = ur.locator('.react-flow__resize-control.handle.bottom.right');
    const frame = ur.locator('.rf-resource-node__resize-frame');
    // Unselected, the Resource offers no control and draws no frame.
    await page.mouse.move(1, 1);
    await expect(ur).not.toHaveClass(/\bselected\b/);
    await expect(control).toHaveCount(0);
    await expect(frame).toHaveCount(0);

    await chooseResourceShape(page, ur, 'Diamond', 'diamond');
    await expect(face(ur)).toHaveAttribute('data-state', 'selected');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveCSS('border-top-width', '1px');
    await expect(control).toHaveCount(1);
    await expect(control).toHaveCSS('opacity', '1');

    // The frame is the rect, and the control's mark sits on its bottom-right corner.
    const nodeBox = await ur.boundingBox();
    const frameBox = await frame.boundingBox();
    const controlBox = await control.boundingBox();
    if (nodeBox === null || frameBox === null || controlBox === null)
      throw new Error('The selected Shape draws no frame or control.');
    expect(frameBox.x).toBeCloseTo(nodeBox.x, 0);
    expect(frameBox.y).toBeCloseTo(nodeBox.y, 0);
    expect(frameBox.width).toBeCloseTo(nodeBox.width, 0);
    expect(frameBox.height).toBeCloseTo(nodeBox.height, 0);
    expect(controlBox.x + controlBox.width).toBeCloseTo(frameBox.x + frameBox.width, 0);
    expect(controlBox.y + controlBox.height).toBeCloseTo(frameBox.y + frameBox.height, 0);

    const status = page.getByTestId('persistence-status');
    const before = Number(await status.getAttribute('data-revision'));
    await page.mouse.move(
      controlBox.x + controlBox.width / 2,
      controlBox.y + controlBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      controlBox.x + controlBox.width / 2 + 120,
      controlBox.y + controlBox.height / 2 + 80,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(status).toHaveAttribute('data-revision', String(before + 1));
    await placementSettled(ur);
    const [width, height] = await drawnSize(ur);
    expect(width).toBeGreaterThan(RESIZED[0]);
    expect(height).toBeGreaterThan(RESIZED[1]);
    await expect(ur.locator('.rf-resource-node__inner')).toHaveAttribute('data-open', 'false');
  },
);
