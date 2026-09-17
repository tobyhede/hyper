import { authoringHandle, connectHandles, thingControls, boxOf } from '../e2e/graph';
import {
  beginPortalEdit,
  embeddedGraphEdgeCount,
  exercisePortalEditHostCanvas,
  exerciseSpaceThingPadding,
  exerciseSpaceThingFooter,
  exerciseFloatingThingDock,
  hostGraphEdgeCount,
} from '../e2e/space-thing-frame';
import {
  exerciseSpaceThingContextMenus,
  exerciseSpaceThingEntityMenu,
} from '../e2e/space-thing-context-menu';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectEmbeddedThingToFollowDrag } from '../e2e/support/embedded-drag';

const STORY = '/?story=surfaces--space-thing-embedded-diagram--selected-diagram&mode=preview';

/** The containing Space Thing, by the Thing id the story Space declares for it. */
const spaceThing = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id="00000000-0000-4000-8000-000000000005"]');

/**
 * The Things the Space Thing draws, by the id shape the projection gives them.
 *
 * `embedded:<spaceThingId>:<targetThingId>` names a placement rather than a Thing,
 * because one target Space may be shown by two Space Things on one canvas — so
 * the prefix is the only stable thing about it from out here, and it is exactly
 * what says "this node belongs to another Space".
 */
const embeddedNodes = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id^="embedded:"]');

const open = async (page: Page): Promise<void> => {
  await page.goto(STORY);
  // The target Space is read asynchronously — it is a different Space, stored
  // beside this one — so the Thing draws before its Diagram can, and waiting on
  // the Thing alone would race the read this story is about.
  await expect(embeddedNodes(page)).toHaveCount(2, { timeout: 20_000 });
};

test(
  'an Open Space Thing draws the Diagram it selects inside its own rect',
  { tag: '@parity:open-space-thing-draws-its-selected-diagram' },
  async ({ page }) => {
    await open(page);

    // Titles from the other Space, which no Thing of the containing Space
    // carries — so a node drawing one could not have come from anywhere else.
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Intake' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Storage' })).toBeVisible();
    // The selected Graph is drawn with them: an embedded Diagram is the Things
    // *and* the one Graph the Thing selects across them.
    await expect(
      page.locator('.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]'),
    ).toHaveCount(1);

    // Inside the Space Thing's own box, which is what makes the Thing a window
    // onto another Space rather than a second row of Things beside it. React
    // Flow renders a sub-flow child as a sibling of its parent, so containment
    // is a fact about the measured boxes and never about the DOM tree.
    const outer = await spaceThing(page).boundingBox();
    if (outer === null) throw new Error('The Space Thing was not drawn');
    for (const node of await embeddedNodes(page).all()) {
      const inner = await node.boundingBox();
      if (inner === null) throw new Error('An embedded Thing was not drawn');
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  },
);

test(
  'an Open Space Thing keeps its embedded Diagram aligned throughout a drag',
  { tag: '@parity:open-space-thing-drag-keeps-embedded-diagram-aligned' },
  async ({ page }) => {
    await open(page);
    await expectEmbeddedThingToFollowDrag(
      page,
      spaceThing(page),
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
 * The two choices an Open Space Thing publishes, drawn as the Dock draws the same
 * two (`.scratch/command-dock/issues/12`).
 *
 * Both halves matter and only one is about appearance. The treatment is compared
 * against the Dock **on screen in the same page**, property by property, so a
 * change to either that the other did not follow fails here rather than drawing
 * two panels that merely looked alike when this was written. The other half is
 * that the controls are not the Dock's *operations*: pressing this Thing's Diagram
 * list must not move the canvas the Thing is standing on.
 */
test(
  "an Open Space Thing's choices are the Dock's surface and controls, acting on the Thing",
  { tag: '@parity:open-space-thing-chooses-its-context-on-the-shared-controls' },
  async ({ page }) => {
    await open(page);
    const thing = spaceThing(page);

    // What the Thing holds: the target Space's own Diagram and Graph, named.
    await expect((await thingControls(page, thing)).getByTestId('space-thing-diagram')).toHaveText(
      'Collection 1',
    );
    await expect((await thingControls(page, thing)).getByTestId('space-thing-graph')).toHaveText(
      'Overview',
    );

    const rail = (await thingControls(page, thing)).getByTestId('canvas-thing-actions');
    await expect((await thingControls(page, thing)).getByRole('toolbar')).toHaveCount(1);
    await expect(rail.getByTestId('space-thing-diagram')).toHaveCount(1);
    await expect(rail.getByTestId('space-thing-graph')).toHaveCount(1);
    await expect(
      thing.locator('.canvas-thing__body').getByRole('button', { name: /^(Diagram|Graph):/ }),
    ).toHaveCount(0);
    const diagramControl = rail.getByTestId('space-thing-diagram');
    await diagramControl.focus();
    await diagramControl.press('ArrowRight');
    await expect(rail.getByTestId('space-thing-graph')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByRole('button', { name: /^Actions for Thing/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByRole('button', { name: /^Edit Thing/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(rail.getByRole('button', { name: /^Close Thing/ })).toBeFocused();
    await expect(rail.getByRole('button', { name: /^Enter Space/ })).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(rail.locator(':focus')).toHaveCount(0);
    await diagramControl.focus();

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
      await treatment((await thingControls(page, thing)).getByTestId('canvas-thing-actions')),
    ).toEqual(await treatment(page.locator('.command-dock__surface:visible')));

    // The same list the Dock's own Diagram cluster discloses: radio rows, one
    // marked, reached from the control that names what is chosen.
    // `:visible`, because every open Space stays mounted with one shown
    // (`OpenSpacesApplication`), and the target Space is open here too.
    //
    // The row chosen is deliberately **not** the one already marked: pressing
    // the selected row and finding the Thing unchanged proves the list renders,
    // not that a choice is honoured. The target Space offers a second Diagram
    // whose content no other Diagram of it draws, so what is on screen
    // afterwards could only have come from the choice.
    const selectedDiagram = page.locator('[data-testid="selected-canvas"]:visible');
    const before = await selectedDiagram.innerText();
    await (await thingControls(page, thing)).getByTestId('space-thing-diagram').click();
    const row = page.getByRole('menuitemradio', { name: 'Collection 2' });
    await expect(row).toBeVisible();
    await row.click();

    // The Thing's stored context is the chosen one, Graph included: choosing a
    // Diagram seeds the Graph from that Diagram's own Active Graph
    // (`canvas-thing-authoring.ts`), so both names move together.
    await expect((await thingControls(page, thing)).getByTestId('space-thing-diagram')).toHaveText(
      'Collection 2',
    );
    await expect((await thingControls(page, thing)).getByTestId('space-thing-graph')).toHaveText(
      'Detail',
    );

    // And the embedding redrew to the chosen Diagram: its own Thing, and none of
    // the Diagram that was selected a moment ago.
    await expect(embeddedNodes(page)).toHaveCount(1);
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Review' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Intake' })).toHaveCount(0);

    // And it acted on the Thing rather than on the Space the Thing sits in: the
    // containing Diagram is the one it was.
    await expect(selectedDiagram).toHaveText(before);
  },
);

test(
  'editing the embedded Thing updates its target Space',
  { tag: '@parity:embedded-diagram-things-author-target' },
  async ({ page }) => {
    await open(page);
    await beginPortalEdit(page, spaceThing(page));
    const embedded = embeddedNodes(page).filter({
      has: page.getByRole('heading', { name: 'Intake', exact: true }),
    });
    await embedded.hover();
    // Edit offers the same hover handles as the host canvas. They author the
    // Graph this Space Thing is showing and refuse a cross-Space Edge (ADR 0040).
    await expect(embedded.locator('.rf-thing-node__authoring-handle')).toHaveCount(8);
    await expect(embedded.getByLabel(/^Connect (from|to) /)).toHaveCount(8);
    await embedded.getByRole('button', { name: 'Edit Thing Intake' }).click();
    await embedded
      .getByRole('textbox', { name: 'Markdown source of Intake' })
      .fill('Edited in the embedded Diagram');
    await embedded
      .getByRole('textbox', { name: 'Markdown source of Intake' })
      .press('ControlOrMeta+Enter');
    await expect(embedded).toContainText('Edited in the embedded Diagram');
    // Crossing into the target Space to read the same edit there. The vertical
    // tab strip that used to do this went with the Space Sidebar (ADR 0082), so
    // the move is the Command Dock's Open Spaces menu — and the assertion is on
    // the Space the Dock is now naming rather than on a panel beside it.
    await page.getByRole('button', { name: /^Spaces\. \d+ open\.$/ }).click({ delay: 120 });
    await page.getByRole('menuitemradio', { name: /^Architecture/ }).click();
    // `:visible`, because every open Space stays mounted and only one is shown
    // (`OpenSpacesApplication`). A role query already skips the hidden ones —
    // they are out of the accessibility tree — but a test id does not.
    await expect(page.locator('[data-testid="space-title"]:visible')).toContainText('Architecture');
    const intake = page
      .locator('.react-flow__node:visible')
      .filter({ has: page.getByRole('heading', { name: 'Intake', exact: true }) });
    await expect(intake).toContainText('Edited in the embedded Diagram');
  },
);

/**
 * Ticket 04 / spec.md: handles author the Graph the Space Thing is showing
 * and do not complete a cross-Space Edge on the containing canvas (ADR 0040).
 * Overview already has Intake→Storage; the reverse is a new Edge (cycles are
 * legal). The containing Graph also has Start here→Elsewhere, so the host
 * count is snapshotted rather than assumed empty.
 */
test('a connect between two embedded Things authors the shown Graph, not the host Graph', async ({
  page,
}) => {
  await open(page);
  const parent = spaceThing(page);
  await beginPortalEdit(page, parent);
  const intake = embeddedNodes(page).filter({
    has: page.getByRole('heading', { name: 'Intake', exact: true }),
  });
  const storage = embeddedNodes(page).filter({
    has: page.getByRole('heading', { name: 'Storage', exact: true }),
  });
  const hostBefore = await hostGraphEdgeCount(page, parent);
  const shownBefore = await embeddedGraphEdgeCount(page, parent);
  await storage.hover();
  await connectHandles(
    page,
    authoringHandle(storage, 'source', 'right'),
    authoringHandle(intake, 'target', 'left'),
  );
  await expect.poll(() => hostGraphEdgeCount(page, parent)).toBe(hostBefore);
  await expect.poll(() => embeddedGraphEdgeCount(page, parent)).toBe(shownBefore + 1);
});

test('the embedded Diagram story is isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=surfaces--space-thing-embedded-diagram--selected-diagram');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.locator('.react-flow__node[data-id^="embedded:"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('.react-flow__node[data-id^="embedded:"]')).toHaveCount(0);
});

const TWO_SELECTIONS_STORY =
  '/?story=surfaces--space-thing-embedded-diagram--two-selections-of-one-target&mode=preview';

/**
 * One Space drawn twice, differently, because the selection lives on the Thing.
 *
 * Both Space Things name one target, so what separates the two embeddings is
 * the Diagram each stores and nothing else (ADR 0068, ADR 0079). `Intake` is on
 * `Overview` alone and `Index` on `Detail` alone, which is what makes each
 * embedding's membership readable from outside; `Storage` is on both, so the
 * pair is convergence on one Space rather than two copies of it.
 *
 * Asserted per embedding rather than over the canvas as a whole: four embedded
 * nodes in total would also be satisfied by one Diagram drawn twice, which is
 * exactly the failure the stored selection exists to prevent.
 */
test(
  'two Space Things on one target each draw the Diagram they store',
  { tag: '@parity:two-space-things-draw-one-target-at-their-own-selections' },
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
  'Space Thing context menus author the target with the Dock commands',
  { tag: '@parity:space-thing-context-menus-share-dock-actions' },
  async ({ page }) => {
    await open(page);
    await exerciseSpaceThingContextMenus(page, spaceThing(page));
  },
);

test(
  'Space Thing entity menu groups commands and creates a Space Reference Thing',
  { tag: '@parity:space-thing-entity-menu' },
  async ({ page }) => {
    await open(page);
    await exerciseSpaceThingEntityMenu(page, spaceThing(page));
  },
);

test(
  'Space Thing canvas has equal top and side padding',
  { tag: '@parity:space-thing-canvas-padding' },
  async ({ page }) => {
    await open(page);
    await exerciseSpaceThingPadding(page, spaceThing(page), embeddedNodes(page).first());
  },
);

test(
  'Space Thing title footer follows its content',
  { tag: '@parity:space-thing-content-sized-footer' },
  async ({ page }) => {
    await open(page);
    const thing = spaceThing(page);
    await exerciseSpaceThingFooter(page, thing, embeddedNodes(page).first());
  },
);

test(
  'Thing dock floats eight pixels inside the border above embedded content',
  { tag: '@parity:thing-dock-floats' },
  async ({ page }) => {
    await open(page);
    const thing = spaceThing(page);
    await exerciseFloatingThingDock(page, thing);
  },
);

test(
  'Edit and Done toggle the portal using the same accessible names as the application',
  { tag: '@parity:space-thing-portal-read-edit' },
  async ({ page }) => {
    await open(page);
    const parent = spaceThing(page);
    const embedded = embeddedNodes(page).first();
    await expect(embedded.getByRole('button', { name: /Edit Thing/ })).toHaveCount(0);
    const outerBefore = await boxOf(parent, 'containing Thing');
    const innerBefore = await boxOf(embedded, 'embedded Thing');
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
    const outerAfter = await boxOf(parent, 'moved containing Thing');
    expect(outerAfter.x).toBeGreaterThan(outerBefore.x + 30);
    const innerAfter = await boxOf(embedded, 'embedded Thing after outer drag');
    expect(innerAfter.x - outerAfter.x).toBeCloseTo(innerBefore.x - outerBefore.x, 0);

    const rail = (await thingControls(page, parent)).getByTestId('canvas-thing-actions');
    await rail.getByRole('button', { name: 'Edit Thing Elsewhere' }).click();
    await expect(rail.getByRole('button', { name: 'Done Thing Elsewhere' })).toBeVisible();
    await expect(
      embeddedNodes(page).getByRole('button', { name: 'Edit Thing Intake' }),
    ).toBeVisible();
    await rail.getByRole('button', { name: 'Done Thing Elsewhere' }).click();
    await expect(rail.getByRole('button', { name: 'Edit Thing Elsewhere' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('button', { name: /Edit Thing/ })).toHaveCount(0);
  },
);

test(
  'portal zoom frames authored coordinates without stretching Things or painting outside',
  { tag: '@parity:space-thing-portal-edit-is-the-host-canvas' },
  async ({ page }) => {
    await open(page);
    await exercisePortalEditHostCanvas(page, spaceThing(page), embeddedNodes(page).first());
  },
);

test(
  'two Space Things frame the same target independently',
  { tag: '@parity:space-thing-portal-independent-framing' },
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
    const outer = await boxOf(overview, 'overview Space Thing');
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
  { tag: '@parity:space-thing-portal-framing' },
  async ({ page }) => {
    await page.goto(
      '/?story=surfaces--space-thing-embedded-diagram--entered-from-space-thing&mode=preview',
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
    const portal = await boxOf(spaceThing(page), 'containing Space Thing');
    expect(enteredPane.width).toBeGreaterThan(portal.width + 20);
  },
);
