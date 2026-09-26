import { resourceControls, resourceToolbar, selectResource } from './graph';
import {
  beginPortalEdit,
  embeddedGraphEdgeCount,
  exercisePortalEditHostCanvas,
  exerciseSpaceResourcePadding,
  exerciseSpaceResourceFooter,
  exerciseResourceToolbarFloats,
  hostGraphEdgeCount,
} from './space-resource-frame';
import {
  exerciseSpaceResourceContextMenus,
  exerciseSpaceResourceEntityMenu,
} from './space-resource-context-menu';
import { encodeCompactUuid, uuidSchema } from '@project/core';
import { expect, test, type Locator, type Page } from './fixtures';
import { expectEmbeddedResourceToFollowDrag } from './support/embedded-drag';
import {
  activateGraph,
  authoringHandle,
  boxOf,
  connectHandles,
  createResource,
  dragBy,
  expectResourceFillsNode,
  FIXTURE_ORDINARY_SPACE_COUNT,
  graphLegendLineStroke,
  graphLegendMarkLine,
  nodeByTitle,
  selectCanvas,
  settled,
} from './graph';

/**
 * Authoring a Space Resource through the application, over HTTP and a real
 * repository.
 *
 * Creating one is not an ordinary completed Edit: the create path brings a
 * second Space into existence and the reference path writes a Resource naming one,
 * and both are one atomic Edit over coordinated per-Space sessions (ADR 0076).
 * So what these tests are really proving is that the coordinated Edit lands
 * through the same boundary every other Edit does — one revision on the
 * containing Space, no partial state on the canvas.
 */

/**
 * Move to an open Space from the Command Dock's Open Spaces menu.
 *
 * The open set is disclosed from the bar as the tree the crossings make (ADR
 * 0082), and a row is a way *to* a Space rather than a tab beside it. `delay` is the
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

/** Pan the portal camera from the containing Resource's left inset, not from an embedded child. */
const panPortal = async (page: Page, resource: Locator): Promise<void> => {
  const outer = await boxOf(resource, 'Open Space Resource');
  await page.mouse.move(outer.x + 8, outer.y + outer.height / 2);
  await page.mouse.down();
  await page.mouse.move(outer.x + 8 + 90, outer.y + outer.height / 2 + 50, { steps: 10 });
  await page.mouse.up();
  await settled(page);
};

/** Leave the Space you are in, which is the Space cluster's own command. */
const exitSpace = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /^Space: / }).click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Exit Space' }).click();
};

/**
 * Create a Space Resource and give it a name — one press, then the inline editor.
 *
 * The press mints the Space and the Resource that names it from one `Space N`
 * and continues in the Resource's own Title editor (ADR 0089), so naming it
 * anything else is an ordinary rename afterwards. **Which means the Space keeps
 * `Space N`** — a
 * Resource's Title and the title of the Space it references agree only at creation
 * (`CONTEXT.md`), and a rename here is what makes that divergence visible.
 */
const createSpaceResourceNamed = async (page: Page, title: string): Promise<void> => {
  await createResource(page, 'Space Resource');
  const editor = page.getByRole('textbox', { name: 'Resource title' });
  await expect(editor).toBeFocused();
  await editor.fill(title);
  await editor.press('Enter');
  await expect(nodeByTitle(page, title)).toHaveCount(1);
};

/**
 * Reference a Space that already exists, from the Resources list's add-Space row.
 *
 * A different act from creating one (ADR 0089): this one
 * points at a Space rather than making one, so the Resource it authors is named
 * after the Space it found.
 */
const addExistingSpace = async (page: Page, title: string): Promise<void> => {
  await page.getByRole('button', { name: 'Resources' }).click();
  const list = page.getByRole('dialog', { name: 'Resources' });
  await expect(list).toBeVisible();
  await list.getByRole('button', { name: `Add ${title} to Map` }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Resources' })).toHaveCount(0);
};

/**
 * The whole creation gesture, which is one press (ADR 0089).
 *
 * **Optimistic, and this is where that is visible.** The Resource is placed and its
 * Title editor takes the caret while the two-snapshot lifecycle is still
 * committing, so the editor is asserted before `settled` rather than after it —
 * exactly as Create Markdown Resource behaves.
 * The `Space N` the editor is seeded with is the one string handed to both the
 * Space and the Resource, so the two agree at creation.
 */
test('creating a Space Resource mints its Space and places the Resource that names it', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await createResource(page, 'Space Resource');

  const editor = page.getByRole('textbox', { name: 'Resource title' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Space 1');
  await editor.press('Escape');

  await settled(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
  await expect(nodeByTitle(page, 'Space 1')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * The Resources list offers the Meta Space's Spaces beside this Space's Resources.
 *
 * A Space Resource and its target Space share the cube glyph. The two filters
 * name the different sets: Resources authored here and Spaces available to place.
 * Creating a Space Resource makes both its canvas glyph and its target's list row.
 */
test(
  'the Resources list offers a newly created Space as a Space of the Meta Space',
  { tag: '@parity:resources-popover-offers-the-meta-spaces-beside-the-resources' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);

    await createSpaceResourceNamed(page, 'Architecture');

    await page.getByRole('button', { name: 'Resources' }).click();
    const list = page.getByRole('dialog', { name: 'Resources' });
    await expect(list).toBeVisible();

    // The Space is offered although the Resource that references it is already on
    // this Map — they are two different resources to place, which is why the
    // filter draws them as two toggles rather than one.
    // `Space 1`, not `Architecture`: the rename above was the Resource's, and a
    // Resource's Title and the title of the Space it references agree only at
    // creation (`CONTEXT.md`). This row names the Space.
    const row = list.getByRole('button', { name: 'Add Space 1 to Map' });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-space-id', /.+/);
    await expect(row.locator('[data-icon="space"]')).toBeVisible();
    // A closed Resource draws its kind glyph on itself, selected or not.
    await expect(nodeByTitle(page, 'Architecture').locator('[data-icon="space"]')).toBeVisible();
    await expect(list).toBeVisible();

    await expect(
      list
        .getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ })
        .locator('[data-icon="parent"]'),
    ).toBeVisible();
    await expect(
      list
        .getByRole('button', { name: /^Space Resources in this Space, \d+$/ })
        .locator('[data-icon="space"]'),
    ).toBeVisible();

    // And pressing its toggle off takes it away, leaving this Space's Resources.
    await page.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }).click();
    await expect(list.getByRole('button', { name: 'Add Space 1 to Map' })).toHaveCount(0);
  },
);

/**
 * A Space row drags onto the canvas as a Resource row does.
 *
 * The drop authors the Space Resource that frames the Space, titled with the
 * Space's own title, where the pointer let go — and the list the drag left
 * stays open, which is where a refusal would be drawn.
 */
test(
  'dragging a Space from the Resources list places its Space Resource at the drop point',
  { tag: '@parity:resources-popover-drags-a-space-onto-the-canvas' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await settled(page);
    const before = await nodeByTitle(page, 'Deep dive').count();
    const nodes = await page.locator('.react-flow__node').count();

    await page.getByRole('button', { name: 'Resources' }).click();
    const list = page.getByRole('dialog', { name: 'Resources' });
    // The Space's row, not the unplaced Space Resource beside it that shares
    // its title.
    const source = list
      .getByRole('button', { name: 'Add Deep dive to Map' })
      .and(list.locator('[data-space-id]'));
    await expect(source).toHaveAttribute('draggable', 'true');
    await source.hover();
    await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('drag to place');

    const pane = page.locator('.react-flow__pane');
    const paneBox = await boxOf(pane, 'the React Flow pane');
    const targetPosition = { x: paneBox.width * 0.5, y: paneBox.height * 0.8 };
    const dropPoint = { x: paneBox.x + targetPosition.x, y: paneBox.y + targetPosition.y };
    await source.dragTo(pane, { targetPosition });

    await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
    const added = nodeByTitle(page, 'Deep dive').nth(before);
    const addedBox = await boxOf(added, 'the placed Space Resource');
    expect(addedBox.x + addedBox.width / 2).toBeCloseTo(dropPoint.x, -1);
    expect(addedBox.y + addedBox.height / 2).toBeCloseTo(dropPoint.y, -1);

    await expect(list).toBeVisible();
    await expect(list.getByRole('alert')).toHaveCount(0);
    await settled(page);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    // A Space Resource, by the kind glyph a closed Resource draws on itself.
    await expect(added.locator('[data-icon="space"]')).toBeVisible();
  },
);

/**
 * Destroying a Space takes it out of the list that offers it.
 *
 * The Spaces source is read once and re-read on an epoch, and creating a Space
 * Resource is not the only Edit that changes the set: deleting the last Space Resource
 * that references a Space destroys that Space and every Space below it that
 * nothing else references (ADR 0074, ADR 0076). A list still offering it would
 * spend `link` against a Space that is gone, on a row the reader had no way to
 * know was stale.
 */
test('stops offering a Space the moment the last Space Resource referencing it is deleted', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await settled(page);

  await createSpaceResourceNamed(page, 'Architecture');

  const openList = async () => {
    await page.getByRole('button', { name: 'Resources' }).click();
    const list = page.getByRole('dialog', { name: 'Resources' });
    await expect(list).toBeVisible();
    return list;
  };

  const offered = await openList();
  await expect(offered.getByRole('button', { name: 'Add Space 1 to Map' })).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Resources' })).toHaveCount(0);

  const resource = nodeByTitle(page, 'Architecture').first();
  await resource.click();
  await resource.hover();
  await (
    await resourceControls(page, resource)
  )
    .getByRole('button', { name: 'Actions for Resource Architecture' })
    .click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Delete from Space' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete from Space' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(0);

  // The Space went with its last reference, so the cube goes with it — and the
  // count on the toggle agrees, which is the claim the count exists to make.
  // The fixture already holds ordinary Spaces; deleting Architecture lands
  // back on those, not on an empty Meta Space.
  const after = await openList();
  await expect(after.getByRole('button', { name: 'Add Space 1 to Map' })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: `Spaces in this Meta Space, ${String(FIXTURE_ORDINARY_SPACE_COUNT)}`,
    }),
  ).toBeVisible();
});

/**
 * The second Space Resource is offered the first's Space, and referencing it is not
 * a copy.
 *
 * Two Resources showing one Space is the convergence ADR 0074 permits, and it is
 * what makes the reference count — rather than a single owner — the fact that
 * decides when a Space is deleted.
 */
test('a second Space Resource may reference the Space the first one created', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createSpaceResourceNamed(page, 'Architecture');
  await settled(page);

  // The Space itself is still `Space 1` — the rename above was the Resource's — so
  // that is the row the list offers, and the Resource this authors is named after
  // the Space it found.
  await addExistingSpace(page, 'Space 1');

  await settled(page);
  // The second Resource was authored against the Space the first one created — the
  // Resources list offered it as a row — so this is a second way to reach that
  // Space rather than a second copy of it.
  await expect(nodeByTitle(page, 'Space 1')).toHaveCount(1);
  // Three Edits, not two: the creation completes on activation and the Title is
  // typed into the Resource afterwards (ADR 0089), so `createSpaceResourceNamed` spends
  // a creation *and* a rename. The third is this Resource, authored against the Space that
  // creation made.
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');

  // Referencing an existing Space selects in it too (ADR 0079). The first Resource
  // stored what its target initializer minted; this one had to read the same
  // pair back off a Space that already had it, which is the other half of the
  // rule and the half a created target cannot exercise.
  const again = nodeByTitle(page, 'Space 1');
  await again.focus();
  await again.press('Enter');
  await expect((await resourceControls(page, again)).getByTestId('space-resource-map')).toHaveText(
    'Map 1',
  );
  await expect(
    (await resourceControls(page, again)).getByTestId('space-resource-graph'),
  ).toHaveText('Graph 1');
});

/**
 * Opening a Space Resource shows the selections it already carries — and nothing
 * that would change the Space it points at.
 *
 * A created target Space is complete (ADR 0080): the one Space initializer gives
 * it an authored default Map and one empty Active Graph. The Resource stores
 * that pair from the moment it exists (ADR 0079), so what an author opens onto
 * is a Map and a Graph already named rather than two empty selectors, and
 * the selectors are there to *change* the choice rather than to make it.
 *
 * Read before either is clicked, which is what distinguishes a stored selection
 * from one this test made: a selector that had to be opened to show `Map 1`
 * would prove only that the target offers it.
 */
test(
  'an Open Space Resource shows the selections it was created with',
  {
    tag: [
      '@parity:open-space-resource-chooses-its-context-on-the-shared-controls',
      '@parity:open-space-resource-graph-rows-draw-the-graph-legend-mark',
    ],
  },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    await createSpaceResourceNamed(page, 'Architecture');
    await settled(page);

    // Opened from the keyboard rather than from the Resource's own control, because
    // the created Resource is placed at the visible centre and the fixture already
    // has a Resource there — a deliberate partial overlap (`freeAnchor` steps only on
    // an exact collision), which leaves the rail under another node's box. Enter
    // on the focused node is the same `opened-resource` completion the control runs.
    const resource = nodeByTitle(page, 'Architecture');
    await resource.focus();
    await resource.press('Enter');

    // Enabled rather than merely present: a selector over a target with nothing
    // to choose is disabled, so this is what says the created Space arrived
    // complete rather than blank.
    const mapSelector = (await resourceControls(page, resource)).getByTestId('space-resource-map');
    await expect(mapSelector).toBeEnabled();
    await expect(mapSelector).toHaveText('Map 1');
    await expect(
      (await resourceControls(page, resource)).getByTestId('space-resource-graph'),
    ).toHaveText('Graph 1');
    // And the Map it names is the one it draws, which is what says the
    // stored pair reached the canvas rather than only the two controls.
    await expect(page.locator('.react-flow__node[data-id^="embedded:"]')).toHaveCount(1);

    // **The Dock's surface and controls, and not the Dock's operations.**
    // The panel the two choices sit on is
    // compared against the Dock that is on screen beside it, property by property,
    // so a change to one that the other did not follow fails here; and the Resource
    // drawing its own stored context left the canvas the Resource stands on where
    // it was.
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
    // `:visible`, because creating the target Space opened it too and every open
    // Space stays mounted with one shown (`OpenSpacesApplication`).
    await expect(page.locator('[data-testid="selected-canvas"]:visible')).toContainText(
      'Collection 1',
    );

    // The containing Resource offers Close, portal Edit and its own title editing.
    // Embedded target Resources carry their own content-editing controls only
    // after portal Edit. Enter lives in the entity menu, not on the rail.
    await expect(
      (await resourceControls(page, resource)).getByRole('button', {
        name: 'Close Resource Architecture',
      }),
    ).toBeVisible();
    await expect(
      (await resourceControls(page, resource)).getByRole('button', {
        name: 'Edit Resource Architecture',
      }),
    ).toBeVisible();

    // The Graph list marks its one row with the target Graph's legend mark —
    // the created Space's first Graph takes the palette's first slot and the
    // arrow every new Graph starts as — and the Map list beside it carries no
    // mark.
    await (await resourceControls(page, resource)).getByTestId('space-resource-graph').click();
    const graphRow = page.getByRole('menuitemradio', { name: 'Graph 1' });
    await expect(graphLegendMarkLine(graphRow)).toHaveCSS('stroke', 'rgb(31, 119, 180)');
    await expect(graphRow.locator('[data-slot="graph-legend-mark"]')).toHaveAttribute(
      'data-head-shape',
      'arrow',
    );
    await page.keyboard.press('Escape');
    await (await resourceControls(page, resource)).getByTestId('space-resource-map').click();
    await expect(page.getByRole('menuitemradio', { name: 'Map 1' })).toBeVisible();
    await expect(page.getByRole('menu').locator('[data-slot="graph-legend-mark"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
  },
);

/**
 * Deleting a Space Resource says what it destroys before it is confirmed.
 *
 * V1 has no undo and the cascade can reach Spaces that are not on screen, so
 * the confirmation naming that is the resource standing in place of a refusal
 * (ADR 0074). Deleting the only reference takes its Space with it, which is
 * what leaves the Space count where it started.
 */
test('deleting the last Space Resource deletes the Space it referenced', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await createSpaceResourceNamed(page, 'Architecture');
  await settled(page);

  // Deleting a Resource is the Resource's own rail (ADR 0073), reached by hovering it —
  // the Space's command surface draws no Resource commands at all (ADR 0082).
  const created = nodeByTitle(page, 'Architecture');
  await created.hover();
  await (
    await resourceControls(page, created)
  )
    .getByRole('button', { name: 'Actions for Resource Architecture', exact: true })
    .click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Delete from Space' }).click();
  await expect(
    page.getByText(
      'If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete from Space', exact: true }).click();

  await settled(page);
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);

  // The Space went with it, so the Resources list no longer offers Space 1 —
  // which is the only way this surface can see the cascade. The fixture's
  // ordinary Spaces remain; the count lands back where this Space started.
  await page.getByRole('button', { name: 'Resources' }).click();
  const list = page.getByRole('dialog', { name: 'Resources' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('button', { name: 'Add Space 1 to Map' })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: `Spaces in this Meta Space, ${String(FIXTURE_ORDINARY_SPACE_COUNT)}`,
    }),
  ).toBeVisible();
});

/**
 * Remove from Map takes only the placement — the opposite of Delete from
 * Space above, which takes the Resource and, on a last reference, its Space too.
 */
test('removing a Space Resource from the Map leaves the Resource and its target Space intact', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await createSpaceResourceNamed(page, 'Architecture');
  await settled(page);

  const created = nodeByTitle(page, 'Architecture');
  await created.hover();
  await (
    await resourceControls(page, created)
  )
    .getByRole('button', { name: 'Actions for Resource Architecture', exact: true })
    .click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Remove from Map' }).click();

  // Unlike Delete from Space, Remove asks nothing before it runs.
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await settled(page);
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);

  await page.getByRole('button', { name: 'Resources' }).click();
  const list = page.getByRole('dialog', { name: 'Resources' });
  await expect(list).toBeVisible();
  // The Resource survives, unplaced rather than gone — the opposite of what the
  // test above leaves in this same list.
  await expect(list.getByRole('button', { name: 'Add Architecture to Map' })).toBeVisible();
  // And the Space it names still exists: deleting the last reference to a
  // Space takes this row away (the test above), and Remove is not that Edit.
  await expect(list.getByRole('button', { name: 'Add Space 1 to Map' })).toBeVisible();

  // Placing it again is the same Resource, stored context and all, not a fresh
  // Space Resource minted from scratch.
  await list.getByRole('button', { name: 'Add Architecture to Map' }).click();
  await page.keyboard.press('Escape');
  await settled(page);
  const restored = nodeByTitle(page, 'Architecture');
  await expect(restored).toHaveCount(1);
  await restored.focus();
  await restored.press('Enter');
  await expect(
    (await resourceControls(page, restored)).getByTestId('space-resource-map'),
  ).toHaveText('Map 1');
});

/* -------------------------------------------------------------------------- */
/* The Map an Open Space Resource draws                                        */
/* -------------------------------------------------------------------------- */

/**
 * The embedded Resources, by the id shape the projection gives them.
 *
 * `embedded:<spaceResourceId>:<targetResourceId>` is a placement id and not a Resource id
 * on purpose — two Space Resources may show one target Space on one canvas — so the
 * prefix is the only stable resource about it from out here, and it is exactly
 * what says "this node belongs to another Space".
 */
const embeddedNodes = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id^="embedded:"]');

/**
 * Create a Space Resource and Open it on the Map it already selects.
 *
 * Spelled out once rather than three times because every claim about what an
 * Open Space Resource *shows* starts from the same place, and none of the steps is
 * the behaviour being proved: the creation gesture is
 * `adding a Space Resource creates its Space...` above and the selectors are the
 * test before this one. The keyboard Open is that test's reasoning too — the
 * created Resource lands at the visible centre, partly under a fixture Resource, so its
 * rail is not reliably clickable until it is Open and drawn over its neighbour.
 *
 * Nothing here points the Resource anywhere. It arrives pointed: creating a Space
 * Resource stores the Map its target opens on and that Map's Active Graph
 * (ADR 0079), so the Open gesture is the whole of what these tests need to set
 * up, and the selector is read rather than clicked.
 */
async function openSpaceResourceOnItsMap(page: Page): Promise<Locator> {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createSpaceResourceNamed(page, 'Architecture');
  await settled(page);

  const resource = nodeByTitle(page, 'Architecture');
  await resource.focus();
  await resource.press('Enter');

  await expect(
    (await resourceControls(page, resource)).getByTestId('space-resource-map'),
  ).toHaveText('Map 1');
  await settled(page);
  return resource;
}

/**
 * Selecting a Map draws it: the target Space's own Resources arrive inside the
 * Space Resource, in the containing canvas, as sub-flow children (ADR 0068).
 *
 * The unit and application tests hold the projection to the Resource's selection;
 * what only a browser can say is that React Flow actually mounted the children
 * the projection asked for. `Resource 1` is the Resource the one Space initializer puts
 * in every new Space (ADR 0080), and no Resource in the tracked fixture carries
 * that title — so a node drawing it is a node from the other Space and could
 * not have come from anywhere else.
 *
 * The count is asserted beside the title because an embedding that drew the
 * target twice, or drew it and left a stale copy behind, would still satisfy a
 * visibility check on one of them.
 */
test(
  'selecting a Map draws the target Space inside the Open Space Resource',
  { tag: '@parity:open-space-resource-draws-its-selected-map' },
  async ({ page }) => {
    const resource = await openSpaceResourceOnItsMap(page);

    await expect(embeddedNodes(page)).toHaveCount(1);
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Resource 1' })).toBeVisible();
    // Drawn *inside* the Space Resource's own box, which is what makes it a view of
    // the Space rather than a second row of Resources beside it. React Flow renders a
    // child as a sibling of its parent, so containment is a fact about the boxes
    // and not about the DOM tree.
    const inner = await boxOf(embeddedNodes(page), 'the embedded Resource');
    const outer = await boxOf(resource, 'the Open Space Resource');
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.y).toBeGreaterThanOrEqual(outer.y);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
    expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    const map = await boxOf(
      (await resourceControls(page, resource)).getByTestId('space-resource-map'),
      'Map selector',
    );
    const graph = await boxOf(
      (await resourceControls(page, resource)).getByTestId('space-resource-graph'),
      'Graph selector',
    );
    // Both named choices share the toolbar floating above the Resource (ADR 0102).
    expect(map.y + map.height).toBeLessThanOrEqual(outer.y);
    expect(graph.y).toBeCloseTo(map.y, 1);
    expect(graph.x).toBeGreaterThanOrEqual(map.x + map.width);
    expect(graph.x + graph.width).toBeLessThan(outer.x + outer.width);
  },
);

test(
  'dragging an Open Space Resource keeps its embedded Map aligned',
  { tag: '@parity:open-space-resource-drag-keeps-embedded-map-aligned' },
  async ({ page }) => {
    const resource = await openSpaceResourceOnItsMap(page);
    await expect(embeddedNodes(page)).toHaveCount(1);
    await expectEmbeddedResourceToFollowDrag(page, resource, embeddedNodes(page));
  },
);

test(
  'editing inside an Open Space Resource saves the target and refuses cross-Space connections',
  { tag: '@parity:embedded-map-resources-author-target' },
  async ({ page }) => {
    await openSpaceResourceOnItsMap(page);
    const parent = nodeByTitle(page, 'Architecture');
    await beginPortalEdit(page, parent);
    const embedded = embeddedNodes(page);
    await expect(embedded).toHaveCount(1);
    await embedded.hover();
    // Edit offers the same hover handles as the host canvas. They author the
    // Graph this Space Resource is showing and refuse a cross-Space Edge (ADR 0040).
    await expect(embedded.locator('.rf-resource-node__authoring-handle')).toHaveCount(8);
    await expect(embedded.getByLabel(/^Connect (from|to) /)).toHaveCount(8);
    await expect(embedded.locator('.rf-resource-node__authoring-handle--source').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await (
      await resourceControls(page, embedded)
    )
      .getByRole('button', { name: 'Edit Resource Resource 1' })
      .click();
    const editor = embedded.locator('[contenteditable="true"]');
    await expect(editor).toBeVisible();
    await editor.fill('Written inside the Space Resource');
    await (
      await resourceToolbar(page, embedded)
    )
      .getByRole('button', { name: 'Save Resource Resource 1' })
      .click();
    await expect(embedded).toContainText('Written inside the Space Resource');
    await switchToSpace(page, 'Space 1');
    await expect(
      page.locator('.react-flow__node:visible').getByRole('heading', { name: 'Resource 1' }),
    ).toBeVisible();
    await expect(page.locator('.react-flow__node:visible')).toContainText(
      'Written inside the Space Resource',
    );
    await page.reload();
    await expect(page.locator('.react-flow__node:visible')).toContainText(
      'Written inside the Space Resource',
    );
  },
);

/**
 * Handles author the Graph the Space Resource is showing
 * and do not complete a cross-Space Edge on the containing canvas (ADR 0040).
 */
test('a connect between two embedded Resources authors the shown Graph, not the host Graph', async ({
  page,
}) => {
  const parent = await openSpaceResourceOnItsMap(page);
  // The host's Active Graph is made to differ from the shown one in both colour
  // and head shape — the fixture's `Short` stores `diamond`, the created target's
  // one Graph stores none — so a preview drawn from the host's Graph is caught.
  await activateGraph(page, 'Short');
  const hostColor = await graphLegendLineStroke(page, 'Short');
  await beginPortalEdit(page, parent);
  const embedded = embeddedNodes(page);
  await expect(embedded).toHaveCount(1);
  const hostBefore = await hostGraphEdgeCount(page, parent);
  const shownBefore = await embeddedGraphEdgeCount(page, parent);
  await embedded.hover();
  // A self-Edge is legal (ADR 0032) and the one in-view Resource is the pair the
  // host camera still frames. A second Resource authored on the target canvas sits
  // outside that window, and Playwright's box is the layout box, not the clip.
  const sourceHandle = authoringHandle(embedded, 'source', 'right');
  // The embedded handles are drawn in the shown Graph's colour, which is what
  // the preview must be drawn in too; that Graph stores no head shape.
  await expect(sourceHandle).toHaveCSS('opacity', '1');
  const shownColor = await sourceHandle.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(shownColor).not.toBe(hostColor);
  await connectHandles(
    page,
    sourceHandle,
    authoringHandle(embedded, 'target', 'left'),
    async () => {
      await expect(page.locator('.react-flow__connection-path')).toHaveCSS('stroke', shownColor);
      const head = page.locator(
        'marker#graph-authoring-connection-head [data-slot="graph-head-shape"]',
      );
      await expect(head).toHaveAttribute('data-head-shape', 'arrow');
      await expect(head).toHaveCSS('fill', shownColor);
    },
  );
  await settled(page);
  expect(await hostGraphEdgeCount(page, parent)).toBe(hostBefore);
  await expect.poll(() => embeddedGraphEdgeCount(page, parent)).toBe(shownBefore + 1);
});

/**
 * Closing the Space Resource takes the view with it.
 *
 * The embedded Resources are nodes in the containing instance's own store, not
 * markup inside the Resource, so nothing removes them by unmounting the Resource's
 * body: the projection has to stop asking for them. A Closed Space Resource that
 * left its children behind would leave another Space's Resources loose on this
 * canvas, drawn over whatever the Map actually places there — so this is the
 * claim that the sub flow is owned by the Open state rather than merely started
 * by it.
 */
test('closing a Space Resource removes the embedded Map it was drawing', async ({ page }) => {
  const resource = await openSpaceResourceOnItsMap(page);
  await expect(embeddedNodes(page)).toHaveCount(1);

  await (
    await resourceControls(page, resource)
  )
    .getByRole('button', { name: 'Close Resource Architecture' })
    .click();
  await settled(page);

  await expect(embeddedNodes(page)).toHaveCount(0);
  // The Space Resource itself is untouched — Closing is a Map Edit about this
  // Resource's Open state and says nothing about the Space it references.
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
});

test('an embedded Resource can move, open with the keyboard and resize in its target Map', async ({
  page,
}) => {
  const parent = await openSpaceResourceOnItsMap(page);
  await beginPortalEdit(page, parent);
  const embedded = embeddedNodes(page);
  await expect(embedded).toHaveCount(1);
  await expectResourceFillsNode(parent);
  await expectResourceFillsNode(embedded);
  const before = await boxOf(embedded, 'embedded Resource');
  const outerBefore = await boxOf(parent, 'containing Resource');
  const parentFace = parent.locator('.canvas-resource').first();
  const parentFaceBefore = await boxOf(parentFace, 'containing Resource face');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height - 12);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 50, before.y + before.height - 12 + 20, {
    steps: 8,
  });
  await page.mouse.up();
  const moved = await boxOf(embedded, 'moved embedded Resource');
  expect(moved.x).toBeGreaterThan(before.x + 30);
  await embedded.focus();
  await embedded.press('Enter');
  await expect(
    (await resourceControls(page, embedded)).getByRole('button', {
      name: 'Close Resource Resource 1',
    }),
  ).toBeVisible();
  await embedded.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  await expectResourceFillsNode(embedded);
  await expectResourceFillsNode(parent);
  await embedded.hover();
  const control = embedded.locator('.react-flow__resize-control.handle.bottom.right');
  const resize = await boxOf(control, 'embedded resize control');
  const open = await boxOf(embedded, 'Open embedded Resource');
  await page.mouse.move(resize.x + resize.width / 2, resize.y + resize.height / 2);
  await page.mouse.down();
  await page.mouse.move(resize.x + resize.width / 2 + 25, resize.y + resize.height / 2 + 20, {
    steps: 8,
  });
  await expectResourceFillsNode(embedded);
  await expectResourceFillsNode(parent);
  expect(await boxOf(parentFace, 'containing Resource face during resize')).toEqual(
    parentFaceBefore,
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await boxOf(embedded, 'resized embedded Resource')).width)
    .toBeGreaterThan(open.width + 15);
  await expectResourceFillsNode(embedded);
  await expectResourceFillsNode(parent);
  expect(await boxOf(parentFace, 'containing Resource face after target edits')).toEqual(
    parentFaceBefore,
  );
  const outerAfter = await boxOf(parent, 'containing Resource after target edits');
  expect(outerAfter.width).toBeCloseTo(outerBefore.width, 0);
  expect(outerAfter.height).toBeCloseTo(outerBefore.height, 0);
});

/**
 * Entering a Space names the one it was entered from, and Exit undoes it.
 *
 * **The bar names one step up rather than a whole path**, which is the
 * arrangement's answer to width rather than an omission: the step a reader
 * reaches for is the one above them, and everything further up is behind the
 * Open Spaces disclosure. The shared OPEN mark identifies Opener/Meta and the
 * cube identifies an ordinary Space, including when opened directly.
 */
test(
  'entering a Space names the Space it was entered from, and Exit returns',
  { tag: '@parity:command-dock-marks-the-space-one-crossing-up' },
  async ({ page }) => {
    await openSpaceResourceOnItsMap(page);

    // Two Spaces open and neither entered, so the bar carries the Open Spaces
    // menu and no Opener control: there is nothing above `Map fixture`.
    await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);
    await switchToSpace(page, 'Space 1');

    // Entered, so the crossing is named — and named as the Space, with the
    // OPEN mark carrying the relation rather than a word.
    const opener = page.getByRole('button', { name: 'Go to Map fixture' });
    await expect(opener).toBeVisible();
    // The mark contributes nothing to the name: the OPEN mark is `aria-hidden`, so
    // the control is named for the Space alone and the glyph carries the
    // relation to it.
    await expect(opener).toHaveAccessibleName('Go to Map fixture');
    await expect(opener).toContainText('Map fixture');
    await expect(opener.locator('svg[data-icon="parent"][aria-hidden="true"]')).toBeVisible();
    await expect(opener.locator('svg[data-icon="parent"]')).toHaveAttribute('viewBox', '0 0 16 16');
    await expect(showingSpace(page).locator('[data-icon="space"]')).toBeVisible();
    await expect(showingSpace(page).getByRole('img')).toHaveCount(0);
    await expect(showingSpace(page).locator('[title]')).toHaveCount(0);

    const ordinarySpaceUrl = page.url();

    await exitSpace(page);

    await expect(showingSpace(page)).toContainText('Map fixture');
    await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);
    // Meta is the Space you are in, so it draws the cube; the OPEN mark is the
    // Spaces trigger's.
    await expect(showingSpace(page).locator('[data-icon="space"]')).toBeVisible();
    await expect(showingSpace(page).locator('[data-icon="parent"]')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Spaces\. \d+ open\.$/ }).locator('[data-icon="parent"]'),
    ).toBeVisible();

    const embedded = embeddedNodes(page);
    await expect(embedded).toHaveCount(1);
    await expect(embedded.getByRole('button', { name: /Edit Resource/ })).toHaveCount(0);
    await expect(
      (await resourceControls(page, nodeByTitle(page, 'Architecture'))).getByRole('button', {
        name: 'Edit Resource Architecture',
      }),
    ).toBeVisible();

    await page.goto(ordinarySpaceUrl);
    await expect(showingSpace(page).locator('[data-icon="space"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);
  },
);

/**
 * Meta is always one choice away, from every Space.
 *
 * A Space reached by its own address has no Opener, and after a reload
 * Meta is not open at all. The Open Spaces menu is drawn anyway, lists Meta
 * first by its own title, and choosing it opens Meta.
 */
test(
  'the Open Spaces menu lists Meta first and opens it from a Space opened by its own address',
  { tag: '@parity:command-dock-always-reaches-meta' },
  async ({ page }) => {
    await openSpaceResourceOnItsMap(page);
    await switchToSpace(page, 'Space 1');
    await page.goto(page.url());
    await expect(showingSpace(page)).toContainText('Space 1');
    await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);

    await page.getByRole('button', { name: 'Spaces. 1 open.' }).click({ delay: 120 });
    const rows = page.getByRole('menu').getByRole('menuitemradio');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAccessibleName('Map fixture');
    await expect(rows.first().locator('svg[data-icon="parent"]')).toBeVisible();
    await expect(rows.nth(1)).toHaveAccessibleName('Space 1');
    await expect(rows.nth(1).locator('svg[data-icon="space"]')).toBeVisible();

    await rows.first().click();
    await expect(showingSpace(page)).toContainText('Map fixture');
    await expect(showingSpace(page).locator('[data-icon="space"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spaces. 2 open.' })).toBeVisible();
  },
);

/**
 * Enter is the Space Resource's kind command (ADR 0073). The test above
 * reaches the target through the Open Spaces menu after embed; this one is the
 * rail press.
 */
test(
  'Enter on a Space Resource shows the target and names the Space it was entered from',
  { tag: '@parity:space-resource-offers-enter' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    await createSpaceResourceNamed(page, 'Architecture');
    await settled(page);

    const resource = nodeByTitle(page, 'Architecture');
    // Open first, then Enter. Enter is offered Open or Closed; the press is the claim.
    await resource.focus();
    await resource.press('Enter');
    await (
      await resourceControls(page, resource)
    )
      .getByRole('button', { name: 'Actions for Resource Architecture' })
      .click();
    await page.getByRole('menuitem', { name: 'Enter', exact: true }).click();

    await expect(showingSpace(page)).toContainText('Space 1');
    await expect(page.getByRole('button', { name: 'Go to Map fixture' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enter Space Architecture' })).toHaveCount(0);
  },
);

/**
 * Entering a fixture Space Resource adds its target to Open Spaces.
 *
 * Presentation already sits on Linked Spaces, and its Space is not
 * in the open set. After the rail press the Dock draws Overview, the Map
 * that Resource stores — not Spare, the target's defaultMap. Returning without
 * Exit leaves two Spaces open.
 */
const PRESENTATION_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000060');

test('Enter on a fixture Space Resource adds its target to Open Spaces', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Linked Spaces');
  await expect(nodeByTitle(page, 'Presentation')).toBeVisible();
  await settled(page);

  const resource = nodeByTitle(page, 'Presentation');
  await (
    await resourceControls(page, resource)
  )
    .getByRole('button', { name: 'Actions for Resource Presentation' })
    .click();
  await page.getByRole('menuitem', { name: 'Enter', exact: true }).click();

  await expect(showingSpace(page)).toContainText('Presentation');
  await expect(page.locator('[data-testid="selected-canvas"]:visible')).toContainText('Overview');
  await expect(page.locator('[data-testid="selected-canvas"]:visible')).not.toContainText('Spare');
  await expect(nodeByTitle(page, 'Opening remarks')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Go to Map fixture' })).toBeVisible();

  await page.getByRole('button', { name: 'Go to Map fixture' }).click();
  await expect(showingSpace(page)).toContainText('Map fixture');
  await expect(page.getByRole('button', { name: /^Spaces\. 2 open\.$/ })).toBeVisible();
});

/**
 * Independently opening the Space a Space Resource shows is a link to that
 * Space's own address (ADR 0068). It is not Enter: the containing Space stays
 * on this tab, and the new one carries no opener.
 */
test(
  'Open in New Tab on a Space Resource opens the target Space at its own address',
  { tag: '@parity:space-resource-opens-independently' },
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

    const resource = nodeByTitle(page, 'Presentation');
    await (
      await resourceControls(page, resource)
    )
      .getByRole('button', { name: 'Actions for Resource Presentation' })
      .click({ delay: 120 });
    await expect(page.getByRole('menuitem', { name: /^Copy link to Space/ })).toBeVisible();

    const popup = page.waitForEvent('popup');
    await page.getByRole('menuitem', { name: /^Open in New Tab/ }).click();
    const independent = await popup;

    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem('opened-independently')))
      .toMatch(new RegExp(`${targetPath}$`));
    await expect(showingSpace(page)).toContainText('Map fixture');
    await expect(independent).toHaveURL(new RegExp(`${targetPath}$`));
    await expect(showingSpace(independent)).toContainText('Presentation');
  },
);

test('a Space Resource resizes to Close and remembers its Open Size', async ({ page }) => {
  const parent = await openSpaceResourceOnItsMap(page);
  await parent.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  // Move the resize corner clear of the fixed Graph overview overlay.
  await dragBy(page, parent, -400, -150);
  await selectResource(parent);
  const open = await boxOf(parent, 'Open Space Resource');
  const control = await boxOf(
    parent.locator('.react-flow__resize-control.handle.bottom.right'),
    'Space Resource resize control',
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
  await expect(
    (await resourceControls(page, parent)).getByRole('button', {
      name: 'Open Resource Architecture',
    }),
  ).toBeVisible();
  await parent.focus();
  await parent.press('Enter');
  await expect(
    (await resourceControls(page, parent)).getByRole('button', {
      name: 'Close Resource Architecture',
    }),
  ).toBeVisible();
  await expect
    .poll(async () => (await boxOf(parent, 'reopened Space Resource')).width)
    .toBeCloseTo(open.width, 0);
  await expect
    .poll(async () => (await boxOf(parent, 'reopened Space Resource')).height)
    .toBeCloseTo(open.height, 0);
});

test(
  'the Dock names another open Space whose commit failed',
  {
    tag: '@parity:command-dock-names-an-unwell-open-space',
  },
  async ({ page }) => {
    await openSpaceResourceOnItsMap(page);
    await switchToSpace(page, 'Space 1');
    await settled(page);
    // Only the next Edit is failed, while `Space 1` is the working Space.
    await page.route('**/api/spaces', async (route) => {
      if (route.request().method() === 'POST') return route.abort('failed');
      return route.continue();
    });
    const resource = nodeByTitle(page, 'Resource 1');
    await resource.focus();
    await resource.press('Enter');
    await expect(page.getByTestId('persistence-failure')).toBeVisible();
    await page.getByRole('button', { name: 'Go to Map fixture', exact: true }).click();
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

test(
  'Space Resource context menus author the target with the Dock commands',
  { tag: '@parity:space-resource-context-menus-share-dock-actions' },
  async ({ page }) => {
    const resource = await openSpaceResourceOnItsMap(page);
    await exerciseSpaceResourceContextMenus(page, resource);
    await page.reload();
    const reopened = nodeByTitle(page, 'Architecture');
    await expect(
      (await resourceControls(page, reopened)).getByTestId('space-resource-map'),
    ).toHaveText('Target context');
    await expect(
      (await resourceControls(page, reopened)).getByTestId('space-resource-graph'),
    ).toHaveText('Target path');
    await (await resourceControls(page, reopened)).getByTestId('space-resource-map').focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('menuitemradio', { name: 'Created from rail', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await (await resourceControls(page, reopened)).getByTestId('space-resource-graph').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitemradio', { name: 'Graph 1', exact: true })).toHaveCount(0);
  },
);

test(
  'Space Resource entity menu groups commands and creates a Space Reference Resource',
  { tag: '@parity:space-resource-entity-menu' },
  async ({ page }) => {
    const resource = await openSpaceResourceOnItsMap(page);
    await exerciseSpaceResourceEntityMenu(page, resource);
    await settled(page);
    await page.reload();
    await expect(nodeByTitle(page, 'Space Resource reference')).toBeVisible();
  },
);

test(
  'Space Resource canvas has equal top and side padding',
  { tag: '@parity:space-resource-canvas-padding' },
  async ({ page }) => {
    const resource = await openSpaceResourceOnItsMap(page);
    await exerciseSpaceResourcePadding(page, resource, embeddedNodes(page).first());
  },
);

test(
  'Space Resource title footer follows its content',
  { tag: '@parity:space-resource-content-sized-footer' },
  async ({ page }) => {
    const resource = await openSpaceResourceOnItsMap(page);
    await exerciseSpaceResourceFooter(page, resource, embeddedNodes(page).first());
  },
);

test(
  'a selected Resource toolbar floats above its top-right corner at the Dock control size',
  { tag: '@parity:resource-toolbar-floats-above-its-corner' },
  async ({ page }) => {
    const resource = await openSpaceResourceOnItsMap(page);
    await exerciseResourceToolbarFloats(page, resource);
  },
);

test(
  'Edit, Done and keyboard toggle the portal without discarding target edits',
  { tag: '@parity:space-resource-portal-read-edit' },
  async ({ page }) => {
    const parent = await openSpaceResourceOnItsMap(page);
    const embedded = embeddedNodes(page);
    await expect(embedded).toHaveCount(1);
    await expect(embedded.getByRole('button', { name: /Edit Resource/ })).toHaveCount(0);
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
    await settled(page);
    const outerAfter = await boxOf(parent, 'moved containing Resource');
    expect(outerAfter.x).toBeGreaterThan(outerBefore.x + 30);
    const innerAfter = await boxOf(embedded, 'embedded Resource after outer drag');
    expect(innerAfter.x - outerAfter.x).toBeCloseTo(innerBefore.x - outerBefore.x, 0);

    const rail = (await resourceControls(page, parent)).getByTestId('canvas-resource-actions');
    await rail.getByRole('button', { name: 'Edit Resource Architecture' }).click();
    await expect(rail.getByRole('button', { name: 'Done Resource Architecture' })).toBeVisible();
    // Portal Edit makes the embedded Resource's own commands reachable: selecting
    // it draws its toolbar with Edit (ADR 0102).
    await expect(
      (await resourceControls(page, embeddedNodes(page))).getByRole('button', {
        name: 'Edit Resource Resource 1',
      }),
    ).toBeVisible();
    await rail.getByRole('button', { name: 'Done Resource Architecture' }).click();
    await expect(
      (await resourceToolbar(page, embeddedNodes(page))).getByRole('button', {
        name: /Edit Resource/,
      }),
    ).toHaveCount(0);
    // Selecting the embedded Resource moved the selection off the containing one,
    // whose toolbar the ended portal Edit no longer keeps drawn.
    await selectResource(parent);
    await expect(rail.getByRole('button', { name: 'Edit Resource Architecture' })).toBeVisible();

    await rail.getByRole('button', { name: 'Edit Resource Architecture' }).focus();
    await page.keyboard.press('Enter');
    await expect(rail.getByRole('button', { name: 'Done Resource Architecture' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(rail.getByRole('button', { name: 'Edit Resource Architecture' })).toBeFocused();
  },
);

test(
  'portal framing survives Done, Close, reopen and reload, and Enter uses the canvas size',
  { tag: '@parity:space-resource-portal-framing' },
  async ({ page }) => {
    const parent = await openSpaceResourceOnItsMap(page);
    const embedded = embeddedNodes(page);
    await beginPortalEdit(page, parent);
    const before = await boxOf(embedded, 'embedded Resource');
    await panPortal(page, parent);
    const framed = await boxOf(embedded, 'framed embedded Resource');
    expect(framed.x).not.toBeCloseTo(before.x, 0);

    await (
      await resourceControls(page, parent)
    )
      .getByRole('button', { name: 'Done Resource Architecture' })
      .click();
    const inset = async (label: string) => {
      const outer = await boxOf(parent, 'containing Resource');
      const inner = await boxOf(embeddedNodes(page), label);
      const zoom = await parent.evaluate((node) =>
        node instanceof HTMLElement ? node.getBoundingClientRect().width / node.offsetWidth : 1,
      );
      return { x: (inner.x - outer.x) / zoom, y: (inner.y - outer.y) / zoom };
    };
    const framedInset = await inset('framed after Done');

    await (
      await resourceControls(page, parent)
    )
      .getByRole('button', { name: 'Close Resource Architecture' })
      .click();
    await settled(page);
    await parent.focus();
    await parent.press('Enter');
    await settled(page);
    expect((await inset('framed after reopen')).x).toBeCloseTo(framedInset.x, 0);
    expect((await inset('framed after reopen')).y).toBeCloseTo(framedInset.y, 0);

    await expect(page.getByTestId('persistence-status').first()).toHaveText('Persisted');
    await page.reload();
    await expect(embeddedNodes(page)).toHaveCount(1);
    expect((await inset('framed after reload')).x).toBeCloseTo(framedInset.x, 0);
    expect((await inset('framed after reload')).y).toBeCloseTo(framedInset.y, 0);

    const portalBox = await boxOf(parent, 'portal before Enter');
    await (
      await resourceControls(page, parent)
    )
      .getByRole('button', { name: 'Actions for Resource Architecture' })
      .click({ delay: 120 });
    await page.getByRole('menuitem', { name: 'Enter', exact: true }).click();
    await expect(showingSpace(page)).toContainText('Space 1');
    const enteredCanvas = page.locator('.react-flow:visible').first();
    await expect(enteredCanvas).toBeVisible();
    const enteredPane = await enteredCanvas.boundingBox();
    if (enteredPane === null) throw new Error('entered canvas missing');
    expect(enteredPane.width).toBeGreaterThan(portalBox.width + 40);

    await page.getByRole('button', { name: 'Go to Map fixture' }).click();
    await expect(showingSpace(page)).toContainText('Map fixture');
    await expect(embeddedNodes(page)).toHaveCount(1);
    await settled(page);
    expect((await inset('framed after Return')).x).toBeCloseTo(framedInset.x, 0);
    expect((await inset('framed after Return')).y).toBeCloseTo(framedInset.y, 0);
  },
);

test(
  'portal zoom frames authored coordinates without stretching Resources or painting outside',
  { tag: '@parity:space-resource-portal-edit-is-the-host-canvas' },
  async ({ page }) => {
    const parent = await openSpaceResourceOnItsMap(page);
    await exercisePortalEditHostCanvas(page, parent, embeddedNodes(page));
  },
);

test('deleting the selected Map clears framing; deleting a Graph keeps it', async ({ page }) => {
  const parent = await openSpaceResourceOnItsMap(page);
  const embedded = embeddedNodes(page);
  await beginPortalEdit(page, parent);
  await panPortal(page, parent);
  const framed = await boxOf(embedded, 'framed embedded Resource');

  const openGraph = async () => {
    const trigger = (await resourceControls(page, parent)).getByTestId('space-resource-graph');
    await trigger.focus();
    await trigger.press('Enter');
  };
  await openGraph();
  await page.getByRole('menuitem', { name: 'New Graph', exact: true }).click();
  await settled(page);
  expect((await boxOf(embeddedNodes(page), 'framed after new Graph')).x).toBeCloseTo(framed.x, 0);
  expect((await boxOf(embeddedNodes(page), 'framed after new Graph')).y).toBeCloseTo(framed.y, 0);
  await openGraph();
  await page.getByRole('menuitem', { name: /^Delete Graph / }).click();
  await settled(page);
  expect((await boxOf(embeddedNodes(page), 'framed after Graph delete')).x).toBeCloseTo(
    framed.x,
    0,
  );
  expect((await boxOf(embeddedNodes(page), 'framed after Graph delete')).y).toBeCloseTo(
    framed.y,
    0,
  );

  const openMap = async () => {
    const trigger = (await resourceControls(page, parent)).getByTestId('space-resource-map');
    await trigger.focus();
    await trigger.press('Enter');
  };
  await openMap();
  await page.getByRole('menuitem', { name: 'New Map', exact: true }).click();
  await page.getByRole('textbox', { name: 'Map name', exact: true }).fill('Replacement');
  await page.getByRole('textbox', { name: 'Map name', exact: true }).press('Enter');
  await settled(page);
  await openMap();
  await page.getByRole('menuitem', { name: 'Delete Replacement', exact: true }).click();
  await settled(page);
  const reset = await boxOf(embeddedNodes(page), 'embedding after Map fallback');
  expect(reset.x).not.toBeCloseTo(framed.x, 0);
});
