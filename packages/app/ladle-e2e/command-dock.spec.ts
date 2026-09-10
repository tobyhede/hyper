import { expect, test, type Page } from '@playwright/test';
import { productDestinationPath } from '@project/http';
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
const dock = (page: Page) => page.getByTestId('command-dock').locator('visible=true');

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
  // `exact`, because every identity draws its own name twice: `Diagram:
  // Collection 1` on the disclosure and `Rename Diagram: Collection 1` on the
  // control beside it, and a substring match resolves to both.
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

    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
      'Collection 1',
    );

    const menu = await disclose(page, 'Diagram: Collection 1');
    const chosen = menu.getByRole('menuitemradio', { name: 'Collection 1' });
    const other = menu.getByRole('menuitemradio', { name: 'Collection 2' });
    await expect(chosen).toHaveAttribute('aria-checked', 'true');
    await expect(other).toHaveAttribute('aria-checked', 'false');
    await expect(menu.getByRole('menuitemradio')).toHaveCount(2);

    await other.click();

    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
      'Collection 2',
    );
    // And the Graphs follow the Diagram that owns them (ADR 0040): `Echo` is
    // `Collection 2`'s only Graph, and `Long` belongs to the Diagram just left.
    await expect(page.getByTestId('active-graph').locator('visible=true')).toContainText('Echo');
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
 * Diagram with no Cards placed in it — the fixture writes the stored snapshot and
 * re-derives it through `loadSpaceSnapshot`, so an empty canvas here is an empty
 * authored Diagram and not a list that forgot to draw.
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

    // `Diagram 1` is what `nextDiagramTitle` mints over `Collection 1` and
    // `Collection 2` — the application's own numbering, not a word this test
    // chose.
    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
      'Diagram 1',
    );
    await expect(page.getByTestId('active-graph').locator('visible=true')).toContainText('Graph 1');
    await expect(nodes).toHaveCount(0);

    const reopened = await disclose(page, 'Diagram: Diagram 1');
    await expect(reopened.getByRole('menuitemradio')).toHaveCount(3);
  },
);

/**
 * The two addresses a Graph has, from the Graph's own menu.
 *
 * The fixture records the **kind** of destination each command built rather than
 * a name it invented, so what this presses is production's own decision about
 * which address is "the link" here and which is the permanent one.
 */
test(
  'the Graph menu builds the Diagram address and the Graph address separately',
  { tag: '@parity:command-dock-copies-graph-destinations' },
  async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(story('default'));
    const diagram = commandDockSnapshot.document.diagrams?.[0];
    const graph = diagram?.graphs[0];
    if (diagram === undefined || graph === undefined) throw new Error('Missing fixture Graph');

    const menu = await disclose(page, 'Active Graph: Long');
    await menu.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        `https://example.test${productDestinationPath({ kind: 'diagram', spaceId: commandDockSnapshot.id, diagramId: diagram.id })}`,
      );

    const reopened = await disclose(page, 'Active Graph: Long');
    await reopened.getByRole('menuitem', { name: 'Copy permanent link' }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        `https://example.test${productDestinationPath({ kind: 'graph', spaceId: commandDockSnapshot.id, graphId: graph.id })}`,
      );
  },
);

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
  'the Diagram and Graph names each edit in place and keep a refusal on the field',
  { tag: '@parity:command-dock-edits-identity-names' },
  async ({ page }) => {
    await page.goto(story('default'));

    await page.getByTestId('selected-canvas').locator('visible=true').click();
    const diagramName = page.getByRole('textbox', { name: 'Diagram name' });
    await expect(diagramName).toBeFocused();
    await diagramName.fill('');
    await diagramName.press('Enter');
    await expect(page.getByText('A Diagram needs a name.')).toBeVisible();
    // Refused and still open: the words the author typed are still theirs.
    await expect(diagramName).toBeVisible();
    await diagramName.fill('Workshop');
    await diagramName.press('Enter');
    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
      'Workshop',
    );
    await expect(
      surface(page).getByRole('button', { name: 'Diagram: Workshop', exact: true }),
    ).toBeVisible();

    await page.getByTestId('active-graph').locator('visible=true').click();
    const graphName = page.getByRole('textbox', { name: 'Graph name' });
    await graphName.fill('Journey');
    await graphName.press('Escape');
    // Escape cancels the draft rather than committing it.
    await expect(page.getByTestId('active-graph').locator('visible=true')).toContainText('Long');

    await page.getByTestId('active-graph').locator('visible=true').click();
    const again = page.getByRole('textbox', { name: 'Graph name' });
    await again.fill('Journey');
    await again.press('Enter');
    await expect(page.getByTestId('active-graph').locator('visible=true')).toContainText('Journey');
  },
);

/**
 * Where the reader came from, and where the rest of the open set is.
 *
 * The bar names **one** step up rather than the full Traversal history — that
 * is the Dock's answer to width, and the Open Spaces menu is what makes it an
 * answer rather than an omission. The parent step carries `ParentIcon`, the cube
 * `06` moved into `@project/ui` to lock the decision somewhere other than a
 * throwaway sheet; this is the consumer that gives it a check rather than a doc
 * comment.
 */
test(
  'the bar names one Space back and discloses the rest of the open set',
  { tag: '@parity:command-dock-marks-the-space-one-crossing-up' },
  async ({ page }) => {
    await page.goto(story('default'));

    await expect(page.getByTestId('space-title').locator('visible=true')).toContainText(
      'Rendering',
    );
    const parent = surface(page).getByRole('button', { name: 'Go to Design system' });
    await expect(parent).toBeVisible();
    // The mark contributes nothing to the name: the cube is `aria-hidden`, so
    // the control is named for the Space alone and the glyph carries the
    // relation to it.
    await expect(parent).toHaveAccessibleName('Go to Design system');
    await expect(parent).toContainText('Design system');
    // The cube specifically, not "an icon": `ParentIcon` says *containing*
    // where a chevron would say *above* and an arrow *back* (`icons.tsx`), and
    // `svg[aria-hidden]` is satisfied by any of the three.
    await expect(parent.locator('[data-icon="parent"]')).toBeVisible();

    const menu = await disclose(page, 'Spaces. 5 open.');
    for (const title of ['Meta Space', 'Platform', 'Design system', 'Rendering', 'Traversal'])
      await expect(
        menu.getByRole('menuitemradio', { name: new RegExp(`^${title}`) }),
      ).toBeVisible();

    await menu.getByRole('menuitemradio', { name: /^Traversal/ }).click();
    await expect(page.getByTestId('space-title').locator('visible=true')).toContainText(
      'Traversal',
    );
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

    await expect(surface(page)).toHaveAttribute('data-orientation', 'vertical');
    await expect(page.getByTestId('space-title').locator('visible=true')).toContainText(
      'Rendering',
    );
    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
      'Collection 1',
    );
    await expect(page.getByTestId('active-graph').locator('visible=true')).toContainText('Long');
    await expect(surface(page).getByRole('button', { name: 'Cards' })).toBeVisible();

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
  'a new Space names its initial Diagram and empty Graph and cannot present',
  { tag: '@parity:command-dock-names-a-new-spaces-initial-diagram-and-graph' },
  async ({ page }) => {
    await page.goto(story('new-space'));

    await expect(page.getByTestId('space-title').locator('visible=true')).toContainText(
      'New space',
    );
    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
      'Diagram 1',
    );
    await expect(page.getByTestId('active-graph').locator('visible=true')).toContainText('Graph 1');
    // `aria-disabled`, not the attribute: ADR 0073 keeps a toolbar item focusable
    // while it is unavailable so it announces itself rather than being drawn and
    // unreachable, and Base UI's `focusableWhenDisabled` defaults to `true`
    // inside a `Toolbar`.
    await expect(surface(page).getByRole('button', { name: 'Present Graph 1' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // Opened directly and never crossed out of, so the bar carries neither the
    // parent step nor the Open Spaces menu.
    await expect(surface(page).getByRole('button', { name: /^Go to / })).toHaveCount(0);
    await expect(surface(page).getByRole('button', { name: /open\.$/ })).toHaveCount(0);
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
    await expect(page.getByTestId('space-title').locator('visible=true')).toBeHidden();
    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toBeHidden();
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
    await strip.getByRole('button', { name: 'Cards' }).scrollIntoViewIfNeeded();
    for (const testId of ['space-title', 'selected-canvas', 'active-graph'])
      await expect(page.getByTestId(testId)).toBeAttached();
    await expect(strip.getByRole('button', { name: 'Cards' })).toBeVisible();
    await expect(strip.getByRole('button', { name: 'Create Card' })).toBeVisible();

    // And a command runs from the strip with nothing dismissed first: the menu
    // opens over the canvas, the choice lands, and the strip is still there.
    const menu = await disclose(page, 'Diagram: Collection 1');
    await menu.getByRole('menuitemradio', { name: 'Collection 2' }).click();
    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
      'Collection 2',
    );
    await expect(strip).toBeVisible();
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
    await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
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

test(
  'a revision conflict blocks dismissal until local or stored work is chosen',
  { tag: '@parity:command-dock-resolves-conflict' },
  async ({ page }) => {
    await page.goto(story('save-conflict'));

    const conflict = page.getByRole('alertdialog', { name: 'Changes conflict' });
    await expect(conflict).toBeVisible();
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
 * `packages/ui/src/open-space-status.ts`, so this menu is now their one
 * caller.
 */
test(
  'the Open Spaces menu names which other open Space failed to commit',
  { tag: '@parity:command-dock-names-an-unwell-open-space' },
  async ({ page }) => {
    await page.goto(story('save-failed-elsewhere'));

    // The Space on the strip is well: the failure is one crossing up.
    await expect(page.getByTestId('space-title').locator('visible=true')).toContainText(
      'Rendering',
    );
    await expect(page.getByTestId('persistence-failure').locator('visible=true')).toHaveCount(0);

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
    page.frameLocator('iframe').getByTestId('command-dock').locator('visible=true'),
  ).toBeVisible();
  await expect(page.getByLabel('Search stories')).toBeVisible();
});

test(
  'Dock identities share typography while the Space name remains a label',
  { tag: '@parity:command-dock-identity-presentation' },
  async ({ page }) => {
    await page.goto(story('default'));
    const space = page.getByTestId('space-title').locator('visible=true');
    const diagram = page.getByTestId('selected-canvas').locator('visible=true');
    await expect(space).toBeVisible();
    await expect(diagram).toBeVisible();
    const typography = await diagram.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.color];
    });
    for (const identity of [space, page.getByTestId('active-graph').locator('visible=true')]) {
      await expect(identity).toBeVisible();
      expect(
        await identity.evaluate((element) => {
          const style = getComputedStyle(element);
          return [
            style.fontFamily,
            style.fontSize,
            style.fontWeight,
            style.lineHeight,
            style.color,
          ];
        }),
      ).toEqual(typography);
    }
    await expect(page.getByRole('button', { name: /^Rename Space:/ })).toHaveCount(0);
    await diagram.click();
    await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(diagram).toBeFocused();
  },
);
