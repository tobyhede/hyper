import { expect, test, type Locator, type Page } from './fixtures';
import {
  boxOf,
  createThing,
  dragBy,
  expectThingFillsNode,
  nodeByTitle,
  selectCanvas,
  settled,
} from './graph';

/**
 * Authoring a Space Thing through the application, over HTTP and a real
 * repository.
 *
 * Creating one is not an ordinary completed Edit: the create path brings a
 * second Space into existence and the reference path writes a Thing naming one,
 * and both are one atomic Edit over coordinated per-Space sessions (ADR 0076).
 * So what these tests are really proving is that the coordinated Edit lands
 * through the same boundary every other Edit does — one revision on the
 * containing Space, no partial state on the canvas.
 */

/**
 * Move to an open Space from the Command Dock's Open Spaces menu.
 *
 * The vertical tab strip this replaces is gone with the Space Sidebar (ADR
 * 0082): the open set is disclosed from the bar as the tree the crossings make,
 * and a row is a way *to* a Space rather than a tab beside it. `delay` is the
 * press a menu trigger needs — a zero-delay click puts mousedown and mouseup in
 * one tick and Base UI's dismissal never gets a turn between them.
 */
const switchToSpace = async (page: Page, title: string): Promise<void> => {
  await page.getByRole('button', { name: /^Spaces\. \d+ open\.$/ }).click({ delay: 120 });
  await page.getByRole('menuitemradio', { name: new RegExp(`^${title}`) }).click();
  await expect(showingSpace(page)).toContainText(title);
};

/**
 * The name of the Space on screen.
 *
 * `:visible`, because every open Space stays mounted and only one is shown
 * (`OpenSpacesApplication`). A role query already skips the hidden ones — they
 * are out of the accessibility tree — but a test id does not.
 */
const showingSpace = (page: Page): Locator => page.locator('[data-testid="space-title"]:visible');

/** Leave the Space you are in, which is the Space cluster's own command. */
const exitSpace = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /^Space: / }).click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Exit Space' }).click();
};

/**
 * The whole creation gesture, from the menu to the Thing on the canvas.
 *
 * The title is typed on the pane rather than into an inline editor afterwards,
 * which is the visible difference from Add Thing and Add Alias: those two mint a
 * Thing and hand the caret to it, and this one cannot, because the lifecycle
 * answers a completed Edit and not the identity it created.
 */
test(
  'adding a Space Thing creates its Space and places the Thing that references it',
  { tag: '@parity:new-space-thing-completes-on-a-labelled-create' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    const nodes = await page.locator('.react-flow__node').count();

    await createThing(page, 'Space Thing');

    const pane = page.getByTestId('new-space-thing');
    const create = pane.getByRole('button', { name: 'Create' });
    // The completion waits on the title, because the target never needs
    // choosing: a new Space is always available and is the default row.
    await expect(create).toBeDisabled();
    await expect(pane.getByRole('combobox', { name: 'Space' })).toHaveText('A new Space');

    await page.getByTestId('new-space-thing-title').fill('Architecture');
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page.getByTestId('new-space-thing')).toHaveCount(0);
    await settled(page);
    await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
    await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  },
);

/**
 * The second Space Thing is offered the first's Space, and referencing it is not
 * a copy.
 *
 * Two Things showing one Space is the convergence ADR 0074 permits, and it is
 * what makes the reference count — rather than a single owner — the thing that
 * decides when a Space is deleted.
 */
test('a second Space Thing may reference the Space the first one created', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createThing(page, 'Space Thing');
  await page.getByTestId('new-space-thing-title').fill('Architecture');
  await page.getByTestId('new-space-thing').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  await createThing(page, 'Space Thing');
  await page.getByTestId('new-space-thing-title').fill('Architecture again');
  await page.getByRole('combobox', { name: 'Space' }).click();
  await page.getByRole('option', { name: 'Architecture' }).click();
  await page.getByTestId('new-space-thing').getByRole('button', { name: 'Create' }).click();

  await expect(page.getByTestId('new-space-thing')).toHaveCount(0);
  await settled(page);
  // The second Thing was authored against the Space the first one created — the
  // pane offered it as a choice — so this is a second way to reach that Space
  // rather than a second copy of it.
  await expect(nodeByTitle(page, 'Architecture again')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

/**
 * Opening a Space Thing exposes the selections the Thing authors over its
 * target's context — and nothing that would change the Space it points at.
 *
 * A created target Space is complete (ADR 0080): the one Space initializer gives
 * it an authored default Diagram and one empty Active Graph, so its selectors
 * offer that Diagram and its Graph rather than opening onto nothing. The Thing has
 * chosen neither yet — storing the target's default Diagram and Graph on the Thing
 * at creation is `layout-only-v1/04`.
 */
test(
  'an Open Space Thing offers its target’s selections and no way to change it',
  {
    tag: '@parity:open-space-thing-chooses-its-context-on-the-shared-controls',
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    await createThing(page, 'Space Thing');
    await page.getByTestId('new-space-thing-title').fill('Architecture');
    await page.getByTestId('new-space-thing').getByRole('button', { name: 'Create' }).click();
    await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
    await settled(page);

    // Opened from the keyboard rather than from the Thing's own control, because
    // the created Thing is placed at the visible centre and the fixture already
    // has a Thing there — a deliberate partial overlap (`freeAnchor` steps only on
    // an exact collision), which leaves the rail under another node's box. Enter
    // on the focused node is the same `opened-thing` completion the control runs.
    const thing = nodeByTitle(page, 'Architecture');
    await thing.focus();
    await thing.press('Enter');

    // Enabled rather than merely present: a selector over a target with nothing
    // to choose is disabled, so this is what says the created Space arrived
    // complete rather than blank.
    const diagramSelector = thing.getByTestId('space-thing-diagram');
    await expect(diagramSelector).toBeEnabled();
    await expect(diagramSelector).toHaveText('No Diagram');
    // The shared `ChoiceMenu` the Command Dock's own Diagram list is: a menu of
    // radio rows behind the control that names what is chosen.
    await diagramSelector.click();
    await expect(page.getByRole('menuitemradio', { name: 'Diagram 1' })).toBeVisible();
    await page.getByRole('menuitemradio', { name: 'Diagram 1' }).click();
    await settled(page);
    await expect(diagramSelector).toHaveText('Diagram 1');
    await expect(thing.getByTestId('space-thing-graph')).toHaveText('Graph 1');

    // **The Dock's surface and controls, and not the Dock's operations**
    // (`.scratch/command-dock/issues/12`). The panel the two choices sit on is
    // compared against the Dock that is on screen beside it, property by property,
    // so a change to one that the other did not follow fails here; and the list
    // that was just used wrote the Thing's own context without moving the canvas
    // the Thing is standing on.
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
    expect(await treatment(thing.locator('[data-slot="command-surface"]'))).toEqual(
      await treatment(page.locator('.command-dock__surface:visible')),
    );
    // `:visible`, because creating the target Space opened it too and every open
    // Space stays mounted with one shown (`OpenSpacesApplication`).
    await expect(page.locator('[data-testid="selected-canvas"]:visible')).toContainText(
      'Collection 1',
    );

    // The containing Thing offers Close and its own title editing. The embedded
    // target Things carry their own content-editing controls.
    await expect(thing.getByRole('button', { name: 'Close Thing Architecture' })).toBeVisible();
    await expect(thing.getByRole('button', { name: 'Edit Thing Architecture' })).toHaveCount(0);
  },
);

/**
 * Deleting a Space Thing says what it destroys before it is confirmed.
 *
 * V1 has no undo and the cascade can reach Spaces that are not on screen, so
 * the confirmation naming that is the thing standing in place of a refusal
 * (ADR 0074). Deleting the only reference takes its Space with it, which is
 * what leaves the Space count where it started.
 */
test('deleting the last Space Thing deletes the Space it referenced', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await createThing(page, 'Space Thing');
  await page.getByTestId('new-space-thing-title').fill('Architecture');
  await page.getByTestId('new-space-thing').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  // Deleting a Thing is the Thing's own rail (ADR 0073), reached by hovering it —
  // the Space's command surface draws no Thing commands at all (ADR 0082).
  const created = nodeByTitle(page, 'Architecture');
  await created.hover();
  await created
    .getByRole('button', { name: 'Actions for Thing Architecture', exact: true })
    .click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Delete Thing' }).click();
  await expect(
    page.getByText(
      'If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete Thing', exact: true }).click();

  await settled(page);
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);

  // The Space went with it, so a second Space Thing is offered no existing Space
  // to reference — which is the only way this surface can see the cascade.
  await createThing(page, 'Space Thing');
  await page.getByRole('combobox', { name: 'Space' }).click();
  await expect(page.getByRole('option', { name: 'Architecture' })).toHaveCount(0);
});

/* -------------------------------------------------------------------------- */
/* The Diagram an Open Space Thing draws                                        */
/* -------------------------------------------------------------------------- */

/**
 * The embedded Things, by the id shape the projection gives them.
 *
 * `embedded:<spaceThingId>:<targetThingId>` is a placement id and not a Thing id
 * on purpose — two Space Things may show one target Space on one canvas — so the
 * prefix is the only stable thing about it from out here, and it is exactly
 * what says "this node belongs to another Space".
 */
const embeddedNodes = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id^="embedded:"]');

/**
 * Create a Space Thing, Open it, and point it at its target's one Diagram.
 *
 * Spelled out once rather than three times because every claim about what an
 * Open Space Thing *shows* starts from the same place, and none of the steps is
 * the thing being proved: the creation gesture is
 * `adding a Space Thing creates its Space...` above and the selectors are the
 * test before this one. The keyboard Open is that test's reasoning too — the
 * created Thing lands at the visible centre, partly under a fixture Thing, so its
 * rail is not reliably clickable until it is Open and drawn over its neighbour.
 */
async function openSpaceThingOnItsDiagram(page: Page): Promise<Locator> {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createThing(page, 'Space Thing');
  await page.getByTestId('new-space-thing-title').fill('Architecture');
  await page.getByTestId('new-space-thing').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  const thing = nodeByTitle(page, 'Architecture');
  await thing.focus();
  await thing.press('Enter');

  const diagramSelector = thing.getByTestId('space-thing-diagram');
  await expect(diagramSelector).toBeEnabled();
  await diagramSelector.click();
  await page.getByRole('menuitemradio', { name: 'Diagram 1' }).click();
  await expect(diagramSelector).toHaveText('Diagram 1');
  await settled(page);
  return thing;
}

/**
 * Selecting a Diagram draws it: the target Space's own Things arrive inside the
 * Space Thing, in the containing canvas, as sub-flow children (ADR 0068).
 *
 * The unit and application tests hold the projection to the Thing's selection;
 * what only a browser can say is that React Flow actually mounted the children
 * the projection asked for. `Thing 1` is the Thing the one Space initializer puts
 * in every new Space (ADR 0080), and no Thing in the tracked fixture carries
 * that title — so a node drawing it is a node from the other Space and could
 * not have come from anywhere else.
 *
 * The count is asserted beside the title because an embedding that drew the
 * target twice, or drew it and left a stale copy behind, would still satisfy a
 * visibility check on one of them.
 */
test(
  'selecting a Diagram draws the target Space inside the Open Space Thing',
  { tag: '@parity:open-space-thing-draws-its-selected-diagram' },
  async ({ page }) => {
    const thing = await openSpaceThingOnItsDiagram(page);

    await expect(embeddedNodes(page)).toHaveCount(1);
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Thing 1' })).toBeVisible();
    // Drawn *inside* the Space Thing's own box, which is what makes it a view of
    // the Space rather than a second row of Things beside it. React Flow renders a
    // child as a sibling of its parent, so containment is a fact about the boxes
    // and not about the DOM tree.
    const inner = await boxOf(embeddedNodes(page), 'the embedded Thing');
    const outer = await boxOf(thing, 'the Open Space Thing');
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    const diagram = await boxOf(thing.getByTestId('space-thing-diagram'), 'Diagram selector');
    const graph = await boxOf(thing.getByTestId('space-thing-graph'), 'Graph selector');
    // **Below where the embedding begins, not below every embedded box.** An
    // embedded Thing that runs past the region is *clipped* rather than
    // shortened (`embedded-diagram.ts`), so its layout box is the clip's input
    // and says nothing about what is drawn — comparing against it held only at
    // the zoom the old chrome happened to produce.
    expect(diagram.y).toBeGreaterThan(inner.y);
    expect(graph.y).toBeGreaterThanOrEqual(diagram.y + diagram.height);
    expect(graph.y + graph.height).toBeLessThan(outer.y + outer.height);
  },
);

test(
  'editing inside an Open Space Thing saves the target and refuses cross-Space connections',
  { tag: '@parity:embedded-diagram-things-author-target' },
  async ({ page }) => {
    await openSpaceThingOnItsDiagram(page);
    const embedded = embeddedNodes(page);
    await expect(embedded).toHaveCount(1);
    await embedded.hover();
    await expect(embedded.locator('.rf-thing-node__authoring-handle')).toHaveCount(0);
    await embedded.getByRole('button', { name: 'Edit Thing Thing 1' }).click();
    const editor = embedded.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.fill('Written inside the Space Thing');
    await embedded.getByRole('button', { name: 'Save Thing Thing 1' }).click();
    await expect(embedded).toContainText('Written inside the Space Thing');
    await switchToSpace(page, 'Architecture');
    await expect(
      page.locator('.react-flow__node:visible').getByRole('heading', { name: 'Thing 1' }),
    ).toBeVisible();
    await expect(page.locator('.react-flow__node:visible')).toContainText(
      'Written inside the Space Thing',
    );
    await page.reload();
    await expect(page.locator('.react-flow__node:visible')).toContainText(
      'Written inside the Space Thing',
    );
  },
);

/**
 * Closing the Space Thing takes the view with it.
 *
 * The embedded Things are nodes in the containing instance's own store, not
 * markup inside the Thing, so nothing removes them by unmounting the Thing's
 * body: the projection has to stop asking for them. A Closed Space Thing that
 * left its children behind would leave another Space's Things loose on this
 * canvas, drawn over whatever the Diagram actually places there — so this is the
 * claim that the sub flow is owned by the Open state rather than merely started
 * by it.
 */
test('closing a Space Thing removes the embedded Diagram it was drawing', async ({ page }) => {
  const thing = await openSpaceThingOnItsDiagram(page);
  await expect(embeddedNodes(page)).toHaveCount(1);

  await thing.hover();
  await thing.getByRole('button', { name: 'Close Thing Architecture' }).click();
  await settled(page);

  await expect(embeddedNodes(page)).toHaveCount(0);
  // The Space Thing itself is untouched — Closing is a Diagram Edit about this
  // Thing's Open state and says nothing about the Space it references.
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
});

test('an embedded Thing can move, open with the keyboard and resize in its target Diagram', async ({
  page,
}) => {
  const parent = await openSpaceThingOnItsDiagram(page);
  const embedded = embeddedNodes(page);
  await expect(embedded).toHaveCount(1);
  await expectThingFillsNode(parent);
  await expectThingFillsNode(embedded);
  const before = await boxOf(embedded, 'embedded Thing');
  const outerBefore = await boxOf(parent, 'containing Thing');
  const parentFace = parent.locator('.canvas-thing').first();
  const parentFaceBefore = await boxOf(parentFace, 'containing Thing face');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height - 12);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 50, before.y + before.height - 12 + 20, {
    steps: 8,
  });
  await page.mouse.up();
  const moved = await boxOf(embedded, 'moved embedded Thing');
  expect(moved.x).toBeGreaterThan(before.x + 30);
  await embedded.focus();
  await embedded.press('Enter');
  await expect(embedded.getByRole('button', { name: 'Close Thing Thing 1' })).toBeVisible();
  await embedded.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await expectThingFillsNode(embedded);
  await expectThingFillsNode(parent);
  await embedded.hover();
  const control = embedded.locator('.react-flow__resize-control.handle.bottom.right');
  const resize = await boxOf(control, 'embedded resize control');
  const open = await boxOf(embedded, 'Open embedded Thing');
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 25, resize.y + resize.height / 2 + 20, {
    steps: 8,
  });
  await expectThingFillsNode(embedded);
  await expectThingFillsNode(parent);
  expect(await boxOf(parentFace, 'containing Thing face during resize')).toEqual(parentFaceBefore);
  await page.mouse.up();
  await expect
    .poll(async () => (await boxOf(embedded, 'resized embedded Thing')).width)
    .toBeGreaterThan(open.width + 15);
  await expectThingFillsNode(embedded);
  await expectThingFillsNode(parent);
  expect(await boxOf(parentFace, 'containing Thing face after target edits')).toEqual(
    parentFaceBefore,
  );
  const outerAfter = await boxOf(parent, 'containing Thing after target edits');
  expect(outerAfter.width).toBeCloseTo(outerBefore.width, 0);
  expect(outerAfter.height).toBeCloseTo(outerBefore.height, 0);
});

/**
 * Entering a Space names the one it was entered from, and Exit undoes it.
 *
 * **The bar names one step up rather than a whole path**, which is the
 * arrangement's answer to width rather than an omission: the step a reader
 * reaches for is the one above them, and everything further up is behind the
 * Open Spaces disclosure. `ParentIcon` is the mark that says the named Space is
 * *above* this one rather than beside it — the cube ticket `06` moved into
 * `@project/ui` so the decision would live somewhere other than a story sheet,
 * and this is the consumer that gives it a check.
 */
test(
  'entering a Space names the Space it was entered from, and Exit returns',
  { tag: '@parity:command-dock-marks-the-space-one-crossing-up' },
  async ({ page }) => {
    await openSpaceThingOnItsDiagram(page);

    // Two Spaces open and neither entered, so the bar carries the Open Spaces
    // menu and no parent step: there is nothing above `Diagram fixture`.
    await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);
    await switchToSpace(page, 'Architecture');

    // Entered, so the crossing is named — and named as the Space, with the
    // parent glyph carrying the relation rather than a word.
    const parent = page.getByRole('button', { name: 'Go to Diagram fixture' });
    await expect(parent).toBeVisible();
    // The mark contributes nothing to the name: the cube is `aria-hidden`, so
    // the control is named for the Space alone and the glyph carries the
    // relation to it.
    await expect(parent).toHaveAccessibleName('Go to Diagram fixture');
    await expect(parent).toContainText('Diagram fixture');
    await expect(parent.locator('svg[data-icon="parent"][aria-hidden="true"]')).toBeVisible();

    await exitSpace(page);

    await expect(showingSpace(page)).toContainText('Diagram fixture');
    await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);
    const embedded = embeddedNodes(page);
    await expect(embedded).toHaveCount(1);
    await expect(embedded.getByRole('button', { name: /Edit Thing/ })).toHaveCount(0);
    await embedded.click();
    await embedded.hover();
    await expect(embedded.getByRole('button', { name: 'Edit Thing Thing 1' })).toBeVisible();
  },
);

test('a Space Thing resizes to Close and remembers its Open Size', async ({ page }) => {
  const parent = await openSpaceThingOnItsDiagram(page);
  await parent.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  // Move the resize corner clear of the fixed Graph overview overlay.
  await dragBy(page, parent, -400, -150);
  await parent.hover();
  const open = await boxOf(parent, 'Open Space Thing');
  const control = await boxOf(
    parent.locator('.react-flow__resize-control.handle.bottom.right'),
    'Space Thing resize control',
  );
  const zoom = open.width / 960;
  await page.mouse.move(control.x + control.width / 2, control.y + control.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    control.x + control.width / 2 - (960 - 260) * zoom,
    control.y + control.height / 2 - (720 - 146) * zoom,
    { steps: 20 },
  );
  await page.mouse.up();
  await expect(parent.getByRole('button', { name: 'Open Thing Architecture' })).toBeVisible();
  await parent.focus();
  await parent.press('Enter');
  await expect(parent.getByRole('button', { name: 'Close Thing Architecture' })).toBeVisible();
  await expect
    .poll(async () => (await boxOf(parent, 'reopened Space Thing')).width)
    .toBeCloseTo(open.width, 0);
  await expect
    .poll(async () => (await boxOf(parent, 'reopened Space Thing')).height)
    .toBeCloseTo(open.height, 0);
});

test(
  'the Dock names another open Space whose commit failed',
  {
    tag: '@parity:command-dock-names-an-unwell-open-space',
  },
  async ({ page }) => {
    await openSpaceThingOnItsDiagram(page);
    await switchToSpace(page, 'Architecture');
    await settled(page);
    // Only the next Edit is failed, while Architecture is the working Space.
    await page.route('**/api/spaces', async (route) => {
      if (route.request().method() === 'POST') return route.abort('failed');
      return route.continue();
    });
    const thing = nodeByTitle(page, 'Thing 1');
    await thing.focus();
    await thing.press('Enter');
    await expect(page.getByTestId('persistence-failure')).toBeVisible();
    await page.getByRole('button', { name: 'Go to Diagram fixture', exact: true }).click();
    const trigger = page.getByRole('button', { name: 'Spaces. 2 open, 1 needs attention.' });
    await expect(trigger.locator('[data-unwell]')).toBeVisible();
    await trigger.click({ delay: 120 });
    const unwell = page.getByRole('menuitemradio', { name: /^Architecture/ });
    await expect(unwell).toContainText('Save failed');
    await expect(page.getByRole('menu').getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await unwell.click();
    await expect(page.getByTestId('persistence-failure')).toBeVisible();
    await page.unroute('**/api/spaces');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('persistence-failure')).toBeHidden();
  },
);
