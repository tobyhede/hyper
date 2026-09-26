import {
  authoringHandle,
  connectHandles,
  resourceControls,
  resourceToolbar,
  selectResource,
  boxOf,
} from '../e2e/graph';
import {
  beginPortalEdit,
  embeddedGraphEdgeCount,
  exercisePortalEditHostCanvas,
  exerciseSpaceResourcePadding,
  exerciseSpaceResourceFooter,
  exerciseResourceToolbarFloats,
  hostGraphEdgeCount,
} from '../e2e/space-resource-frame';
import {
  exerciseSpaceResourceContextMenus,
  exerciseSpaceResourceEntityMenu,
} from '../e2e/space-resource-context-menu';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectEmbeddedResourceToFollowDrag } from '../e2e/support/embedded-drag';

const STORY = '/?story=surfaces--space-resource-embedded-map--selected-map&mode=preview';

/** The containing Space Resource, by the Resource id the story Space declares for it. */
const spaceResource = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id="00000000-0000-4000-8000-000000000005"]');

/**
 * The Resources the Space Resource draws, by the id shape the projection gives them.
 *
 * `embedded:<spaceResourceId>:<targetResourceId>` names a placement rather than a Resource,
 * because one target Space may be shown by two Space Resources on one canvas — so
 * the prefix is the only stable resource about it from out here, and it is exactly
 * what says "this node belongs to another Space".
 */
const embeddedNodes = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id^="embedded:"]');

const open = async (page: Page): Promise<void> => {
  await page.goto(STORY);
  // The target Space is read asynchronously — it is a different Space, stored
  // beside this one — so the Resource draws before its Map can, and waiting on
  // the Resource alone would race the read this story is about.
  await expect(embeddedNodes(page)).toHaveCount(2, { timeout: 20_000 });
};

test(
  'an Open Space Resource draws the Map it selects inside its own rect',
  { tag: '@parity:open-space-resource-draws-its-selected-map' },
  async ({ page }) => {
    await open(page);

    // Titles from the other Space, which no Resource of the containing Space
    // carries — so a node drawing one could not have come from anywhere else.
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Intake' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Storage' })).toBeVisible();
    // The selected Graph is drawn with them: an embedded Map is the Resources
    // *and* the one Graph the Resource selects across them.
    await expect(
      page.locator('.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]'),
    ).toHaveCount(1);

    // Inside the Space Resource's own box, which is what makes the Resource a window
    // onto another Space rather than a second row of Resources beside it. React
    // Flow renders a sub-flow child as a sibling of its parent, so containment
    // is a fact about the measured boxes and never about the DOM tree.
    const outer = await spaceResource(page).boundingBox();
    if (outer === null) throw new Error('The Space Resource was not drawn');
    for (const node of await embeddedNodes(page).all()) {
      const inner = await node.boundingBox();
      if (inner === null) throw new Error('An embedded Resource was not drawn');
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  },
);

/**
 * An embedded Edge is drawn and nothing else: a press on it reaches whatever lies
 * beneath. That holds because it is minted not selectable and the canvas has no
 * Edge click handler, so React Flow marks its group `inactive`.
 */
test('an embedded Edge takes no pointer events, even on its own curve', async ({ page }) => {
  await open(page);
  const edge = page.locator('.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]');
  await expect(edge).toHaveCount(1);
  await expect(edge).toHaveClass(/\binactive\b/);

  // The topmost element at the midpoint of the drawn curve, in page coordinates.
  const passesThrough = await edge.locator('path.react-flow__edge-path').evaluate((path) => {
    if (!(path instanceof SVGGeometryElement)) throw new Error('The Edge drew no path');
    const middle = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM();
    if (matrix === null) throw new Error('The Edge path is not rendered');
    const point = middle.matrixTransform(matrix);
    const target = document.elementFromPoint(point.x, point.y);
    return target?.closest('.react-flow__edge') === null;
  });
  expect(passesThrough).toBe(true);
});

test(
  'an Open Space Resource keeps its embedded Map aligned throughout a drag',
  { tag: '@parity:open-space-resource-drag-keeps-embedded-map-aligned' },
  async ({ page }) => {
    await open(page);
    await expectEmbeddedResourceToFollowDrag(
      page,
      spaceResource(page),
      embeddedNodes(page).first(),
      [page.locator('.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]')],
      {
        connector: page.locator(
          '.react-flow__edge:not([data-id^="00000000-0000-4000-8000-000000000005:"])',
        ),
        endpoint: 'target',
      },
    );
  },
);

/**
 * The two choices an Open Space Resource publishes, drawn as the Dock draws the same
 * two.
 *
 * Both halves matter and only one is about appearance. The treatment is compared
 * against the Dock **on screen in the same page**, property by property, so a
 * change to either that the other did not follow fails here rather than drawing
 * two panels that merely look alike. The other half is
 * that the controls are not the Dock's *operations*: pressing this Resource's Map
 * list must not move the canvas the Resource is standing on.
 */
test(
  "an Open Space Resource's choices are the Dock's surface and controls, acting on the Resource",
  { tag: '@parity:open-space-resource-chooses-its-context-on-the-shared-controls' },
  async ({ page }) => {
    await open(page);
    const resource = spaceResource(page);

    // What the Resource holds: the target Space's own Map and Graph, named.
    await expect(
      (await resourceControls(page, resource)).getByTestId('space-resource-map'),
    ).toHaveText('Collection 1');
    await expect(
      (await resourceControls(page, resource)).getByTestId('space-resource-graph'),
    ).toHaveText('Overview');

    const rail = (await resourceControls(page, resource)).getByTestId('canvas-resource-actions');
    await expect((await resourceControls(page, resource)).getByRole('toolbar')).toHaveCount(1);
    await expect(rail.getByTestId('space-resource-map')).toHaveCount(1);
    await expect(rail.getByTestId('space-resource-graph')).toHaveCount(1);
    await expect(
      resource.locator('.canvas-resource__body').getByRole('button', { name: /^(Map|Graph):/ }),
    ).toHaveCount(0);
    const mapControl = rail.getByTestId('space-resource-map');
    const actionsControl = rail.getByRole('button', { name: /^Actions for Resource/ });
    await actionsControl.focus();
    await actionsControl.press('ArrowRight');
    await expect(mapControl).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByTestId('space-resource-graph')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByRole('button', { name: /^Edit Resource/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByRole('button', { name: /^Close Resource/ })).toBeFocused();
    await expect(rail.getByRole('button', { name: /^Enter Space/ })).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(rail.locator(':focus')).toHaveCount(0);
    await mapControl.focus();

    const treatment = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          borderRadius: style.borderTopLeftRadius,
          borderColor: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          padding: style.paddingTop,
        };
      });
    expect(
      await treatment(
        (await resourceControls(page, resource)).getByTestId('canvas-resource-actions'),
      ),
    ).toEqual(await treatment(page.locator('.command-dock__surface:visible')));

    // The same list the Dock's own Map cluster discloses: radio rows, one
    // marked, reached from the control that names what is chosen.
    // `:visible`, because every open Space stays mounted with one shown
    // (`OpenSpacesApplication`), and the target Space is open here too.
    //
    // The row chosen is deliberately **not** the one already marked: pressing
    // the selected row and finding the Resource unchanged proves the list renders,
    // not that a choice is honoured. The target Space offers a second Map
    // whose content no other Map of it draws, so what is on screen
    // afterwards could only have come from the choice.
    const selectedMap = page.locator('[data-testid="selected-canvas"]:visible');
    const before = await selectedMap.innerText();
    await (await resourceControls(page, resource)).getByTestId('space-resource-map').click();
    const row = page.getByRole('menuitemradio', { name: 'Collection 2' });
    await expect(row).toBeVisible();
    await row.click();

    // The Resource's stored context is the chosen one, Graph included: choosing a
    // Map seeds the Graph from that Map's own Active Graph
    // (`canvas-resource-authoring.ts`), so both names move together.
    await expect(
      (await resourceControls(page, resource)).getByTestId('space-resource-map'),
    ).toHaveText('Collection 2');
    await expect(
      (await resourceControls(page, resource)).getByTestId('space-resource-graph'),
    ).toHaveText('Detail');

    // And the embedding redrew to the chosen Map: its own Resource, and none of
    // the Map that was selected a moment ago.
    await expect(embeddedNodes(page)).toHaveCount(1);
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Review' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Intake' })).toHaveCount(0);

    // And it acted on the Resource rather than on the Space the Resource sits in: the
    // containing Map is the one it was.
    await expect(selectedMap).toHaveText(before);
  },
);

test(
  'editing the embedded Resource updates its target Space',
  { tag: '@parity:embedded-map-resources-author-target' },
  async ({ page }) => {
    await open(page);
    await beginPortalEdit(page, spaceResource(page));
    const embedded = embeddedNodes(page).filter({
      has: page.getByRole('heading', { name: 'Intake', exact: true }),
    });
    await embedded.hover();
    // Edit offers the same hover handles as the host canvas. They author the
    // Graph this Space Resource is showing and refuse a cross-Space Edge (ADR 0040).
    await expect(embedded.locator('.rf-resource-node__authoring-handle')).toHaveCount(8);
    await expect(embedded.getByLabel(/^Connect (from|to) /)).toHaveCount(8);
    // Its commands are drawn in its own floating toolbar once it is selected (ADR 0102).
    await selectResource(embedded);
    await (
      await resourceToolbar(page, embedded)
    )
      .getByRole('button', { name: 'Edit Resource Intake' })
      .click();
    await embedded
      .getByRole('textbox', { name: 'Markdown source of Intake' })
      .fill('Edited in the embedded Map');
    await embedded
      .getByRole('textbox', { name: 'Markdown source of Intake' })
      .press('ControlOrMeta+Enter');
    await expect(embedded).toContainText('Edited in the embedded Map');
    // Crossing into the target Space to read the same edit there, through the
    // Command Dock's Open Spaces menu (ADR 0082) — and the assertion is on the
    // Space the Dock is now naming.
    await page.getByRole('button', { name: /^Spaces\. \d+ open\.$/ }).click({ delay: 120 });
    await page.getByRole('menuitemradio', { name: /^Architecture/ }).click();
    // `:visible`, because every open Space stays mounted and only one is shown
    // (`OpenSpacesApplication`). A role query already skips the hidden ones —
    // they are out of the accessibility tree — but a test id does not.
    await expect(page.locator('[data-testid="space-title"]:visible')).toContainText('Architecture');
    const intake = page
      .locator('.react-flow__node:visible')
      .filter({ has: page.getByRole('heading', { name: 'Intake', exact: true }) });
    await expect(intake).toContainText('Edited in the embedded Map');
  },
);

/**
 * Handles author the Graph the Space Resource is showing
 * and do not complete a cross-Space Edge on the containing canvas (ADR 0040).
 * Overview already has Intake→Storage; the reverse is a new Edge (cycles are
 * legal). The containing Graph also has Start here→Elsewhere, so the host
 * count is snapshotted rather than assumed empty.
 */
test('a connect between two embedded Resources authors the shown Graph, not the host Graph', async ({
  page,
}) => {
  await open(page);
  const parent = spaceResource(page);
  await beginPortalEdit(page, parent);
  const intake = embeddedNodes(page).filter({
    has: page.getByRole('heading', { name: 'Intake', exact: true }),
  });
  const storage = embeddedNodes(page).filter({
    has: page.getByRole('heading', { name: 'Storage', exact: true }),
  });
  const hostBefore = await hostGraphEdgeCount(page, parent);
  const shownBefore = await embeddedGraphEdgeCount(page, parent);
  const shownEdge = page.locator(
    '.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]',
  );
  const shownStroke = await shownEdge
    .locator('path')
    .first()
    .evaluate((el) => getComputedStyle(el).stroke);
  await storage.hover();
  await connectHandles(
    page,
    authoringHandle(storage, 'source', 'right'),
    authoringHandle(intake, 'target', 'left'),
    async () => {
      // The preview is drawn as the Graph the Edge joins — the shown Overview,
      // `diamond` in its own colour — not as the containing Graph 1.
      const preview = page.locator('.react-flow__connection-path');
      await expect(preview).toHaveCSS('stroke', shownStroke);
      const head = page.locator(
        'marker#graph-authoring-connection-head [data-slot="graph-head-shape"]',
      );
      await expect(head).toHaveAttribute('data-head-shape', 'diamond');
      await expect(head).toHaveCSS('fill', shownStroke);
    },
  );
  await expect.poll(() => hostGraphEdgeCount(page, parent)).toBe(hostBefore);
  await expect.poll(() => embeddedGraphEdgeCount(page, parent)).toBe(shownBefore + 1);
});

test('the embedded Map story is isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=surfaces--space-resource-embedded-map--selected-map');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.locator('.react-flow__node[data-id^="embedded:"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('.react-flow__node[data-id^="embedded:"]')).toHaveCount(0);
});

const TWO_SELECTIONS_STORY =
  '/?story=surfaces--space-resource-embedded-map--two-selections-of-one-target&mode=preview';

/**
 * One Space drawn twice, differently, because the selection lives on the Resource.
 *
 * Both Space Resources name one target, so what separates the two embeddings is
 * the Map each stores and nothing else (ADR 0068, ADR 0079). `Intake` is on
 * `Overview` alone and `Index` on `Detail` alone, which is what makes each
 * embedding's membership readable from outside; `Storage` is on both, so the
 * pair is convergence on one Space rather than two copies of it.
 *
 * Asserted per embedding rather than over the canvas as a whole: four embedded
 * nodes in total would also be satisfied by one Map drawn twice, which is
 * exactly the failure the stored selection exists to prevent.
 */
test(
  'two Space Resources on one target each draw the Map they store',
  { tag: '@parity:two-space-resources-draw-one-target-at-their-own-selections' },
  async ({ page }) => {
    await page.goto(TWO_SELECTIONS_STORY);
    await expect(embeddedNodes(page)).toHaveCount(4, { timeout: 20_000 });

    const overview = page.locator(
      '.react-flow__node[data-id^="embedded:00000000-0000-4000-8000-000000000023:"]',
    );
    const detail = page.locator(
      '.react-flow__node[data-id^="embedded:00000000-0000-4000-8000-000000000024:"]',
    );

    await expect(overview).toHaveCount(2);
    await expect(overview.getByRole('heading', { name: 'Intake' })).toBeVisible();
    await expect(overview.getByRole('heading', { name: 'Storage' })).toBeVisible();
    await expect(overview.getByRole('heading', { name: 'Index' })).toHaveCount(0);

    await expect(detail).toHaveCount(2);
    await expect(detail.getByRole('heading', { name: 'Storage' })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Index' })).toBeVisible();
    await expect(detail.getByRole('heading', { name: 'Intake' })).toHaveCount(0);
  },
);

test(
  'Space Resource context menus author the target with the Dock commands',
  { tag: '@parity:space-resource-context-menus-share-dock-actions' },
  async ({ page }) => {
    await open(page);
    await exerciseSpaceResourceContextMenus(page, spaceResource(page));
  },
);

test(
  'Space Resource entity menu groups commands and creates a Space Reference Resource',
  { tag: '@parity:space-resource-entity-menu' },
  async ({ page }) => {
    await open(page);
    await exerciseSpaceResourceEntityMenu(page, spaceResource(page));
  },
);

test(
  'Space Resource canvas has equal top and side padding',
  { tag: '@parity:space-resource-canvas-padding' },
  async ({ page }) => {
    await open(page);
    await exerciseSpaceResourcePadding(page, spaceResource(page), embeddedNodes(page).first());
  },
);

test(
  'Space Resource title footer follows its content',
  { tag: '@parity:space-resource-content-sized-footer' },
  async ({ page }) => {
    await open(page);
    const resource = spaceResource(page);
    await exerciseSpaceResourceFooter(page, resource, embeddedNodes(page).first());
  },
);

test(
  "a selected Resource's toolbar floats above its top-right corner, at the Dock's control size, above embedded content",
  { tag: '@parity:resource-toolbar-floats-above-its-corner' },
  async ({ page }) => {
    await open(page);
    // The story's canvas opens at 1:1 where the application's opens below it, and
    // the shared exercise measures from below 100% to past it, so the camera is
    // first zoomed out to where the application starts.
    const resource = spaceResource(page);
    const scale = () =>
      resource.evaluate((node) =>
        node instanceof HTMLElement ? node.getBoundingClientRect().width / node.offsetWidth : 1,
      );
    const zoomOut = page.getByRole('button', { name: 'Zoom out' });
    await expect
      .poll(
        async () => {
          await zoomOut.click();
          await page.waitForTimeout(400);
          return scale();
        },
        { timeout: 15_000 },
      )
      .toBeLessThan(0.9);
    await exerciseResourceToolbarFloats(page, resource);
  },
);

test(
  'Edit and Done toggle the portal using the same accessible names as the application',
  { tag: '@parity:space-resource-portal-read-edit' },
  async ({ page }) => {
    await open(page);
    const parent = spaceResource(page);
    const embedded = embeddedNodes(page).filter({
      has: page.getByRole('heading', { name: 'Intake', exact: true }),
    });
    const embeddedEdit = page.getByRole('button', { name: 'Edit Resource Intake' });
    await expect(embeddedEdit).toHaveCount(0);
    const outerBefore = await boxOf(parent, 'containing Resource');
    const innerBefore = await boxOf(embedded, 'embedded Resource');
    await page.mouse.move(
      innerBefore.x + innerBefore.width / 2,
      innerBefore.y + innerBefore.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      innerBefore.x + innerBefore.width / 2 + 70,
      innerBefore.y + innerBefore.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();
    const outerAfter = await boxOf(parent, 'moved containing Resource');
    expect(outerAfter.x).toBeGreaterThan(outerBefore.x + 30);
    const innerAfter = await boxOf(embedded, 'embedded Resource after outer drag');
    expect(innerAfter.x - outerAfter.x).toBeCloseTo(innerBefore.x - outerBefore.x, 0);

    const rail = (await resourceControls(page, parent)).getByTestId('canvas-resource-actions');
    await rail.getByRole('button', { name: 'Edit Resource Elsewhere' }).click();
    await expect(rail.getByRole('button', { name: 'Done Resource Elsewhere' })).toBeVisible();
    // Edit makes the embedded Resources authorable: selected, one draws its own
    // commands, while the portal Edit keeps Done drawn on the containing Resource.
    await selectResource(embedded);
    await expect(
      (await resourceToolbar(page, embedded)).getByRole('button', { name: 'Edit Resource Intake' }),
    ).toBeVisible();
    await expect(rail.getByRole('button', { name: 'Done Resource Elsewhere' })).toBeVisible();
    await rail.getByRole('button', { name: 'Done Resource Elsewhere' }).click();
    await expect(embeddedEdit).toHaveCount(0);
    await selectResource(parent);
    await expect(
      (await resourceToolbar(page, parent)).getByRole('button', {
        name: 'Edit Resource Elsewhere',
      }),
    ).toBeVisible();
  },
);

test(
  'portal zoom frames authored coordinates without stretching Resources or painting outside',
  { tag: '@parity:space-resource-portal-edit-is-the-host-canvas' },
  async ({ page }) => {
    await open(page);
    await exercisePortalEditHostCanvas(page, spaceResource(page), embeddedNodes(page).first());
  },
);

test(
  'two Space Resources frame the same target independently',
  { tag: '@parity:space-resource-portal-independent-framing' },
  async ({ page }) => {
    await page.goto(TWO_SELECTIONS_STORY);
    await expect(embeddedNodes(page)).toHaveCount(4, { timeout: 20_000 });
    const overview = page.locator(
      '.react-flow__node[data-id="00000000-0000-4000-8000-000000000023"]',
    );
    const detail = page.locator(
      '.react-flow__node[data-id="00000000-0000-4000-8000-000000000024"]',
    );
    const intake = page.locator(
      '.react-flow__node[data-id="embedded:00000000-0000-4000-8000-000000000023:00000000-0000-4000-8000-000000000035"]',
    );
    const index = page.locator(
      '.react-flow__node[data-id="embedded:00000000-0000-4000-8000-000000000024:00000000-0000-4000-8000-000000000037"]',
    );
    await beginPortalEdit(page, overview);
    const intakeBefore = await boxOf(intake, 'Intake');
    const outer = await boxOf(overview, 'overview Space Resource');
    await page.mouse.move(outer.x + 8, outer.y + outer.height / 2);
    await page.mouse.down();
    await page.mouse.move(outer.x + 8 + 80, outer.y + outer.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    const intakeAfter = await boxOf(intake, 'framed Intake');
    expect(intakeAfter.x).not.toBeCloseTo(intakeBefore.x, 0);
    const indexBefore = await boxOf(index, 'Index');
    await beginPortalEdit(page, detail);
    expect((await boxOf(index, 'Index while the other portal pans')).x).toBeCloseTo(
      indexBefore.x,
      0,
    );
  },
);

test(
  'Enter shows the target at browser size and Return restores the containing portal',
  { tag: '@parity:space-resource-portal-framing' },
  async ({ page }) => {
    await page.goto(
      '/?story=surfaces--space-resource-embedded-map--entered-from-space-resource&mode=preview',
    );
    await expect(page.locator('[data-testid="space-title"]:visible')).toContainText(
      'Architecture',
      {
        timeout: 20_000,
      },
    );
    await expect(page.getByRole('button', { name: 'Go to Home' })).toBeVisible();
    const enteredCanvas = page.locator('.react-flow:visible').first();
    const enteredPane = await enteredCanvas.boundingBox();
    if (enteredPane === null) throw new Error('entered canvas missing');
    await page.getByRole('button', { name: 'Go to Home' }).click();
    await expect(page.locator('[data-testid="space-title"]:visible')).toContainText('Home');
    await expect(embeddedNodes(page)).toHaveCount(2);
    const portal = await boxOf(spaceResource(page), 'containing Space Resource');
    expect(enteredPane.width).toBeGreaterThan(portal.width + 20);
  },
);

/**
 * An Open Space Resource's Graph list marks each row with the mark the canvas
 * HUD's key draws, in the colour and head shape the target draws that Graph's
 * Edges in — read off the embedded Edge on screen — and its Map list carries
 * no mark. The target's Overview stores `diamond`, so both draw it.
 */
test(
  "an Open Space Resource's Graph rows draw the Graph's legend mark",
  { tag: '@parity:open-space-resource-graph-rows-draw-the-graph-legend-mark' },
  async ({ page }) => {
    await open(page);
    const edge = page.locator(
      '.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]',
    );
    const edgeStroke = await edge
      .locator('path')
      .first()
      .evaluate((el) => getComputedStyle(el).stroke);
    const edgeHeadShape = await edge
      .locator('[data-slot="graph-head-shape"]')
      .first()
      .getAttribute('data-head-shape');
    expect(edgeHeadShape).toBe('diamond');

    // Opened from the keyboard, as `exerciseSpaceResourceContextMenus` opens
    // these lists: the rail can sit under the Dock at this viewport.
    const openList = async (kind: 'map' | 'graph') => {
      const trigger = (await resourceControls(page, spaceResource(page))).getByTestId(
        `space-resource-${kind}`,
      );
      await trigger.focus();
      await trigger.press('Enter');
    };
    await openList('graph');
    const row = page.getByRole('menuitemradio', { name: 'Overview' });
    await expect(row.locator('[data-slot="graph-legend-mark-line"]')).toHaveCSS(
      'stroke',
      edgeStroke,
    );
    await expect(row.locator('[data-slot="graph-legend-mark"]')).toHaveAttribute(
      'data-head-shape',
      edgeHeadShape ?? '',
    );
    await page.keyboard.press('Escape');

    await openList('map');
    await expect(page.getByRole('menuitemradio', { name: 'Collection 2' })).toBeVisible();
    await expect(page.getByRole('menu').locator('[data-slot="graph-legend-mark"]')).toHaveCount(0);
  },
);
