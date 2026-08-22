// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { expect, test, type Page } from './fixtures';
import {
  activateGraph,
  activeCard,
  authoringHandle,
  connectHandles,
  nodeByTitle,
  selectCanvas,
  settled,
  viewportTransform,
} from './graph';

// Presenting is the graph canvas under camera control (ADR 0027): the same
// cards, the same coordinates, drawn close enough that one fills the screen.
// These tests assert that — that the space is still there, that the camera
// moved, and that traversal follows Edges rather than an index.
//
// The fixture's graphs are all lines (see fixture/README.md), which is the
// degenerate graph rather than a second kind. A fork is therefore *authored*
// here, through the real Edge Authoring surface, rather than declared: every
// test owns a fresh memory repository, so the second outgoing Edge one test
// draws leaves the tracked fixture and every other test exactly as they were.

/** The camera, read off React Flow's viewport transform. */
async function camera(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  const transform = await viewportTransform(page);
  const [, x, y, zoom] = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/.exec(
    transform,
  ) ?? ['', '0', '0', '1'];
  return { x: Number(x), y: Number(y), zoom: Number(zoom) };
}

/**
 * Present the fixture and wait until the camera has arrived.
 *
 * The chrome appearing is not arrival — it renders as soon as presenting starts,
 * while the camera is still moving. Every caller here assumes the destination,
 * and one of them acted on the way there: at the overview zoom the whole space is
 * on screen, at the presenting zoom one card fills it, so a click aimed at any
 * other card hit or missed depending on how far the animation had run. That
 * failed about half the time.
 */
async function present(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await settled(page);
}

test('traverses the graph, and the space is still what you are looking at', async ({ page }) => {
  await present(page);

  // No second surface (ADR 0027): every card is still drawn, on the same canvas.
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);

  // Long starts at A — the card no edge arrives at, not the first in any list.
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000002');

  await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000003');

  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000002');
});

test('the active card draws its content rendered, and only that card does', async ({ page }) => {
  await present(page);

  // Opening shows Markdown source (ADR 0011); presenting is the other half of
  // that distinction and is where a card is drawn *rendered*. A's body carries
  // `**A**`, so the markers must be gone and the emphasis present.
  const content = page.getByTestId('card-content');
  await expect(content).toHaveCount(1);
  await expect(content).not.toContainText('**A**');
  await expect(content.locator('strong')).toHaveText('A');

  // Content is not embedded in every node (ADR 0006) — the other nine still draw
  // their titles. Counted inside the nodes: the Alt-drop preview draws the same
  // `CanvasCard`, so an unscoped count would include a Card that does not exist.
  await expect(page.locator('.react-flow__node').getByTestId('card')).toHaveCount(9);
});

test('a body heading is just a heading, drawn once alongside the title (ADR 0020)', async ({
  page,
}) => {
  await present(page);

  // C's body opens with `# Where Short ends`. A card is one file, so its title
  // and its body live together and a leading heading cannot repeat a title held
  // elsewhere. TraversalHistory A → B → C.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000005');

  const content = page.getByTestId('card-content');
  await expect(content.locator('.card__title')).toHaveText('C');
  await expect(content.locator('h1')).toHaveText('Where Short ends');
  await expect(content.locator('h1')).toHaveCount(1);

  // Sized in container units against the 260px frame the camera magnifies, not
  // in pixels against a box about to be scaled by an arbitrary factor (ADR
  // 0027). 5cqw of 260px is 13px; `.card--full .card__title`'s fixed 1.3rem has
  // the same specificity, so the two are separated only by their order in
  // `styles.css` and this is what says which order that has to be.
  await expect(content.locator('.card__title')).toHaveCSS('font-size', '13px');
});

test('the camera closes in on the active card, and pulls back on exit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);

  const overview = await camera(page);
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await settled(page);

  // One card filling the screen is a much closer zoom than the whole space
  // fitted — the camera is the entire difference between the two views.
  const presenting = await camera(page);
  expect(presenting.zoom).toBeGreaterThan(overview.zoom * 2);

  // Traversing moves the camera without changing how close it is.
  await page.keyboard.press('ArrowRight');
  await settled(page);
  const next = await camera(page);
  expect(next.zoom).toBeCloseTo(presenting.zoom, 1);
  expect(Math.abs(next.x - presenting.x)).toBeGreaterThan(10);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('presenting-chrome')).toBeHidden();
  await settled(page);
  expect((await camera(page)).zoom).toBeCloseTo(overview.zoom, 1);
});

test(
  'the chrome names the moves available, and says when the graph ends',
  {
    tag: [
      '@parity:space-sidebar-withdraws-authoring-while-presenting',
      '@parity:presenting-line-offers-one-move',
    ],
  },
  async ({ page }) => {
    await present(page);
    await expect(page.getByRole('button', { name: 'Add Card' })).toBeDisabled();
    await expect(page.getByTestId('exit-presenting-button')).toBeVisible();

    // A line gives a one-member choice at each card — the degenerate fork, not a
    // second mode (ADR 0024).
    const moves = page.getByTestId('presenting-moves').getByRole('button');
    await expect(moves).toHaveCount(1);
    await expect(moves).toHaveText('B');
    // The control says what it does, not where it would land: the selected move
    // is the one that commits.
    await expect(moves).toHaveAccessibleName('Go to B');
    await expect(page.getByTestId('presenting-keys').getByRole('listitem')).toHaveText([
      '→go',
      'Escoverview',
    ]);

    // Long is A → B → C → D → A′: four moves, then a sink.
    for (const _ of [0, 1, 2, 3]) await page.keyboard.press('ArrowRight');
    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-00000000000c',
    );
    await expect(page.getByTestId('presenting-end')).toBeVisible();

    // Advancing past the end stays put rather than wrapping to the start, which is
    // what a sequence would do.
    await page.keyboard.press('ArrowRight');
    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-00000000000c',
    );
  },
);

/**
 * No pointer gesture on a Card's body opens it (ADR 0036), and presenting does
 * not make an exception. It holds twice over, and the two are worth separating
 * because only the second is ours.
 *
 * React Flow makes a node inert when it is neither selectable nor draggable and
 * carries none of its own pointer handlers (`hasPointerEvents` in `NodeWrapper`).
 * All of those are off while presenting, so a Card is `pointer-events: none` and
 * the pane takes the click — a real click cannot reach a Card at all, which is
 * why aiming one here is not a thing to work around.
 *
 * The second assertion is what survives if that ever changes: the event is
 * dispatched straight to the element, past `pointer-events` and past the
 * viewport requirement a real click has, and still nothing opens. Both Cards
 * get it, because at the presenting zoom the active one fills the screen and
 * every other one is far outside it — which was the flake, not a detail: this
 * test used to aim a forced click at a Card that was only in the viewport while
 * the camera was still moving, and failed about half the time.
 */
test('clicking a card while presenting does not open a reading panel', async ({ page }) => {
  await present(page);

  await expect(activeCard(page)).toHaveCSS('pointer-events', 'none');
  await expect(nodeByTitle(page, 'E')).toHaveCSS('pointer-events', 'none');

  await activeCard(page).dispatchEvent('click');
  await nodeByTitle(page, 'E').dispatchEvent('click');

  await expect(page.getByTestId('open-card')).toHaveCount(0);
});

test('returning to the overview restores the space and its gestures', async ({ page }) => {
  await present(page);
  await page.getByTestId('exit-presenting-button').click();

  await expect(page.getByTestId('presenting-chrome')).toHaveCount(0);
  // No card is active, so every node is back to drawing its title.
  await expect(activeCard(page)).toHaveCount(0);
  await expect(page.locator('.react-flow__node').getByTestId('card')).toHaveCount(10);

  // Opening works again — through the Card's own control, which is the only
  // pointer graph to it (ADR 0036, 0037).
  const b = nodeByTitle(page, 'B');
  await b.hover();
  await b.getByRole('button', { name: 'Edit Card B' }).click();
  await expect(page.getByTestId('open-card')).toBeVisible();
});

/**
 * A focused control and the global Traversal keys, on one press.
 *
 * A button activates itself on Space and the window listener sees the press
 * first. Advancing there as well moved two Cards for one press, and preventing
 * the default instead stopped the button firing at all — so landing on C is the
 * first defect, staying on A is the second, and B is the answer.
 */
test(
  'Space on a focused move activates that control exactly once',
  { tag: '@parity:presenting-space-activates-one-control-once' },
  async ({ page }) => {
    await present(page);

    await page.getByRole('button', { name: 'Go to B' }).focus();
    await page.keyboard.press('Space');

    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000003',
    );
    // And the command owes focus, because it destroyed the control that ran it.
    await expect(page.getByRole('button', { name: 'Go to C' })).toBeFocused();

    // Arrow keys are nobody's native activation, so they stay global and still
    // reach a presenter whose focus is on a chrome control.
    await page.keyboard.press('ArrowLeft');
    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000002',
    );
  },
);

/**
 * Entering presentation with the pointer, then advancing with Space.
 *
 * The Sidebar's Present button is the one DOM node that relabels to Overview, so
 * React keeps focus on it across the click. Left there, the presenter holds the
 * control that *leaves* — and Space, which advances, defers to whatever has
 * focus, so the first press dropped straight back to the overview. The chrome
 * claims focus as it mounts, so the press reaches the move it is aimed at.
 */
test('Space advances on the first press after entering with the pointer', async ({ page }) => {
  await present(page);

  // Claimed by the chrome rather than left on the control that entered.
  await expect(page.getByRole('button', { name: 'Go to B' })).toBeFocused();

  await page.keyboard.press('Space');

  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000003');
});

/**
 * The same deference, on a control the chrome does not own.
 *
 * The rule is about interactive controls rather than about one button, and the
 * Sidebar's Overview is the other one a presenter can be focused on. Had the
 * global handler taken this press it would have called `preventDefault`, the
 * button would never have activated, and the traversal would have advanced
 * instead — so the chrome being gone is the whole proof.
 */
test('Space on the Sidebar Overview leaves presentation rather than advancing', async ({
  page,
}) => {
  await present(page);

  await page.getByTestId('exit-presenting-button').focus();
  await page.keyboard.press('Space');

  await expect(page.getByTestId('presenting-chrome')).toHaveCount(0);
  await expect(page.getByTestId('present-button')).toBeVisible();
});

/**
 * The end of the Graph, and the way back out of it.
 *
 * Back is the same Navigation operation Arrow Left performs, exposed to pointer
 * and assistive-technology users rather than added beside it — which is why the
 * Card it recovers is the one the arrow key would have.
 */
test(
  'a sink announces the end of the Graph and Back recovers the Card before it',
  { tag: '@parity:presenting-sink-ends-the-graph-and-can-retreat' },
  async ({ page }) => {
    await present(page);

    // Long is A → B → C → D → A′: four moves, then a sink.
    for (const _ of [0, 1, 2, 3]) await page.keyboard.press('ArrowRight');
    const announced = page.getByTestId('presenting-choices');
    await expect(announced).toHaveAttribute('aria-live', 'polite');
    await expect(announced).toContainText('End of Graph');
    await expect(page.getByTestId('presenting-moves')).toHaveCount(0);
    await settled(page);

    await page.getByRole('button', { name: 'Back' }).click();

    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000006',
    );
    await expect(page.getByRole('button', { name: 'Go to A′' })).toBeFocused();
  },
);

/**
 * A fork, authored rather than declared.
 *
 * The tracked fixture's Graphs are deliberately all lines, and this test must
 * not change that — so it draws the second outgoing Edge itself, through the
 * Edge Authoring surface an author uses, in the memory repository this test
 * owns. `Short` runs A → B → C, so an authored A → C makes A the fork: two ways
 * on from the Card the traversal begins at.
 *
 * What it proves that a story cannot: the camera. Choosing a branch selects it
 * and moves nothing, because the Card being presented has not changed (ADR
 * 0044); committing is what moves.
 */
test(
  'an authored fork offers both moves, selects without moving and commits down the one chosen',
  { tag: '@parity:presenting-fork-selects-then-commits' },
  async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
    await settled(page);

    // An authored Layout, so the Edge joins a Graph that already holds one out
    // of A rather than the empty Graph a conversion would mint (ADR 0045).
    await selectCanvas(page, 'Collection 1');
    await activateGraph(page, 'Short');
    await settled(page);

    const a = nodeByTitle(page, 'A').first();
    const c = nodeByTitle(page, 'C').first();
    await a.hover();
    await connectHandles(
      page,
      authoringHandle(a, 'source', 'right'),
      authoringHandle(c, 'target', 'top'),
    );
    // Attached rather than visible: A and C sit on the same row of this Layout,
    // so the Edge is a flat line whose box has no height — which Playwright
    // reads as hidden.
    await expect(page.getByLabel(/^Edge from A to C in Short$/)).toBeAttached();
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await settled(page);

    await page.getByTestId('present-button').click();
    await expect(page.getByTestId('presenting-chrome')).toBeVisible();
    await settled(page);

    const moves = page.getByTestId('presenting-moves').getByRole('button');
    await expect(moves).toHaveText(['B', 'C']);
    await expect(moves.first()).toHaveAccessibleName('Go to B');
    await expect(moves.last()).toHaveAccessibleName('Choose C');
    const beforeChoosing = await camera(page);

    await page.getByRole('button', { name: 'Choose C' }).click();

    // Selecting is the whole of what that click did: the verbs swap, the Card
    // being presented is still A, and the camera has not moved.
    await expect(moves.first()).toHaveAccessibleName('Choose B');
    await expect(moves.last()).toHaveAccessibleName('Go to C');
    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000002',
    );
    expect(await camera(page)).toEqual(beforeChoosing);

    await page.getByRole('button', { name: 'Go to C' }).click();

    // Committed down the Edge chosen, and not down the one the traversal opened
    // on.
    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000005',
    );
    await settled(page);
    expect((await camera(page)).x).not.toBe(beforeChoosing.x);
  },
);

/**
 * The chrome at a phone width, where the Space Sidebar is a Sheet and the
 * canvas — and so the chrome — has the whole viewport.
 *
 * The primary Traversal choices stay choices: their own full-width row, not a
 * menu, and not a block wrapped over the Card being presented.
 */
test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * The Sidebar Sheet is a modal drawn *over* the canvas, and its trigger
   * survives into presentation — so it can be reopened mid-traversal. While it
   * is up it owns every key pressed inside it: one Escape dismisses the sheet
   * and leaves the traversal exactly where it was, rather than doing both.
   */
  test('a reopened Sidebar Sheet owns its own keys while presenting', async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
    await toggle.click();
    await page.getByTestId('present-button').click();
    await expect(page.getByTestId('presenting-chrome')).toBeVisible();
    await expect(page.getByTestId('space-sidebar')).toHaveCount(0);
    await settled(page);

    await toggle.click();
    await expect(page.getByTestId('space-sidebar')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('space-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('presenting-chrome')).toBeVisible();
    await expect(activeCard(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000002',
    );
  });

  test(
    'the choices keep their own row above Back, the guidance and Overview',
    { tag: '@parity:presenting-narrow-keeps-choices-and-controls' },
    async ({ page }) => {
      await page.goto('/');
      await expect(nodeByTitle(page, 'A').first()).toBeVisible();
      await settled(page);

      await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
      await page.getByTestId('present-button').click();
      await expect(page.getByTestId('presenting-chrome')).toBeVisible();
      // The Sheet is modal and covers the canvas, so nothing here is a fair
      // reading of the chrome until it is gone (ADR 0053).
      await expect(page.getByTestId('space-sidebar')).toHaveCount(0);
      await settled(page);

      // One move on, taken with the pointer, which is the affordance a narrow
      // screen actually has — and what puts Back beside the other two controls.
      await page.getByRole('button', { name: 'Go to B' }).click();
      await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();
      await settled(page);

      const choices = page.getByTestId('presenting-choices');
      const back = page.getByRole('button', { name: 'Back' });
      const overview = page.getByTestId('exit-presenting');
      const choicesBox = (await choices.boundingBox())!;
      const backBox = (await back.boundingBox())!;
      const overviewBox = (await overview.boundingBox())!;

      expect(backBox.y).toBeGreaterThanOrEqual(choicesBox.y + choicesBox.height);
      expect(overviewBox.y).toBeGreaterThanOrEqual(choicesBox.y + choicesBox.height);
      // Labels and touch targets intact — not glyphs, and not a toolbar row's
      // height.
      await expect(back).toHaveText('Back');
      await expect(overview).toHaveText('Overview');
      expect(backBox.height).toBeGreaterThanOrEqual(44);
      expect(overviewBox.height).toBeGreaterThanOrEqual(44);

      // The choices are still choices, and the guidance still lists what is
      // bound.
      await expect(page.getByTestId('presenting-moves').getByRole('button')).toHaveText(['C']);
      await expect(page.getByTestId('presenting-keys').getByRole('listitem')).toHaveText([
        '→go',
        '←back',
        'Escoverview',
      ]);

      // And what it lists is really bound at this width too.
      await page.keyboard.press('ArrowLeft');
      await expect(activeCard(page)).toHaveAttribute(
        'data-id',
        '00000000-0000-4000-8000-000000000002',
      );
    },
  );
});
