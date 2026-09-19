import { expect, test, type Page } from '@playwright/test';
import { productDestinationPath } from '@project/http';
import { expectMenuGroups, thingActions } from '../e2e/graph';
import { commandDockSnapshot } from '../stories/support/spaces';

/**
 * The Command Dock's behaviour half (ADR 0082, ADR 0052).
 *
 * **This file replaced `issue-14-space-sidebar.spec.ts` rather than being
 * added beside it.** Twelve of the thirteen `@parity:` tags in the Space
 * Sidebar's suite named claims that are gone: four of them named the Sidebar in
 * the claim sentence, and five stated behaviour the Dock does not have or has
 * decided against. Each test below presses one Dock obligation instead, and the
 * claims it proves are in `stories/parity-claims.ts` under their own names.
 *
 * Every story is `iframed`, so each test drives the preview directly at
 * `?story=<id>&mode=preview` — `space--command-dock--<export-kebab>`.
 */

const story = (name: string): string => `/?story=space--command-dock--${name}&mode=preview`;

/** The docked frame, which is the element the twelve slots place. */
const dock = (page: Page) => page.getByTestId('command-dock').filter({ visible: true });

/** The command surface inside it: one `Toolbar`, one tab stop, one roving order. */
const surface = (page: Page) => page.getByRole('toolbar', { name: 'Command Dock' });

/**
 * Press a Dock disclosure and wait for what it discloses.
 *
 * `delay` is not decoration. A default Playwright click puts mousedown and
 * mouseup in one tick, and Base UI's dismissal never gets a turn between them —
 * a trigger whose ref was dropped then opens and closes on its own press, which
 * this suite cannot see without it. The reason is written out at
 * `link-actions.spec.ts`, where the regression it caught happened.
 */
const disclose = async (page: Page, name: string) => {
  // `exact`, because an accessible name matches as a substring by default and
  // a shorter `Diagram:` would also hit `Active Graph` is not the issue — a
  // title that is a prefix of another identity's title would be.
  await surface(page).getByRole('button', { name, exact: true }).click({ delay: 120 });
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible();
  return menu;
};

/**
 * ADR 0053's one surviving clause, kept verbatim by ADR 0082: the canvas takes
 * one exclusive choice over authored Diagrams, with no second control and no
 * empty value.
 *
 * The list is a `DropdownMenuRadioGroup` rather than a column of pressed rows,
 * so what carries the choice is `aria-checked` on one item — and the cluster
 * outside the menu names the same Diagram, which is the "no second control" half
 * read from the other side.
 */
test(
  'the Diagram cluster is one exclusive list over the authored Diagrams',
  { tag: '@parity:command-dock-marks-one-current-diagram' },
  async ({ page }) => {
    await page.goto(story('default'));

    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Collection 1',
    );

    const menu = await disclose(page, 'Diagram: Collection 1');
    const chosen = menu.getByRole('menuitemradio', { name: 'Collection 1' });
    const other = menu.getByRole('menuitemradio', { name: 'Collection 2' });
    await expect(chosen).toHaveAttribute('aria-checked', 'true');
    await expect(other).toHaveAttribute('aria-checked', 'false');
    await expect(menu.getByRole('menuitemradio')).toHaveCount(2);

    await other.click();

    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Collection 2',
    );
    // And the Graphs follow the Diagram that owns them (ADR 0040): `Echo` is
    // `Collection 2`'s only Graph, and `Long` belongs to the Diagram just left.
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText('Echo');
    await expect(
      surface(page).getByRole('button', { name: 'Diagram: Collection 2', exact: true }),
    ).toBeVisible();
  },
);

/**
 * New Diagram is in the Diagram menu, beside the list it adds to, and it adds an
 * *empty* one (ADR 0079, ADR 0080).
 *
 * The Sidebar had room for a permanent Add Diagram button; the Dock finds room by
 * disclosure. What did not change is that the command creates and selects a
 * Diagram with no Things placed in it through production Space Authoring.
 */
test(
  'New Diagram creates and selects an empty Diagram from the Diagram menu',
  { tag: '@parity:command-dock-adds-an-empty-diagram' },
  async ({ page }) => {
    await page.goto(story('default'));

    const nodes = page.locator('.react-flow__node:visible');
    await expect(nodes.first()).toBeVisible();

    const menu = await disclose(page, 'Diagram: Collection 1');
    await menu.getByRole('menuitem', { name: 'New Diagram' }).click();

    // The command opens nothing and continues in the new Diagram's name
    // (`.scratch/command-dock/issues/13`), so the Dock is drawing that name's
    // editor rather than the name — and the caret is the outcome worth holding.
    // Escape cancels an untouched draft, which leaves the title the Edit stored.
    //
    // `Diagram 1` is what `nextDiagramTitle` mints over `Collection 1` and
    // `Collection 2` — the application's own numbering, not a word this test
    // chose.
    const name = page.getByRole('textbox', { name: 'Diagram name' });
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Diagram 1');
    await page.keyboard.press('Escape');
    await expect(name).toHaveCount(0);

    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Diagram 1',
    );
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText(
      'Graph 1',
    );
    await expect(nodes).toHaveCount(0);

    const reopened = await disclose(page, 'Diagram: Diagram 1');
    await expect(reopened.getByRole('menuitemradio')).toHaveCount(3);
  },
);

/**
 * The Diagram menu's one grouping grammar
 * (`.scratch/dock-menu-reorganisation/issues/01`): the Diagram list, New
 * Diagram on its own, Rename beside Copy link to Diagram, then Delete — one
 * separator between each group.
 */
test('the Diagram menu groups New Diagram, Rename with Copy link, then Delete', async ({
  page,
}) => {
  await page.goto(story('default'));

  const menu = await disclose(page, 'Diagram: Collection 1');
  await expectMenuGroups(menu, [
    ['Collection 1', 'Collection 2'],
    ['New Diagram'],
    ['Rename', 'Copy link to Diagram'],
    ['Delete Collection 1'],
  ]);
});

/**
 * New Graph is in the Graph menu, beside the list it adds to, and it appends,
 * colours and activates one empty Graph in one Edit (ADR 0040).
 */
test(
  'New Graph creates and selects an empty Graph from the Graph menu',
  { tag: '@parity:command-dock-adds-graph' },
  async ({ page }) => {
    await page.goto(story('default'));

    const menu = await disclose(page, 'Active Graph: Long');
    await menu.getByRole('menuitem', { name: 'New Graph' }).click();

    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText(
      'Graph 1',
    );

    const reopened = await disclose(page, 'Active Graph: Graph 1');
    await expect(reopened.getByRole('menuitemradio')).toHaveCount(4);
  },
);

/**
 * Recolour is a submenu on the Graph the cluster is naming, not a second
 * permanent control — the same frequency rule that keeps New Graph in the menu.
 */
test(
  'the Graph menu stores a palette colour on the active Graph',
  { tag: '@parity:command-dock-recolors-graph' },
  async ({ page }) => {
    await page.goto(story('default'));

    const menu = await disclose(page, 'Active Graph: Long');
    await menu.getByRole('menuitem', { name: 'Colour…' }).click();
    const submenu = page.getByRole('radiogroup', { name: 'Graph colour' });
    await submenu.getByRole('radio', { name: 'Green', exact: true }).click();

    const reopened = await disclose(page, 'Active Graph: Long');
    await reopened.getByRole('menuitem', { name: 'Colour…' }).click();
    const palette = page.getByRole('radiogroup', { name: 'Graph colour' });
    await expect(palette.getByRole('radio', { name: 'Green', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  },
);

/**
 * Delete Graph is present and unavailable on the last Graph a Diagram keeps,
 * and removes the active Graph when more than one survive (ADR 0040).
 */
test(
  'Delete Graph removes a Graph and withholds the last one',
  { tag: '@parity:command-dock-deletes-graph' },
  async ({ page }) => {
    await page.goto(story('default'));

    const diagrams = await disclose(page, 'Diagram: Collection 1');
    await diagrams.getByRole('menuitemradio', { name: 'Collection 2', exact: true }).click();
    const lone = await disclose(page, 'Active Graph: Echo');
    await expect(lone.getByRole('menuitem', { name: 'Delete Echo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.keyboard.press('Escape');

    const menu = await disclose(page, 'Active Graph: Echo');
    await menu.getByRole('menuitem', { name: 'New Graph' }).click();
    const created = await disclose(page, 'Active Graph: Graph 1');
    await created.getByRole('menuitem', { name: 'Delete Graph 1' }).click();
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText('Echo');
  },
);

/**
 * The Graph menu's one grouping grammar and its one address
 * (`.scratch/dock-menu-reorganisation/issues/01`): the Graph list, Colour…
 * on its own immediately after it, New Graph, Rename beside Copy link to
 * Graph, then Delete — one separator between each group. The application
 * writes the real within-Diagram product URL to the clipboard, and offers no
 * permanent address of the Graph's own.
 */
test(
  'the Graph menu groups its commands and copies only its within-Diagram address',
  { tag: '@parity:command-dock-copies-graph-destinations' },
  async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(story('default'));
    const diagram = commandDockSnapshot.document.diagrams?.[0];
    const graph = diagram?.graphs[0];
    if (diagram === undefined || graph === undefined) throw new Error('Missing fixture Graph');

    const menu = await disclose(page, 'Active Graph: Long');
    await expect(menu.getByRole('menuitem', { name: /^Copy permanent link/ })).toHaveCount(0);
    await expectMenuGroups(menu, [
      ['Long', 'Mid', 'Short'],
      ['Colour…'],
      ['New Graph'],
      ['Rename', 'Copy link to Graph'],
      ['Delete Long'],
    ]);

    await menu.getByRole('menuitem', { name: 'Copy link to Graph', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        `https://example.test${productDestinationPath({ kind: 'diagram-graph', spaceId: commandDockSnapshot.id, diagramId: diagram.id, graphId: graph.id })}`,
      );
  },
);

/**
 * The Space menu's own grouping grammar
 * (`.scratch/dock-menu-reorganisation/issues/02`): Rename beside Copy link to
 * Space, then Exit Space — one separator between the two groups. Reorganisation
 * only: the Space's own address is unchanged, and Exit still stays trailing and
 * disabled on Meta (`command-dock-edits-identity-names`,
 * `space-thing.spec.ts`'s Exit coverage).
 */
test('the Space menu groups Rename with Copy link to Space, then Exit Space', async ({ page }) => {
  await page.goto(story('default'));

  const menu = await disclose(page, 'Space: Rendering');
  await expectMenuGroups(menu, [['Rename', 'Copy link to Space'], ['Exit Space']]);
});

/**
 * The Space's own copied destination, exercised the way the Graph's is above:
 * the application writes the real product URL to the clipboard, and it is the
 * Space's own address rather than the drawing Diagram's
 * (`link-actions.spec.ts` holds the reason no second address is offered).
 */
test('Copy link to Space copies the Space’s own durable address', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(story('default'));

  const menu = await disclose(page, 'Space: Rendering');
  await menu.getByRole('menuitem', { name: 'Copy link to Space', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(
      `https://example.test${productDestinationPath({ kind: 'space', spaceId: commandDockSnapshot.id })}`,
    );
});

/**
 * The Thing rail's own grouping grammar
 * (`.scratch/dock-menu-reorganisation/issues/03`), reached through the real
 * production host: Create Reference on its own, both copy links beside each
 * other, then Remove from Diagram and Delete from Space sharing the trailing
 * destructive group — one separator between each. The Command Dock draws no
 * Thing commands of its own (ADR 0073); this is the rail's own menu.
 */
test('a Markdown Thing’s actions menu groups Create Reference, both copy links, then Remove and Delete', async ({
  page,
}) => {
  await page.goto(story('default'));

  const menu = await thingActions(page, 'Opening');
  await expectMenuGroups(menu, [
    ['Create Reference'],
    ['Copy link to Thing in Diagram', 'Copy link to Thing'],
    ['Remove from Diagram', 'Delete from Space'],
  ]);
});

/**
 * Present and unavailable on a Reference Thing (ADR 0070): the same grouping, with
 * Create Reference leading the menu greyed rather than absent — the row is where
 * the product says that referencing terminates.
 */
test('a Reference Thing’s actions menu keeps Create Reference leading, drawn unavailable', async ({
  page,
}) => {
  await page.goto(story('default'));

  const menu = await thingActions(page, 'Strategy overview');
  await expect(menu.getByRole('menuitem', { name: /^Create Reference/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expectMenuGroups(menu, [
    [/^Create Reference/],
    ['Copy link to Thing in Diagram', 'Copy link to Thing', 'Copy link to Target'],
    ['Remove from Diagram', 'Delete from Space'],
  ]);
});

/**
 * A Space Thing's own grouping grammar
 * (`.scratch/dock-menu-reorganisation/issues/04`), reached through the real
 * production host: Create Reference; Enter and Open in New Tab; the three copy
 * links; then Remove from Diagram and Delete from Space sharing the trailing
 * destructive group — one separator between each. Rename is absent — the
 * Title still edits on the Thing front, unchanged by this grouping.
 */
test('a Space Thing’s actions menu groups Create Reference, Enter, links, then Remove and Delete', async ({
  page,
}) => {
  await page.goto(story('default'));

  const menu = await thingActions(page, 'Design system');
  await expectMenuGroups(menu, [
    ['Create Reference'],
    ['Enter', 'Open in New Tab'],
    ['Copy link to Thing in Diagram', 'Copy link to Thing', 'Copy link to Space'],
    ['Remove from Diagram', 'Delete from Space'],
  ]);
});

/**
 * The name is the rename control, and there is no second surface to return the
 * caret to.
 *
 * The Sidebar shared one draft between an active row and a canvas header, which
 * is where `continuation.ts`'s `sidebar-row` target came from. The Dock draws
 * each name once, so the editor replaces the control it began from and hands
 * focus back to itself.
 */
test(
  'the Space, Diagram and Graph names each edit in place and keep a refusal on the field',
  { tag: '@parity:command-dock-edits-identity-names' },
  async ({ page }) => {
    await page.goto(story('default'));

    // **The Space first, because it is the identity that was a label.** It is one
    // Edit on this Space's own session, writing `document.title` and nothing
    // else: the four other Spaces this story has open are untouched, and the
    // Space Thing in the Opener that points here keeps its own Title (ADR 0083).
    // Visible-filtered for the reason every `getByTestId` here is — an inactive
    // open Space stays mounted and draws a Dock of its own.
    const spaceTitle = () => page.getByTestId('space-title').filter({ visible: true });
    await spaceTitle().click({ delay: 120 });
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const spaceName = page.getByRole('textbox', { name: 'Space name' });
    await expect(spaceName).toBeFocused();
    // Whitespace, not nothing: `spaceFileSchema` spells the title
    // `z.string().min(1)`, which counts characters, so this is the blank the
    // schema cannot see and the surface refuses on the trim.
    await spaceName.fill('   ');
    await spaceName.press('Enter');
    await expect(page.getByText('A Space needs a name.')).toBeVisible();
    await expect(spaceName).toBeVisible();
    await spaceName.fill('Atlas');
    await spaceName.press('Enter');
    await expect(spaceTitle()).toContainText('Atlas');
    // And the menu beside it names the Space the Edit wrote, from the same value.
    await expect(
      surface(page).getByRole('button', { name: 'Space: Atlas', exact: true }),
    ).toBeVisible();

    // Escape cancels the Space draft and hands the caret back to the name it was
    // begun from, which is the whole of the "no second surface" claim above.
    await spaceTitle().click({ delay: 120 });
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const cancelledSpace = page.getByRole('textbox', { name: 'Space name' });
    await cancelledSpace.fill('Ledger');
    await cancelledSpace.press('Escape');
    await expect(spaceTitle()).toContainText('Atlas');
    await expect(spaceTitle()).toBeFocused();

    await page.getByTestId('selected-canvas').filter({ visible: true }).click({ delay: 120 });
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const diagramName = page.getByRole('textbox', { name: 'Diagram name' });
    await expect(diagramName).toBeFocused();
    await diagramName.fill('');
    await diagramName.press('Enter');
    await expect(page.getByText('A Diagram needs a name.')).toBeVisible();
    // Refused and still open: the words the author typed are still theirs.
    await expect(diagramName).toBeVisible();
    await diagramName.fill('Workshop');
    await diagramName.press('Enter');
    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Workshop',
    );
    await expect(
      surface(page).getByRole('button', { name: 'Diagram: Workshop', exact: true }),
    ).toBeVisible();

    await page.getByTestId('active-graph').filter({ visible: true }).click({ delay: 120 });
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const graphName = page.getByRole('textbox', { name: 'Graph name' });
    await graphName.fill('Journey');
    await graphName.press('Escape');
    // Escape cancels the draft rather than committing it.
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText('Long');

    await page.getByTestId('active-graph').filter({ visible: true }).click({ delay: 120 });
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    const again = page.getByRole('textbox', { name: 'Graph name' });
    await again.fill('Journey');
    await again.press('Enter');
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText(
      'Journey',
    );
  },
);

/**
 * Where the reader came from, and where the rest of the open set is.
 *
 * The bar names **one** step up rather than the full Traversal history — that
 * is the Dock's answer to width, and the Open Spaces menu is what makes it an
 * answer rather than an omission. Opener/Meta carries the approved OPEN mark;
 * ordinary Spaces carry cubes.
 */
test(
  'the bar names one Space back and discloses the rest of the open set',
  { tag: '@parity:command-dock-marks-the-space-one-crossing-up' },
  async ({ page }) => {
    await page.goto(story('default'));

    await expect(page.getByTestId('space-title').filter({ visible: true })).toContainText(
      'Rendering',
    );
    const opener = surface(page).getByRole('button', { name: 'Go to Design system' });
    await expect(opener).toBeVisible();
    // The mark contributes nothing to the name: the OPEN mark is `aria-hidden`, so
    // the control is named for the Space alone and the glyph carries the
    // relation to it.
    await expect(opener).toHaveAccessibleName('Go to Design system');
    await expect(opener).toContainText('Design system');
    await expect(opener.locator('[data-icon="parent"]')).toHaveAttribute('viewBox', '0 0 16 16');
    await expect(
      page.getByTestId('space-title').filter({ visible: true }).locator('[data-icon="space"]'),
    ).toBeVisible();

    const spaceName = page.getByTestId('space-title').filter({ visible: true });
    await expect(spaceName.getByRole('img')).toHaveCount(0);
    await expect(spaceName.locator('[title]')).toHaveCount(0);

    const menu = await disclose(page, 'Spaces. 5 open.');
    for (const title of ['Meta Space', 'Platform', 'Design system', 'Rendering', 'Traversal'])
      await expect(
        menu.getByRole('menuitemradio', { name: new RegExp(`^${title}`) }),
      ).toBeVisible();
    // Meta first, with the OPEN mark, and the tree the crossings make below it:
    // one drawn guide per crossing.
    await expect(menu.getByRole('menuitemradio').first()).toHaveAccessibleName('Meta Space');
    await expect(
      menu.getByRole('menuitemradio').first().locator('[data-icon="parent"]'),
    ).toBeVisible();
    for (const title of ['Platform', 'Design system', 'Rendering', 'Traversal'])
      await expect(
        menu
          .getByRole('menuitemradio', { name: new RegExp(`^${title}`) })
          .locator('[data-icon="space"]'),
      ).toBeVisible();
    for (const [title, depth] of [
      ['Meta Space', 0],
      ['Platform', 1],
      ['Design system', 2],
      ['Rendering', 3],
      ['Traversal', 1],
    ] as const)
      await expect(
        menu
          .getByRole('menuitemradio', { name: new RegExp(`^${title}`) })
          .locator('.command-dock__guide'),
      ).toHaveCount(depth);

    await menu.getByRole('menuitemradio', { name: /^Traversal/ }).click();
    await expect(page.getByTestId('space-title').filter({ visible: true })).toContainText(
      'Traversal',
    );
    const openSpaces = await disclose(page, 'Spaces. 5 open.');
    await openSpaces.getByRole('menuitemradio', { name: /^Meta Space/ }).click();
    const metaTitle = page.getByTestId('space-title').filter({ visible: true });
    await expect(metaTitle).toContainText('Meta Space');
    // The Space you are in draws the cube, Meta included; the OPEN mark is the
    // Spaces trigger's.
    await expect(metaTitle.locator('[data-icon="space"]')).toBeVisible();
    await expect(metaTitle.locator('[data-icon="parent"]')).toHaveCount(0);
    await expect(
      surface(page)
        .getByRole('button', { name: 'Spaces. 5 open.' })
        .locator('[data-icon="parent"]'),
    ).toBeVisible();
  },
);

/**
 * A vertical dock is a column of named rows, not a rail of glyphs.
 *
 * That is the whole reason `DockedLeft` is a second story rather than a second
 * component: the JSX is the same and the edge is the only difference, so what
 * has to hold is that nothing is withdrawn to fit the narrower box, and that the
 * disclosures open into the canvas rather than off the edge the dock is against.
 */
test(
  'a side-edge dock keeps every name and opens its menus into the canvas',
  { tag: '@parity:command-dock-keeps-its-names-on-a-side-edge' },
  async ({ page }) => {
    await page.goto(story('docked-left'));

    // The edge and not just the orientation: `right` is vertical too, and the
    // story reaches this slot by pressing the position menu, so an assertion
    // that cannot tell the two vertical edges apart would pass on either.
    await expect(dock(page)).toHaveAttribute('data-edge', 'left');
    await expect(surface(page)).toHaveAttribute('data-orientation', 'vertical');
    await expect(page.getByTestId('space-title').filter({ visible: true })).toContainText(
      'Rendering',
    );
    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Collection 1',
    );
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText('Long');
    await expect(surface(page).getByRole('button', { name: 'Things' })).toBeVisible();

    const menu = await disclose(page, 'Diagram: Collection 1');
    const frame = await dock(page).boundingBox();
    const popup = await menu.boundingBox();
    expect(frame).not.toBeNull();
    expect(popup).not.toBeNull();
    // **Away from the edge it is against, and measured as two facts.** The
    // comment here used to claim the menu's left edge clears the dock's right
    // edge, and the assertion beneath it compared against the dock's *left*
    // edge — so it passed for a menu drawn straight over the bar, and the claim
    // it described is not even true: Base UI aligns the popup to the trigger
    // inside the bar, so it starts a little inside the dock's outer edge.
    //
    // What "opens into the canvas" actually means is that it never runs off the
    // edge the dock is against, and that it extends past the dock rather than
    // staying within it. Both are asserted; either alone is satisfiable by a
    // placement the claim rules out.
    if (frame !== null && popup !== null) {
      expect(popup.x).toBeGreaterThanOrEqual(frame.x);
      expect(popup.x + popup.width).toBeGreaterThan(frame.x + frame.width);
    }
  },
);

/**
 * A newly created Space opens complete: one authored Diagram, selected, owning
 * one empty Active Graph (ADR 0018, ADR 0079, ADR 0080).
 *
 * `Diagram 1`, `Graph 1` and `New space` are the titles `newSpace()` mints, read
 * rather than supplied — which is the evidence that this is really that Space
 * and not a stand-in wearing the catalogue's label. The Dock names both rather
 * than leaving a cluster blank, and Present is unavailable because an empty
 * Graph has nothing to traverse.
 */
test(
  'Colour… recolours the Active Graph through the swatch picker',
  { tag: '@parity:command-dock-recolors-graph-through-swatch-picker' },
  async ({ page }) => {
    await page.goto(story('default'));

    const graphTitle = (
      await page.getByTestId('active-graph').filter({ visible: true }).innerText()
    ).trim();
    const present = surface(page).getByRole('button', { name: 'Present Long' });
    const presentSvg = present.locator('svg');
    const initialStroke = await presentSvg.evaluate((element) => getComputedStyle(element).stroke);

    const menu = await disclose(page, `Active Graph: ${graphTitle}`);
    await menu.getByRole('menuitem', { name: 'Colour…' }).click({ delay: 120 });
    const group = page.getByRole('radiogroup', { name: 'Graph colour' });
    await expect(group.getByRole('radio')).toHaveCount(20);
    await group.getByRole('radio', { name: 'Orange', exact: true }).click();
    await expect(group).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);

    const finalStroke = await presentSvg.evaluate((element) => getComputedStyle(element).stroke);
    expect(finalStroke).not.toBe(initialStroke);
    expect(finalStroke).toBe('rgb(255, 127, 14)');
  },
);

test(
  'a new Space names its initial Diagram and empty Graph and cannot present',
  { tag: '@parity:command-dock-names-a-new-spaces-initial-diagram-and-graph' },
  async ({ page }) => {
    await page.goto(story('new-space'));

    await expect(page.getByTestId('space-title').filter({ visible: true })).toContainText(
      'New space',
    );
    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Diagram 1',
    );
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toContainText(
      'Graph 1',
    );
    // `aria-disabled`, not the attribute: ADR 0073 keeps a toolbar item focusable
    // while it is unavailable so it announces itself rather than being drawn and
    // unreachable, and Base UI's `focusableWhenDisabled` defaults to `true`
    // inside a `Toolbar`.
    await expect(surface(page).getByRole('button', { name: 'Present Graph 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // Opened directly, so there is no Opener.
    await expect(surface(page).getByRole('button', { name: /^Go to / })).toHaveCount(0);
  },
);

/**
 * Meta is always one choice away, from every Space.
 *
 * The new Space is opened by its own address and Meta is not open. The bar is
 * `[∞ Spaces ⌄] [⬡ New space ⌄]`, and the menu still lists Meta first, by its
 * own title; choosing it opens Meta.
 */
test(
  'the Open Spaces menu lists Meta first and opens it from a Space opened directly',
  { tag: '@parity:command-dock-always-reaches-meta' },
  async ({ page }) => {
    await page.goto(story('new-space'));
    const spaceName = page.getByTestId('space-title').filter({ visible: true });
    await expect(spaceName).toContainText('New space');
    await expect(spaceName.locator('[data-icon="space"]')).toBeVisible();
    await expect(
      surface(page)
        .getByRole('button', { name: 'Spaces. 1 open.' })
        .locator('[data-icon="parent"]'),
    ).toBeVisible();

    const menu = await disclose(page, 'Spaces. 1 open.');
    const rows = menu.getByRole('menuitemradio');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toHaveAccessibleName('Meta Space');
    await expect(rows.first().locator('[data-icon="parent"]')).toBeVisible();
    await expect(rows.nth(1)).toHaveAccessibleName('New space');
    await expect(rows.nth(1).locator('[data-icon="space"]')).toBeVisible();

    await rows.first().click();
    await expect(spaceName).toContainText('Meta Space');
    await expect(spaceName.locator('[data-icon="space"]')).toBeVisible();
    await expect(surface(page).getByRole('button', { name: 'Spaces. 2 open.' })).toBeVisible();
  },
);

/**
 * Presenting removes the furniture rather than emptying it.
 *
 * The Sidebar withdrew authoring command by command, and its claim described
 * which items left a Diagram row's menu. There is no menu left to withdraw
 * anything from: the audience is left with the canvas and `PresentingChrome`.
 */
test(
  'presenting removes the whole command surface',
  { tag: '@parity:command-dock-withdraws-entirely-while-presenting' },
  async ({ page }) => {
    await page.goto(story('presenting'));

    await expect(page.locator('.react-flow__node:visible').first()).toBeVisible();
    await expect(dock(page)).toHaveAttribute('data-presenting', 'true');
    await expect(surface(page)).toBeHidden();
    await expect(page.getByTestId('space-title').filter({ visible: true })).toBeHidden();
    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toBeHidden();
  },
);

/**
 * The responsive story, which is this surface's own (ADR 0082).
 *
 * What it owes is **not** the Sheet's contract. A Sheet had to be dismissed
 * before a command's result could be seen, because it covered the canvas and
 * trapped focus; this surface never took the canvas away, so there is nothing to
 * dismiss and no dismissal to get right. What it owes is to fit — every cluster
 * keeps its name, its disclosure and its place in the roving order, reached by
 * scrolling the strip along the axis it already runs on.
 */
test(
  'at phone width every cluster stays named and reachable with nothing to dismiss',
  { tag: '@parity:command-dock-fits-a-narrow-container' },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(story('narrow'));

    // Capped to the container rather than to a breakpoint, so the dock never
    // exceeds the 390px box the story gives it.
    const frame = await dock(page).boundingBox();
    expect(frame).not.toBeNull();
    if (frame !== null) expect(frame.width).toBeLessThanOrEqual(390);

    const strip = surface(page);
    await expect(strip).toHaveAttribute('data-orientation', 'horizontal');

    // Nothing is withdrawn at a width: all four names are in the strip, and the
    // last of them is reached by scrolling it rather than by opening anything.
    await strip.getByRole('button', { name: 'Things' }).scrollIntoViewIfNeeded();
    for (const testId of ['space-title', 'selected-canvas', 'active-graph'])
      await expect(strip.getByTestId(testId)).toBeAttached();
    await expect(strip.getByRole('button', { name: 'Things' })).toBeVisible();
    await expect(strip.getByRole('button', { name: 'Create Markdown Thing' })).toBeVisible();

    // And a command runs from the strip with nothing dismissed first: the menu
    // opens over the canvas, the choice lands, and the strip is still there.
    const menu = await disclose(page, 'Diagram: Collection 1');
    await menu.getByRole('menuitemradio', { name: 'Collection 2' }).click();
    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Collection 2',
    );
    await expect(strip).toBeVisible();
  },
);

/**
 * Create Thing, as three peers rather than a disclosure.
 *
 * **The obligation is the press count.** The kind is chosen at creation, so
 * none of the three is a default and none is disclosed behind another — which
 * means one activation reaches any kind, and the cheapest one (`markdown`,
 * which completes its Edit on activation) is not charged for a choice it never
 * makes. A menu here read as one command and was three; three controls read as
 * three and are.
 *
 * Each is named for the kind it makes rather than for the set. The glyphs are
 * the same silhouettes the Things list and the canvas use for *what a Thing
 * is*, so the accessible name is what separates "make one of these" from "one
 * of these" — and it is asserted rather than assumed.
 *
 * They withdraw together, because `createDisabled` is one fact about the set:
 * a surface that greyed one kind and not another would be saying something the
 * application cannot mean.
 */
test(
  'Create offers both kinds as peers, each named for what it makes',
  { tag: '@parity:command-dock-creates-each-kind-in-one-press' },
  async ({ page }) => {
    await page.goto(story('default'));

    const strip = surface(page);
    for (const kind of ['Markdown Thing', 'Space Thing']) {
      const control = strip.getByRole('button', { name: `Create ${kind}` });
      await expect(control).toBeVisible();
      // Available, and reached without opening anything first — which is the
      // whole claim. A disclosed command would not be here to assert on.
      await expect(control).toHaveAttribute('aria-disabled', 'false');
    }

    // No disclosure stands in front of them: nothing in the cluster is a menu
    // trigger but the Things list itself.
    await expect(strip.getByRole('button', { name: 'Create Thing' })).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);

    // One group, so assistive technology announces the run once rather than two
    // unrelated commands after the Things trigger.
    await expect(strip.getByRole('group', { name: 'Create a Thing' })).toBeAttached();
    const createSpace = strip.getByRole('button', { name: 'Create Space Thing', exact: true });
    await expect(createSpace.locator('[data-icon="space"]')).toBeVisible();
    await createSpace.click();
    const title = page.getByRole('textbox', { name: 'Thing title' });
    await expect(title).toBeFocused();
    await title.press('Enter');
    await expect(
      page
        .locator('.react-flow__node:visible')
        .getByRole('img', { name: 'Space Thing', exact: true })
        .locator('[data-icon="space"]')
        .last(),
    ).toBeVisible();
  },
);

/**
 * The side-edge dock packs the Things cluster onto one row.
 *
 * **Things is the one cluster whose name is not a title**, so it is the one
 * that can give up the `1fr` track the others need: Space, Diagram and Graph
 * name entities the author renamed, and that track is what lets their names
 * take the slack and truncate instead of resizing the column. "Things" is a
 * fixed word, so the track held about 69px of nothing — and the three Create
 * commands are what it is spent on instead.
 *
 * Asserted as the obligation and not as a CSS value: the cluster is **one row**
 * (so it stands at its neighbours' height rather than three times it), and its
 * four glyphs sit on **one pitch** (so the trigger's chevron reads as the first
 * of four rather than as punctuation after the word). The alternative — three
 * verb tracks — would have stood empty on the other three rows.
 */
test(
  'a side-edge dock packs Things onto one row at its neighbours’ height',
  { tag: '@parity:command-dock-packs-things-onto-one-row' },
  async ({ page }) => {
    await page.goto(story('docked-left'));
    await expect(surface(page)).toHaveAttribute('data-orientation', 'vertical');

    const strip = surface(page);
    const things = strip.getByRole('group', { name: 'Things' });
    const graph = strip.getByRole('group', { name: 'Graph' });

    // One row: the cluster carrying the disclosure and both Creates is no taller
    // than the one carrying a name, a disclosure and Present. Left as loose
    // siblings the vertical column auto-places them onto a row each and this is
    // what fails.
    const thingsBox = await things.boundingBox();
    const graphBox = await graph.boundingBox();
    expect(thingsBox).not.toBeNull();
    expect(graphBox).not.toBeNull();
    if (thingsBox !== null && graphBox !== null)
      expect(Math.abs(thingsBox.height - graphBox.height)).toBeLessThanOrEqual(1);

    // One pitch: the chevron and both Creates are evenly spaced, so the
    // disclosure reads as the first of three glyphs. Centres rather than edges,
    // because the chevron is a 14px glyph inside a padded trigger and the
    // Creates are 14px glyphs inside 28px buttons.
    const centres = await strip.evaluate((root) => {
      const cluster = root.querySelector('[aria-label="Things"]');
      if (cluster === null) return [];
      const trigger = cluster.querySelector('[aria-label="Things"][class*="things-trigger"]');
      const glyphs = trigger === null ? [] : [...trigger.querySelectorAll('svg')];
      const chevron = glyphs.at(-1);
      // `button`, because the group wrapping the pair is itself labelled
      // "Create a Thing" and an attribute prefix match takes it as a third.
      const creates = [...cluster.querySelectorAll('button[aria-label^="Create "]')];
      return [chevron, ...creates]
        .filter((element): element is Element => element !== undefined)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2;
        });
    });
    expect(centres).toHaveLength(3);
    const pitches = centres.slice(1).map((centre, index) => centre - (centres[index] ?? 0));
    for (const pitch of pitches) expect(Math.abs(pitch - (pitches[0] ?? 0))).toBeLessThanOrEqual(1);
  },
);

/**
 * A failed commit on the Space you are looking at.
 *
 * `PersistenceNotice` unchanged — production's own standing `Alert`, its own
 * sentence, its own Retry — hung off the dock as a **sibling** of the toolbar
 * rather than an item in it. Status is not a command (ADR 0082), and a standing
 * `Alert` inside `role="toolbar"` is exactly that, so the assertion is on the
 * containment and not only on the words.
 */
test(
  'a retryable failure reports beside the toolbar and offers Retry',
  { tag: '@parity:command-dock-recovers-retryable-failure' },
  async ({ page }) => {
    await page.goto(story('save-failed'));

    const failure = page.getByTestId('persistence-failure');
    await expect(failure).toBeVisible();
    // **The sentence is the application's, not the transport's** (ADR 0057).
    // The story's failure carries `message: 'The space could not be reached.'`
    // and that string reaches no surface: `problem.detail` and a thrown
    // `Error`'s text are diagnostics, and `authoring-refusal.ts` owns what the
    // author reads, keyed by the stable code — here `network`.
    await expect(failure).toContainText('Your device could not reach the server.');
    // Beside, never inside.
    await expect(surface(page).getByTestId('persistence-failure')).toHaveCount(0);
    await expect(dock(page).getByTestId('persistence-failure')).toHaveCount(1);

    // The local work is still on the canvas behind it: a retryable failure
    // leaves it intact, so blocking the paper would overstate it.
    await expect(page.locator('.react-flow__node:visible').first()).toBeVisible();
    await expect(page.getByTestId('selected-canvas').filter({ visible: true })).toContainText(
      'Collection 1',
    );

    await surface(page)
      .getByRole('button', { name: /^Present / })
      .click();
    await expect(surface(page)).toBeHidden();
    await expect(failure).toBeVisible();
    await failure.getByRole('button', { name: 'Retry' }).click();
    await expect(failure).toBeHidden();

    // And there is no resting saving cue anywhere in the surface, in this story
    // or any other — the decision ticket `01` took.
    await expect(page.getByRole('button', { name: 'Saving changes' })).toHaveCount(0);
  },
);

/**
 * A rejection and a conflict, both `PersistenceControl`'s own `AlertDialog`
 * mounted unchanged.
 *
 * Portalled and owning the viewport, so neither needs placement and where the
 * dock is sitting is not part of either decision.
 */
test(
  'a permanent rejection explains itself and can be acknowledged',
  { tag: '@parity:command-dock-reports-permanent-rejection' },
  async ({ page }) => {
    await page.goto(story('save-rejected'));

    await expect(
      page.getByRole('alertdialog', { name: 'Changes couldn’t be saved' }),
    ).toBeVisible();
    // `forbidden`'s application-owned sentence, for the reason above: the
    // story's `message: 'Permission denied'` is the wire's and is never drawn.
    await expect(page.getByText('You do not have permission to save this space.')).toBeVisible();
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
  },
);

/**
 * A refused aggregate: a distinct persistence state from a permanent
 * rejection (`v1-release/17` criterion 2), drawn through the same one-sentence
 * dialog `PersistenceControl` gives every `Rejection`.
 */
test(
  'a refused aggregate explains itself as one sentence and can be acknowledged',
  { tag: '@parity:command-dock-reports-aggregate-refusal' },
  async ({ page }) => {
    await page.goto(story('save-refused'));

    await expect(
      page.getByRole('alertdialog', { name: 'Changes couldn’t be saved' }),
    ).toBeVisible();
    // The application's translation of `ordinary-space-unreferenced`
    // (`authoring-refusal.ts`), never the refusal's own kind or any id it
    // carries — the surface names neither (the 9 September 2026 decision).
    await expect(
      page.getByText('A space would be left with nothing pointing at it.'),
    ).toBeVisible();
    await expect(page.getByText(/ordinary-space-unreferenced/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
  },
);

test(
  'a revision conflict blocks dismissal until local or stored work is chosen',
  { tag: '@parity:command-dock-resolves-conflict' },
  async ({ page }) => {
    await page.goto(story('save-conflict'));

    const conflict = page.getByRole('alertdialog', { name: 'Changes conflict' });
    await expect(conflict).toBeVisible();
    await expect(conflict).toContainText(/unsaved text/i);
    await expect(conflict).toContainText(/open Thing/);
    await expect(conflict).toContainText(/Keep local and retry preserves/);
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep local and retry' })).toBeVisible();
    // Escape is withheld: a conflict has no safe dismissal, so the dialog owns
    // the viewport until one of the two answers is chosen.
    await page.keyboard.press('Escape');
    await expect(conflict).toBeVisible();

    // And choosing one ends it. Reload takes the stored work, which is the
    // answer that discards the local edits rather than the one that retries
    // them — either way the block is lifted by a choice and never by a
    // dismissal.
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(conflict).toBeHidden();
  },
);

/**
 * A Space that went wrong while the reader was somewhere else.
 *
 * The regression `OpenSpaces` did not have: the vertical tab strip this menu
 * replaced badged every open Space, and a list that says nothing makes a Space
 * whose commit failed look exactly like one that is fine. The row says *which*
 * and nothing else — the recovery belongs to that Space's own Dock, one press
 * away — and it says it in words rather than colour alone, through
 * `openSpaceStatusLabel`. The strip is deleted
 * (`.scratch/command-dock/issues/08`) and those words outlived it in
 * `packages/ui/src/open-space-status.ts`, which `unwellReport`
 * (`packages/app/src/dock-model.ts`) is what calls — this menu draws what that
 * answers.
 */
test(
  'the Open Spaces menu names which other open Space failed to commit',
  { tag: '@parity:command-dock-names-an-unwell-open-space' },
  async ({ page }) => {
    await page.goto(story('save-failed-elsewhere'));

    // The Space on the strip is well: the failure is one crossing up.
    await expect(page.getByTestId('space-title').filter({ visible: true })).toContainText(
      'Rendering',
    );
    await expect(page.getByTestId('persistence-failure').filter({ visible: true })).toHaveCount(0);

    // **Before anything is disclosed.** ADR 0082: a report you have to go and
    // find is not a report, so the bar carries the mark and says so in the
    // trigger's own name rather than in colour alone.
    const trigger = surface(page).getByRole('button', { name: /^Spaces\./ });
    await expect(trigger).toHaveAccessibleName(/needs attention/i);
    await expect(trigger.locator('[data-unwell]')).toBeVisible();

    // The name carries the count now, which is the announcement itself.
    const menu = await disclose(page, 'Spaces. 5 open, 1 needs attention.');
    const unwell = menu.getByRole('menuitemradio', { name: /^Design system/ });
    await expect(unwell).toContainText('Save failed');
    await expect(menu.getByRole('menuitemradio', { name: /^Rendering/ })).not.toContainText(
      'Save failed',
    );
    // No recovery here: the row is a way to a Space, not a place to repair one.
    await expect(menu.getByRole('menuitem', { name: 'Retry' })).toHaveCount(0);
  },
);

/**
 * The Dock docks to its **container's** edges, and the container is the
 * viewport-sized canvas — so every story is framed, and Ladle's own toolbar
 * would otherwise land on top of the surface under test. Proven by driving real
 * catalogue navigation while the story owns its own viewport.
 */
test('Command Dock stories are isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=space--command-dock--save-conflict');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();

  const storySearch = page.getByLabel('Search stories');
  await storySearch.fill('Zoom Control');
  await expect(storySearch).toHaveValue('Zoom Control');
  await page.getByRole('link', { name: 'Canvas' }).click();
  await expect(page).toHaveURL(/story=components--zoom-control--canvas/);

  await page.goto('/?story=space--command-dock--default');
  await expect(
    page.frameLocator('iframe').getByTestId('command-dock').filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Search stories')).toBeVisible();
});

/**
 * One treatment across the three names, and all three disclose.
 *
 * The Space used to be the exception here — a `<span>` wearing the Button box,
 * because there was no `renamed-space` Edit and a greyed name would have
 * advertised a command nobody could run. There is one now, so the three are one
 * composition: the typography is shared *and* so is the disclosure, and Rename
 * is a command in each list.
 */
test(
  'Dock identities share typography and each name discloses its list',
  { tag: '@parity:command-dock-identity-presentation' },
  async ({ page }) => {
    await page.goto(story('default'));
    const space = page.getByTestId('space-title').filter({ visible: true });
    const diagram = page.getByTestId('selected-canvas').filter({ visible: true });
    await expect(space).toBeVisible();
    await expect(diagram).toBeVisible();
    await expect(page.getByTestId('active-graph').filter({ visible: true })).toBeVisible();
    /**
     * **The three read in one frame, and that is the assertion rather than a
     * precaution.**
     *
     * The names share the Button's `transition-[color,…] duration-200`, so a colour
     * read while that transition is in flight is a point on it rather than a settled
     * value. Sampled one locator after another, the three land at different points
     * of the same animation and the run fails on two intermediate values neither
     * name ever rests at — a difference in *time* reported as a difference in
     * treatment. Under `failOnFlakyTests` a retry that passes still fails the run,
     * so waiting it out is not an option; reading them together removes the race
     * instead. They mount together with one duration from one value, so a shared
     * transition is shared at every frame of it, and a genuinely different colour
     * still differs.
     */
    // The visibility filter is inside the page rather than on a locator for the
    // same reason it is on the ones above: an inactive open Space stays mounted
    // and draws a hidden Dock carrying these same ids.
    const [reference, ...others] = await page
      .locator(
        '[data-testid="space-title"], [data-testid="selected-canvas"], [data-testid="active-graph"]',
      )
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.checkVisibility())
          .map((element) => {
            const style = getComputedStyle(element);
            return [
              style.fontFamily,
              style.fontSize,
              style.fontWeight,
              style.lineHeight,
              style.color,
            ];
          }),
      );
    expect(others).toHaveLength(2);
    for (const identity of others) expect(identity).toEqual(reference);
    // One control, named the way the other two are. A count rather than a
    // visibility check because the story keeps four other Spaces mounted, and
    // `getByRole` is what excludes theirs: an inactive Space's Dock is hidden
    // and so out of the accessibility tree, while `getByTestId` above still
    // finds it and needs the visible filter.
    await expect(page.getByRole('button', { name: /^Space:/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Diagram:/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Active Graph:/ })).toHaveCount(1);
    await diagram.click({ delay: 120 });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(diagram).toBeFocused();
    // And the Space's, because the caret coming back is the half of this claim
    // that the identity which used to be a label had no way to owe.
    await space.click({ delay: 120 });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('textbox', { name: 'Space name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(space).toBeFocused();
    const graph = page.getByTestId('active-graph').filter({ visible: true });
    await graph.click({ delay: 120 });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('textbox', { name: 'Graph name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(graph).toBeFocused();
  },
);
