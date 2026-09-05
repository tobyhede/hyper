import { expect, test, type Locator, type Page } from './fixtures';
import { boxOf, dragBy, nodeByTitle, selectCanvas, settled } from './graph';

/**
 * Authoring a Space Card through the application, over HTTP and a real
 * repository.
 *
 * Creating one is not an ordinary completed Edit: the create path brings a
 * second Space into existence and the reference path writes a Card naming one,
 * and both are one atomic Edit over coordinated per-Space sessions (ADR 0076).
 * So what these tests are really proving is that the coordinated Edit lands
 * through the same boundary every other Edit does — one revision on the
 * containing Space, no partial state on the canvas.
 */

/**
 * The whole creation gesture, from the menu to the Card on the canvas.
 *
 * The title is typed on the pane rather than into an inline editor afterwards,
 * which is the visible difference from Add Card and Add Alias: those two mint a
 * Card and hand the caret to it, and this one cannot, because the lifecycle
 * answers a completed Edit and not the identity it created.
 */
test(
  'adding a Space Card creates its Space and places the Card that references it',
  { tag: '@parity:new-space-card-completes-on-a-labelled-create' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    const nodes = await page.locator('.react-flow__node').count();

    await page.getByTestId('add-card-menu').click();
    await page.getByRole('menuitem', { name: 'Add Space Card' }).click();

    const pane = page.getByTestId('new-space-card');
    const create = pane.getByRole('button', { name: 'Create' });
    // The completion waits on the title, because the target never needs
    // choosing: a new Space is always available and is the default row.
    await expect(create).toBeDisabled();
    await expect(pane.getByRole('combobox', { name: 'Space' })).toHaveText('A new Space');

    await page.getByTestId('new-space-card-title').fill('Architecture');
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page.getByTestId('new-space-card')).toHaveCount(0);
    await settled(page);
    await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
    await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
    // The target Space's name, drawn on the Card beside the Card's own title —
    // they begin equal and are renamed independently from here.
    await expect(nodeByTitle(page, 'Architecture').getByTestId('space-marker')).toHaveText(
      'Architecture',
    );
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  },
);

/**
 * The second Space Card is offered the first's Space, and referencing it is not
 * a copy.
 *
 * Two Cards showing one Space is the convergence ADR 0074 permits, and it is
 * what makes the reference count — rather than a single owner — the thing that
 * decides when a Space is deleted.
 */
test('a second Space Card may reference the Space the first one created', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture');
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture again');
  await page.getByRole('combobox', { name: 'Space' }).click();
  await page.getByRole('option', { name: 'Architecture' }).click();
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();

  await expect(page.getByTestId('new-space-card')).toHaveCount(0);
  await settled(page);
  // Both Cards name the same Space, and only one Space was ever created — the
  // second Card is a second way to reach it rather than a second copy of it.
  await expect(nodeByTitle(page, 'Architecture again').getByTestId('space-marker')).toHaveText(
    'Architecture',
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

/**
 * Opening a Space Card exposes the target's context and the selections the Card
 * authors — and nothing that would change the Space it points at.
 *
 * A created target Space is complete (ADR 0080): the one Space initializer gives
 * it an authored default Layout and one empty Active Graph, so its selectors
 * offer that Layout and its Graph rather than opening onto nothing. The Card has
 * chosen neither yet — storing the target's default Layout and Graph on the Card
 * at creation is `layout-only-v1/04`.
 */
test('an Open Space Card shows its target and offers no way to change it', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture');
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  // Opened from the keyboard rather than from the Card's own control, because
  // the created Card is placed at the visible centre and the fixture already
  // has a Card there — a deliberate partial overlap (`freeAnchor` steps only on
  // an exact collision), which leaves the rail under another node's box. Enter
  // on the focused node is the same `opened-card` completion the control runs.
  const card = nodeByTitle(page, 'Architecture');
  await card.focus();
  await card.press('Enter');

  await expect(card.getByTestId('space-marker')).toHaveText('Architecture');
  // Enabled rather than merely present: a selector over a target with nothing
  // to choose is disabled, so this is what says the created Space arrived
  // complete rather than blank.
  const layoutSelector = card.getByTestId('space-card-layout');
  await expect(layoutSelector).toBeEnabled();
  await expect(layoutSelector).toHaveText('No Layout');
  await layoutSelector.click();
  await expect(page.getByRole('option', { name: 'Layout 1' })).toBeVisible();
  await page.getByRole('option', { name: 'Layout 1' }).click();
  await settled(page);
  await expect(layoutSelector).toHaveText('Layout 1');
  await expect(card.getByTestId('space-card-graph')).toHaveText('Graph 1');
  // The containing Card offers Close and its own title editing. The embedded
  // target Cards carry their own content-editing controls.
  await expect(card.getByRole('button', { name: 'Close Card Architecture' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Edit Card Architecture' })).toHaveCount(0);
});

/**
 * Deleting a Space Card says what it destroys before it is confirmed.
 *
 * V1 has no undo and the cascade can reach Spaces that are not on screen, so
 * the confirmation naming that is the thing standing in place of a refusal
 * (ADR 0074). Deleting the only reference takes its Space with it, which is
 * what leaves the Space count where it started.
 */
test('deleting the last Space Card deletes the Space it referenced', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture');
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  // No click selects it: a completed creation leaves the Card it made selected,
  // exactly as Add Card and Add Alias do, so Delete Card already names it.
  await page.getByRole('button', { name: 'Delete Card Architecture' }).click();
  await expect(
    page.getByText(
      'If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete Card', exact: true }).click();

  await settled(page);
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);

  // The Space went with it, so a second Space Card is offered no existing Space
  // to reference — which is the only way this surface can see the cascade.
  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByRole('combobox', { name: 'Space' }).click();
  await expect(page.getByRole('option', { name: 'Architecture' })).toHaveCount(0);
});

/* -------------------------------------------------------------------------- */
/* The Layout an Open Space Card draws                                        */
/* -------------------------------------------------------------------------- */

/**
 * The embedded Cards, by the id shape the projection gives them.
 *
 * `embedded:<spaceCardId>:<targetCardId>` is a placement id and not a Card id
 * on purpose — two Space Cards may show one target Space on one canvas — so the
 * prefix is the only stable thing about it from out here, and it is exactly
 * what says "this node belongs to another Space".
 */
const embeddedNodes = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id^="embedded:"]');

/**
 * Create a Space Card, Open it, and point it at its target's one Layout.
 *
 * Spelled out once rather than three times because every claim about what an
 * Open Space Card *shows* starts from the same place, and none of the steps is
 * the thing being proved: the creation gesture is
 * `adding a Space Card creates its Space...` above and the selectors are the
 * test before this one. The keyboard Open is that test's reasoning too — the
 * created Card lands at the visible centre, partly under a fixture Card, so its
 * rail is not reliably clickable until it is Open and drawn over its neighbour.
 */
async function openSpaceCardOnItsLayout(page: Page): Promise<Locator> {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture');
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  const card = nodeByTitle(page, 'Architecture');
  await card.focus();
  await card.press('Enter');

  const layoutSelector = card.getByTestId('space-card-layout');
  await expect(layoutSelector).toBeEnabled();
  await layoutSelector.click();
  await page.getByRole('option', { name: 'Layout 1' }).click();
  await expect(layoutSelector).toHaveText('Layout 1');
  await settled(page);
  return card;
}

/**
 * Selecting a Layout draws it: the target Space's own Cards arrive inside the
 * Space Card, in the containing canvas, as sub-flow children (ADR 0068).
 *
 * The unit and application tests hold the projection to the Card's selection;
 * what only a browser can say is that React Flow actually mounted the children
 * the projection asked for. `Card 1` is the Card the one Space initializer puts
 * in every new Space (ADR 0080), and no Card in the tracked fixture carries
 * that title — so a node drawing it is a node from the other Space and could
 * not have come from anywhere else.
 *
 * The count is asserted beside the title because an embedding that drew the
 * target twice, or drew it and left a stale copy behind, would still satisfy a
 * visibility check on one of them.
 */
test(
  'selecting a Layout draws the target Space inside the Open Space Card',
  { tag: '@parity:open-space-card-draws-its-selected-layout' },
  async ({ page }) => {
    const card = await openSpaceCardOnItsLayout(page);

    await expect(embeddedNodes(page)).toHaveCount(1);
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Card 1' })).toBeVisible();
    // Drawn *inside* the Space Card's own box, which is what makes it a view of
    // the Space rather than a second row of Cards beside it. React Flow renders a
    // child as a sibling of its parent, so containment is a fact about the boxes
    // and not about the DOM tree.
    const inner = await boxOf(embeddedNodes(page), 'the embedded Card');
    const outer = await boxOf(card, 'the Open Space Card');
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    const layout = await boxOf(card.getByTestId('space-card-layout'), 'Layout selector');
    const graph = await boxOf(card.getByTestId('space-card-graph'), 'Graph selector');
    expect(layout.y).toBeGreaterThan(inner.y + inner.height);
    expect(graph.y).toBeGreaterThanOrEqual(layout.y + layout.height);
    expect(graph.y + graph.height).toBeLessThan(outer.y + outer.height);
  },
);

test(
  'editing inside an Open Space Card saves the target and refuses cross-Space connections',
  { tag: '@parity:embedded-layout-cards-author-target' },
  async ({ page }) => {
    await openSpaceCardOnItsLayout(page);
    const embedded = embeddedNodes(page);
    await expect(embedded).toHaveCount(1);
    await embedded.hover();
    await expect(embedded.locator('.rf-card-node__authoring-handle')).toHaveCount(0);
    await embedded.getByRole('button', { name: 'Edit Card Card 1' }).click();
    const editor = embedded.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.fill('Written inside the Space Card');
    await embedded.getByRole('button', { name: 'Save Card Card 1' }).click();
    await expect(embedded).toContainText('Written inside the Space Card');
    await expect(page.getByRole('tab', { name: 'Architecture', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
    await expect(
      page.locator('.react-flow__node:visible').getByRole('heading', { name: 'Card 1' }),
    ).toBeVisible();
    await expect(page.locator('.react-flow__node:visible')).toContainText(
      'Written inside the Space Card',
    );
    await page.reload();
    await expect(page.locator('.react-flow__node:visible')).toContainText(
      'Written inside the Space Card',
    );
  },
);

/**
 * Closing the Space Card takes the view with it.
 *
 * The embedded Cards are nodes in the containing instance's own store, not
 * markup inside the Card, so nothing removes them by unmounting the Card's
 * body: the projection has to stop asking for them. A Closed Space Card that
 * left its children behind would leave another Space's Cards loose on this
 * canvas, drawn over whatever the Layout actually places there — so this is the
 * claim that the sub flow is owned by the Open state rather than merely started
 * by it.
 */
test('closing a Space Card removes the embedded Layout it was drawing', async ({ page }) => {
  const card = await openSpaceCardOnItsLayout(page);
  await expect(embeddedNodes(page)).toHaveCount(1);

  await card.hover();
  await card.getByRole('button', { name: 'Close Card Architecture' }).click();
  await settled(page);

  await expect(embeddedNodes(page)).toHaveCount(0);
  // The Space Card itself is untouched — Closing is a Layout Edit about this
  // Card's Open state and says nothing about the Space it references.
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await expect(nodeByTitle(page, 'Architecture').getByTestId('space-marker')).toHaveText(
    'Architecture',
  );
});

test('an embedded Card can move, open with the keyboard and resize in its target Layout', async ({
  page,
}) => {
  const parent = await openSpaceCardOnItsLayout(page);
  const embedded = embeddedNodes(page);
  await expect(embedded).toHaveCount(1);
  const before = await boxOf(embedded, 'embedded Card');
  const outerBefore = await boxOf(parent, 'containing Card');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height - 12);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 50, before.y + before.height - 12 + 20, {
    steps: 8,
  });
  await page.mouse.up();
  const moved = await boxOf(embedded, 'moved embedded Card');
  expect(moved.x).toBeGreaterThan(before.x + 30);
  await embedded.focus();
  await embedded.press('Enter');
  await expect(embedded.getByRole('button', { name: 'Close Card Card 1' })).toBeVisible();
  await embedded.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await embedded.hover();
  const control = embedded.locator('.react-flow__resize-control.handle.bottom.right');
  const resize = await boxOf(control, 'embedded resize control');
  const open = await boxOf(embedded, 'Open embedded Card');
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 25, resize.y + resize.height / 2 + 20, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await boxOf(embedded, 'resized embedded Card')).width)
    .toBeGreaterThan(open.width + 15);
  const outerAfter = await boxOf(parent, 'containing Card after target edits');
  expect(outerAfter.width).toBeCloseTo(outerBefore.width, 0);
  expect(outerAfter.height).toBeCloseTo(outerBefore.height, 0);
});

test('Exit leaves the embedded drawing and editing reopens its target session', async ({
  page,
}) => {
  await openSpaceCardOnItsLayout(page);
  await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
  await page.getByRole('button', { name: 'Exit Space', exact: true }).click();
  const embedded = embeddedNodes(page);
  await expect(embedded).toHaveCount(1);
  await expect(embedded.getByRole('button', { name: /Edit Card/ })).toHaveCount(0);
  await embedded.click();
  await embedded.hover();
  await expect(embedded.getByRole('button', { name: 'Edit Card Card 1' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Architecture', exact: true })).toBeVisible();
});

test('a Space Card resizes to Close and remembers its Open Size', async ({ page }) => {
  const parent = await openSpaceCardOnItsLayout(page);
  await parent.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  // Move the resize corner clear of the fixed Graph overview overlay.
  await dragBy(page, parent, -400, -150);
  await parent.hover();
  const open = await boxOf(parent, 'Open Space Card');
  const control = await boxOf(
    parent.locator('.react-flow__resize-control.handle.bottom.right'),
    'Space Card resize control',
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
  await expect(parent.getByRole('button', { name: 'Open Card Architecture' })).toBeVisible();
  await parent.focus();
  await parent.press('Enter');
  await expect(parent.getByRole('button', { name: 'Close Card Architecture' })).toBeVisible();
  await expect
    .poll(async () => (await boxOf(parent, 'reopened Space Card')).width)
    .toBeCloseTo(open.width, 0);
  await expect
    .poll(async () => (await boxOf(parent, 'reopened Space Card')).height)
    .toBeCloseTo(open.height, 0);
});
