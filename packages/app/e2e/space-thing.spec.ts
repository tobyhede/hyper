import { encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test, type Locator, type Page } from './fixtures';
import {
  boxOf,
  createThing,
  dragBy,
  expectThingFillsNode,
  FIXTURE_ORDINARY_SPACE_COUNT,
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
 * Create a Space Thing and give it a name — one press, then the inline editor.
 *
 * ADR 0089 retired the pane that collected a Title before the Edit ran: the
 * press mints the Space and the Thing that names it from one `Space N` and
 * continues in the Thing's own Title editor, so naming it anything else is an
 * ordinary rename afterwards. **Which means the Space keeps `Space N`** — a
 * Thing's Title and the title of the Space it references agree only at creation
 * (`CONTEXT.md`), and a rename here is what makes that divergence visible.
 */
const createSpaceThingNamed = async (page: Page, title: string): Promise<void> => {
  await createThing(page, 'Space Thing');
  const editor = page.getByRole('textbox', { name: 'Thing title' });
  await expect(editor).toBeFocused();
  await editor.fill(title);
  await editor.press('Enter');
  await expect(nodeByTitle(page, title)).toHaveCount(1);
};

/**
 * Reference a Space that already exists, from the Things list's add-Space row.
 *
 * The other half of what the pane did, and a different act (ADR 0089): this one
 * points at a Space rather than making one, so the Thing it authors is named
 * after the Space it found.
 */
const addExistingSpace = async (page: Page, title: string): Promise<void> => {
  await page.getByRole('button', { name: 'Things' }).click();
  const list = page.getByRole('dialog', { name: 'Things' });
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: `Add ${title} to Diagram` }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);
};

/**
 * The whole creation gesture, which is now one press (ADR 0089).
 *
 * **Optimistic, and this is where that is visible.** The Thing is placed and its
 * Title editor takes the caret while the two-snapshot lifecycle is still
 * committing, so the editor is asserted before `settled` rather than after it —
 * exactly as Create Markdown Thing behaves, which is the point of the change.
 * The `Space N` the editor is seeded with is the one string handed to both the
 * Space and the Thing, so the two agree at creation.
 */
test('creating a Space Thing mints its Space and places the Thing that names it', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await createThing(page, 'Space Thing');

  const editor = page.getByRole('textbox', { name: 'Thing title' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Space 1');
  await editor.press('Escape');

  await settled(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
  await expect(nodeByTitle(page, 'Space 1')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * The Things list offers the Meta Space's Spaces beside this Space's Things.
 *
 * The distinction the filter's two Space glyphs exist to draw (ADR 0074): the
 * frame is a Space **Thing**, one authored view placed in a Diagram, and the cube
 * is the Space itself, offered whether or not this Space has ever pointed at
 * it. Creating a Space Thing brings its Space into the Meta Space, so the same
 * Edit that puts a frame on the canvas is what puts a cube in the list.
 */
test(
  'the Things list offers a newly created Space as a Space of the Meta Space',
  { tag: '@parity:things-popover-offers-the-meta-spaces-beside-the-things' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await createSpaceThingNamed(page, 'Architecture');

    await page.getByRole('button', { name: 'Things' }).click();
    const list = page.getByRole('dialog', { name: 'Things' });
    await expect(list).toBeVisible();

    // The Space is offered although the Thing that references it is already on
    // this Diagram — they are two different things to place, which is why the
    // filter draws them as two toggles rather than one.
    // `Space 1`, not `Architecture`: the rename above was the Thing's, and a
    // Thing's Title and the title of the Space it references agree only at
    // creation (`CONTEXT.md`). This row names the Space.
    const row = list.getByRole('button', { name: 'Add Space 1 to Diagram' });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-space-id', /.+/);

    // And pressing its toggle off takes it away, leaving this Space's Things.
    await page.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }).click();
    await expect(list.getByRole('button', { name: 'Add Space 1 to Diagram' })).toHaveCount(0);
  },
);

/**
 * Destroying a Space takes it out of the list that offers it.
 *
 * The Spaces source is read once and re-read on an epoch, and creating a Space
 * Thing is not the only Edit that changes the set: deleting the last Space Thing
 * that references a Space destroys that Space and every Space below it that
 * nothing else references (ADR 0074, ADR 0076). A list still offering it would
 * spend `link` against a Space that is gone, on a row the reader had no way to
 * know was stale.
 */
test('stops offering a Space the moment the last Space Thing referencing it is deleted', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  await createSpaceThingNamed(page, 'Architecture');

  const openList = async () => {
    await page.getByRole('button', { name: 'Things' }).click();
    const list = page.getByRole('dialog', { name: 'Things' });
    await expect(list).toBeVisible();
    return list;
  };

  const offered = await openList();
  await expect(offered.getByRole('button', { name: 'Add Space 1 to Diagram' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);

  const thing = nodeByTitle(page, 'Architecture').first();
  await thing.click();
  await thing.hover();
  await thing.getByRole('button', { name: 'Actions for Thing Architecture' }).click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Delete Thing' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete Thing' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(0);

  // The Space went with its last reference, so the cube goes with it — and the
  // count on the toggle agrees, which is the claim the count exists to make.
  // The fixture already holds ordinary Spaces; deleting Architecture lands
  // back on those, not on an empty Meta Space.
  const after = await openList();
  await expect(after.getByRole('button', { name: 'Add Space 1 to Diagram' })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: `Spaces in this Meta Space, ${String(FIXTURE_ORDINARY_SPACE_COUNT)}`,
    }),
  ).toBeVisible();
});

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

  await createSpaceThingNamed(page, 'Architecture');
  await settled(page);

  // The Space itself is still `Space 1` — the rename above was the Thing's — so
  // that is the row the list offers, and the Thing this authors is named after
  // the Space it found.
  await addExistingSpace(page, 'Space 1');

  await settled(page);
  // The second Thing was authored against the Space the first one created — the
  // Things list offered it as a row — so this is a second way to reach that
  // Space rather than a second copy of it.
  await expect(nodeByTitle(page, 'Space 1')).toHaveCount(1);
  // Three Edits, not two: the creation completes on activation and the Title is
  // typed into the Thing afterwards (ADR 0089), so `createSpaceThingNamed` spends
  // a creation *and* a rename where the retired pane collected the Title first
  // and spent one. The third is this Thing, authored against the Space that
  // creation made.
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');

  // Referencing an existing Space selects in it too (ADR 0079). The first Thing
  // stored what its target initializer minted; this one had to read the same
  // pair back off a Space that already had it, which is the other half of the
  // rule and the half a created target cannot exercise.
  const again = nodeByTitle(page, 'Space 1');
  await again.focus();
  await again.press('Enter');
  await expect(again.getByTestId('space-thing-diagram')).toHaveText('Diagram 1');
  await expect(again.getByTestId('space-thing-graph')).toHaveText('Graph 1');
});

/**
 * Opening a Space Thing shows the selections it already carries — and nothing
 * that would change the Space it points at.
 *
 * A created target Space is complete (ADR 0080): the one Space initializer gives
 * it an authored default Diagram and one empty Active Graph. The Thing stores
 * that pair from the moment it exists (ADR 0079), so what an author opens onto
 * is a Diagram and a Graph already named rather than two empty selectors, and
 * the selectors are there to *change* the choice rather than to make it.
 *
 * Read before either is clicked, which is what distinguishes a stored selection
 * from one this test made: a selector that had to be opened to show `Diagram 1`
 * would prove only that the target offers it.
 */
test(
  'an Open Space Thing shows the selections it was created with',
  {
    tag: '@parity:open-space-thing-chooses-its-context-on-the-shared-controls',
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    await createSpaceThingNamed(page, 'Architecture');
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
    await expect(diagramSelector).toHaveText('Diagram 1');
    await expect(thing.getByTestId('space-thing-graph')).toHaveText('Graph 1');
    // And the Diagram it names is the one it draws, which is what says the
    // stored pair reached the canvas rather than only the two controls.
    await expect(page.locator('.react-flow__node[data-id^="embedded:"]')).toHaveCount(1);

    // **The Dock's surface and controls, and not the Dock's operations**
    // (`.scratch/command-dock/issues/12`). The panel the two choices sit on is
    // compared against the Dock that is on screen beside it, property by property,
    // so a change to one that the other did not follow fails here; and the Thing
    // drawing its own stored context left the canvas the Thing stands on where
    // it was.
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

  await createSpaceThingNamed(page, 'Architecture');
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

  // The Space went with it, so the Things list no longer offers Space 1 —
  // which is the only way this surface can see the cascade. The fixture's
  // ordinary Spaces remain; the count lands back where this Space started.
  await page.getByRole('button', { name: 'Things' }).click();
  const list = page.getByRole('dialog', { name: 'Things' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button', { name: 'Add Space 1 to Diagram' })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: `Spaces in this Meta Space, ${String(FIXTURE_ORDINARY_SPACE_COUNT)}`,
    }),
  ).toBeVisible();
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
 * Create a Space Thing and Open it on the Diagram it already selects.
 *
 * Spelled out once rather than three times because every claim about what an
 * Open Space Thing *shows* starts from the same place, and none of the steps is
 * the thing being proved: the creation gesture is
 * `adding a Space Thing creates its Space...` above and the selectors are the
 * test before this one. The keyboard Open is that test's reasoning too — the
 * created Thing lands at the visible centre, partly under a fixture Thing, so its
 * rail is not reliably clickable until it is Open and drawn over its neighbour.
 *
 * Nothing here points the Thing anywhere. It arrives pointed: creating a Space
 * Thing stores the Diagram its target opens on and that Diagram's Active Graph
 * (ADR 0079), so the Open gesture is the whole of what these tests need to set
 * up, and the selector is read rather than clicked.
 */
async function openSpaceThingOnItsDiagram(page: Page): Promise<Locator> {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createSpaceThingNamed(page, 'Architecture');
  await settled(page);

  const thing = nodeByTitle(page, 'Architecture');
  await thing.focus();
  await thing.press('Enter');

  await expect(thing.getByTestId('space-thing-diagram')).toHaveText('Diagram 1');
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
    // The four sides are anchors here and nothing more (ADR 0087): an embedded
    // Diagram draws Edges, and an Edge attaches to an anchor. Hovering reveals
    // none of them, because the reveal reads whether this Thing offers
    // connection authoring at all — and a Thing inside a Space Thing does not.
    await expect(embedded.locator('.rf-thing-node__authoring-handle')).toHaveCount(8);
    await expect(embedded.getByRole('button', { name: /^Connect (from|to) / })).toHaveCount(0);
    await expect(embedded.locator('.rf-thing-node__authoring-handle').first()).toHaveCSS(
      'opacity',
      '0',
    );
    await embedded.getByRole('button', { name: 'Edit Thing Thing 1' }).click();
    const editor = embedded.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.fill('Written inside the Space Thing');
    await embedded.getByRole('button', { name: 'Save Thing Thing 1' }).click();
    await expect(embedded).toContainText('Written inside the Space Thing');
    await switchToSpace(page, 'Space 1');
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
    await switchToSpace(page, 'Space 1');

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

/**
 * Enter is the Space Thing's kind command (ADR 0073). The existing test above
 * reaches the target through the Open Spaces menu after embed; this one is the
 * rail press ticket 11 owns.
 */
test(
  'Enter on a Space Thing shows the target and names the Space it was entered from',
  { tag: '@parity:space-thing-offers-enter' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    await createSpaceThingNamed(page, 'Architecture');
    await settled(page);

    const thing = nodeByTitle(page, 'Architecture');
    // Open first, then Enter. Enter is offered Open or Closed; the press is the claim.
    await thing.focus();
    await thing.press('Enter');
    await expect(thing.getByRole('button', { name: 'Enter Space Architecture' })).toBeVisible();
    await thing.getByRole('button', { name: 'Enter Space Architecture' }).click();

    await expect(showingSpace(page)).toContainText('Space 1');
    await expect(page.getByRole('button', { name: 'Go to Diagram fixture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter Space Architecture' })).toHaveCount(0);
  },
);

/**
 * Entering a fixture Space Thing adds its target to Open Spaces.
 *
 * Presentation already sits on Linked Spaces, and its Space is not
 * in the open set. After the rail press the Dock draws Overview, the Diagram
 * that Thing stores — not Spare, the target's defaultDiagram. Returning without
 * Exit leaves two Spaces open.
 */
const PRESENTATION_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000060');

test('Enter on a fixture Space Thing adds its target to Open Spaces', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Linked Spaces');
  await expect(nodeByTitle(page, 'Presentation')).toBeVisible();
  await settled(page);

  const thing = nodeByTitle(page, 'Presentation');
  await thing.hover();
  await expect(thing.getByRole('button', { name: 'Enter Space Presentation' })).toBeVisible();
  await thing.getByRole('button', { name: 'Enter Space Presentation' }).click();

  await expect(showingSpace(page)).toContainText('Presentation');
  await expect(page.locator('[data-testid="selected-canvas"]:visible')).toContainText('Overview');
  await expect(page.locator('[data-testid="selected-canvas"]:visible')).not.toContainText('Spare');
  await expect(nodeByTitle(page, 'Opening remarks')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to Diagram fixture' })).toBeVisible();

  await page.getByRole('button', { name: 'Go to Diagram fixture' }).click();
  await expect(showingSpace(page)).toContainText('Diagram fixture');
  await expect(page.getByRole('button', { name: /^Spaces\. 2 open\.$/ })).toBeVisible();
});

/**
 * Independently opening the Space a Space Thing shows is a link to that
 * Space's own address (ADR 0068). It is not Enter: the containing Space stays
 * on this tab, and the new one carries no opener.
 */
test(
  'Open in new tab on a Space Thing opens the target Space at its own address',
  { tag: '@parity:space-thing-opens-independently' },
  async ({ page }) => {
    const targetPath = `/spaces/${encodeCompactUuid(PRESENTATION_SPACE_ID)}`;
    await page.addInitScript(() => {
      const original = window.open.bind(window);
      window.open = (url, target, features) => {
        sessionStorage.setItem('opened-independently', String(url ?? ''));
        return original(url, target, features);
      };
    });
    await page.goto('/');
    await selectCanvas(page, 'Linked Spaces');
    await expect(nodeByTitle(page, 'Presentation')).toBeVisible();
    await settled(page);

    const thing = nodeByTitle(page, 'Presentation');
    await thing.hover();
    await thing
      .getByRole('button', { name: 'Actions for Thing Presentation' })
      .click({ delay: 120 });
    await expect(page.getByRole('menuitem', { name: /^Copy Space link/ })).toBeVisible();

    const popup = page.waitForEvent('popup').catch(() => null);
    await page.getByRole('menuitem', { name: /^Open in new tab/ }).click();
    const independent = await popup;

    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('opened-independently')))
      .toMatch(new RegExp(`${targetPath}$`));
    await expect(showingSpace(page)).toContainText('Diagram fixture');
    if (independent !== null) {
      await expect(independent).toHaveURL(new RegExp(`${targetPath}$`));
      await expect(showingSpace(independent)).toContainText('Presentation');
    }
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
    await switchToSpace(page, 'Space 1');
    await settled(page);
    // Only the next Edit is failed, while `Space 1` is the working Space.
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
    const unwell = page.getByRole('menuitemradio', { name: /^Space 1/ });
    await expect(unwell).toContainText('Save failed');
    await expect(page.getByRole('menu').getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await unwell.click();
    await expect(page.getByTestId('persistence-failure')).toBeVisible();
    await page.unroute('**/api/spaces');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('persistence-failure')).toBeHidden();
  },
);
