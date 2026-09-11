// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { expect, test, type Page } from './fixtures';
import {
  activateGraph,
  activeThing,
  authoringHandle,
  connectHandles,
  dock,
  nodeByTitle,
  presentControl,
  selectCanvas,
  settled,
  viewportTransform,
} from './graph';

// Presenting is the graph canvas under camera control (ADR 0027): the same
// things, the same coordinates, drawn close enough that one fills the screen.
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
 * on screen, at the presenting zoom one thing fills it, so a click aimed at any
 * other thing hit or missed depending on how far the animation had run. That
 * failed about half the time.
 */
async function present(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);
  await presentControl(page).click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await settled(page);
}

test('traverses the graph, and the space is still what you are looking at', async ({ page }) => {
  await present(page);

  // No second surface (ADR 0027): every thing is still drawn, on the same canvas.
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(9);

  // Long starts at A — the thing no edge arrives at, not the first in any list.
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000002',
  );

  await page.keyboard.press('ArrowRight');
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000003',
  );

  await page.keyboard.press('ArrowLeft');
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000002',
  );
});

test('the active thing draws its content rendered, and only that thing does', async ({ page }) => {
  await present(page);

  // Opening shows Markdown source (ADR 0011); presenting is the other half of
  // that distinction and is where a thing is drawn *rendered*. A's body carries
  // `**A**`, so the markers must be gone and the emphasis present.
  const content = page.getByTestId('thing-content');
  await expect(content).toHaveCount(1);
  await expect(content).not.toContainText('**A**');
  await expect(content.locator('strong')).toHaveText('A');

  // Content is not embedded in every node (ADR 0006) — the other five still draw
  // their titles. Counted inside the nodes: the Alt-drop preview draws the same
  // `CanvasThing`, so an unscoped count would include a Thing that does not exist.
  await expect(page.locator('.react-flow__node').getByTestId('thing')).toHaveCount(5);
});

test('a body heading is just a heading, drawn once alongside the title (ADR 0020)', async ({
  page,
}) => {
  await present(page);

  // C's body opens with `# Where Short ends`. A thing is one file, so its title
  // and its body live together and a leading heading cannot repeat a title held
  // elsewhere. TraversalHistory A → B → C.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000005',
  );

  const content = page.getByTestId('thing-content');
  await expect(content.locator('.thing__title')).toHaveText('C');
  await expect(content.locator('h1')).toHaveText('Where Short ends');
  await expect(content.locator('h1')).toHaveCount(1);

  // Sized in container units against the 260px frame the camera magnifies, not
  // in pixels against a box about to be scaled by an arbitrary factor (ADR
  // 0027). 5cqw of 260px is 13px; `.thing--full .thing__title`'s fixed 1.3rem has
  // the same specificity, so the two are separated only by their order in
  // `styles.css` and this is what says which order that has to be.
  await expect(content.locator('.thing__title')).toHaveCSS('font-size', '13px');
});

test('the camera closes in on the active thing, and pulls back on exit', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);

  const overview = await camera(page);
  await presentControl(page).click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await settled(page);

  // One thing filling the screen is a much closer zoom than the whole space
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
      '@parity:command-dock-withdraws-entirely-while-presenting',
      '@parity:presenting-line-offers-one-move',
    ],
  },
  async ({ page }) => {
    await present(page);
    // **The whole surface goes, rather than its commands one at a time.** The
    // Sidebar withdrew authoring item by item and this test named which items
    // left a Diagram row's menu; the Dock is furniture over the paper, so
    // presenting removes the furniture and there is no menu left to withdraw
    // anything from. What the audience is left with is the canvas and
    // `PresentingChrome`, which carries the way out.
    await expect(page.getByTestId('command-dock')).toHaveAttribute('data-presenting', 'true');
    // **Hidden and still there**, which a role query cannot tell apart from
    // gone: `visibility: hidden` takes the toolbar out of the accessibility
    // tree, so `dock(page)` matches nothing and `toBeHidden()` is satisfied by
    // the absence rather than by the state. The frame is deliberately retained
    // to anchor the persistence report to the same slot
    // (`command-dock.css:86-91`), so the obligation is that the surface is
    // *attached* and not visible — and a CSS locator is what can still see it.
    const surface = page.locator('.command-dock__surface');
    await expect(surface).toBeAttached();
    await expect(surface).toBeHidden();
    await expect(page.getByTestId('selected-canvas')).toBeHidden();
    await expect(page.getByTestId('exit-presenting')).toBeVisible();

    // A line gives a one-member choice at each thing — the degenerate fork, not a
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
    await expect(activeThing(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-00000000000c',
    );
    await expect(page.getByTestId('presenting-end')).toBeVisible();

    // Advancing past the end stays put rather than wrapping to the start, which is
    // what a sequence would do.
    await page.keyboard.press('ArrowRight');
    await expect(activeThing(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-00000000000c',
    );
  },
);

/**
 * No pointer gesture on a Thing's body opens it (ADR 0036), and presenting does
 * not make an exception. It holds twice over, and the two are worth separating
 * because only the second is ours.
 *
 * React Flow makes a node inert when it is neither selectable nor draggable and
 * carries none of its own pointer handlers (`hasPointerEvents` in `NodeWrapper`).
 * All of those are off while presenting, so a Thing is `pointer-events: none` and
 * the pane takes the click — a real click cannot reach a Thing at all, which is
 * why aiming one here is not a thing to work around.
 *
 * The second assertion is what survives if that ever changes: the event is
 * dispatched straight to the element, past `pointer-events` and past the
 * viewport requirement a real click has, and still nothing opens. Both Things
 * get it, because at the presenting zoom the active one fills the screen and
 * every other one is far outside it — which was the flake, not a detail: this
 * test used to aim a forced click at a Thing that was only in the viewport while
 * the camera was still moving, and failed about half the time.
 */
test('clicking a thing while presenting does not open it', async ({ page }) => {
  await present(page);

  await expect(activeThing(page)).toHaveCSS('pointer-events', 'none');
  await expect(nodeByTitle(page, 'D')).toHaveCSS('pointer-events', 'none');

  await activeThing(page).dispatchEvent('click');
  await nodeByTitle(page, 'D').dispatchEvent('click');

  await expect(page.getByRole('button', { name: /^Close Thing/ })).toHaveCount(0);
});

test('returning to the overview restores the space and its gestures', async ({ page }) => {
  await present(page);
  await page.getByTestId('exit-presenting').click();

  await expect(page.getByTestId('presenting-chrome')).toHaveCount(0);
  // No thing is active, so every node is back to drawing its title.
  await expect(activeThing(page)).toHaveCount(0);
  await expect(page.locator('.react-flow__node').getByTestId('thing')).toHaveCount(6);

  // Opening works again — through the Thing's own control, which is the only
  // pointer graph to it (ADR 0036, 0037).
  await selectCanvas(page, 'Collection 1');
  const b = nodeByTitle(page, 'B');
  await b.hover();
  await b.getByRole('button', { name: 'Open Thing B' }).click();
  await expect(b.getByRole('button', { name: 'Close Thing B' })).toBeVisible();
});

/**
 * A focused control and the global Traversal keys, on one press.
 *
 * A button activates itself on Space and the window listener sees the press
 * first. Advancing there as well moved two Things for one press, and preventing
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

    await expect(activeThing(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000003',
    );
    // And the command owes focus, because it destroyed the control that ran it.
    await expect(page.getByRole('button', { name: 'Go to C' })).toBeFocused();

    // Arrow keys are nobody's native activation, so they stay global and still
    // reach a presenter whose focus is on a chrome control.
    await page.keyboard.press('ArrowLeft');
    await expect(activeThing(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000002',
    );
  },
);

/**
 * Entering presentation with the pointer, then advancing with Space.
 *
 * Space activates whatever has focus, so where focus lands on entering decides
 * what the first press does. The control that entered cannot keep it: the Dock's
 * Present button carries a fixed `Present <Graph>` label rather than relabelling
 * to Stop, and presenting removes the whole Dock
 * (`.command-dock[data-presenting='true'] { display: none }`), so the button
 * that was clicked is gone rather than merely renamed. The chrome claims focus
 * as it mounts, so the press reaches the move it is aimed at rather than
 * deferring to a control that happened to hold focus.
 */
test('Space advances on the first press after entering with the pointer', async ({ page }) => {
  await present(page);

  // Claimed by the chrome rather than left on the control that entered.
  await expect(page.getByRole('button', { name: 'Go to B' })).toBeFocused();

  await page.keyboard.press('Space');

  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeThing(page)).toHaveAttribute(
    'data-id',
    '00000000-0000-4000-8000-000000000003',
  );
});

/**
 * The same deference, on the control that leaves rather than the one that moves.
 *
 * The rule is about interactive controls rather than about one button, and the
 * presenting chrome's own exit control — the `Overview` button
 * (`PresentingChrome.tsx`) — is the other one a presenter can be focused on. Had
 * the global handler taken this press it would have called `preventDefault`, the
 * button would never have activated, and the traversal would have advanced
 * instead — so the chrome being gone is the whole proof.
 */
test('Space on the presenting chrome exit control leaves presentation rather than advancing', async ({
  page,
}) => {
  await present(page);

  await page.getByTestId('exit-presenting').focus();
  await page.keyboard.press('Space');

  await expect(page.getByTestId('presenting-chrome')).toHaveCount(0);
  await expect(presentControl(page)).toBeVisible();
});

/**
 * The end of the Graph, and the way back out of it.
 *
 * Back is the same Navigation operation Arrow Left performs, exposed to pointer
 * and assistive-technology users rather than added beside it — which is why the
 * Thing it recovers is the one the arrow key would have.
 */
test(
  'a sink announces the end of the Graph and Back recovers the Thing before it',
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

    await expect(activeThing(page)).toHaveAttribute(
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
 * on from the Thing the traversal begins at.
 *
 * What it proves that a story cannot: the camera. Choosing a branch selects it
 * and moves nothing, because the Thing being presented has not changed (ADR
 * 0044); committing is what moves.
 */
test(
  'an authored fork offers both moves, selects without moving and commits down the one chosen',
  { tag: '@parity:presenting-fork-selects-then-commits' },
  async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await settled(page);

    // An authored Diagram, so the Edge joins a Graph that already holds one out
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
    // Attached rather than visible: A and C sit on the same row of this Diagram,
    // so the Edge is a flat line whose box has no height — which Playwright
    // reads as hidden.
    await expect(page.getByLabel(/^Edge from A to C in Short$/)).toBeAttached();
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await settled(page);

    await presentControl(page).click();
    await expect(page.getByTestId('presenting-chrome')).toBeVisible();
    await settled(page);

    const moves = page.getByTestId('presenting-moves').getByRole('button');
    await expect(moves).toHaveText(['B', 'C']);
    await expect(moves.first()).toHaveAccessibleName('Go to B');
    await expect(moves.last()).toHaveAccessibleName('Choose C');
    const beforeChoosing = await camera(page);

    await page.getByRole('button', { name: 'Choose C' }).click();

    // Selecting is the whole of what that click did: the verbs swap, the Thing
    // being presented is still A, and the camera has not moved.
    await expect(moves.first()).toHaveAccessibleName('Choose B');
    await expect(moves.last()).toHaveAccessibleName('Go to C');
    await expect(activeThing(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000002',
    );
    expect(await camera(page)).toEqual(beforeChoosing);

    await page.getByRole('button', { name: 'Go to C' }).click();

    // Committed down the Edge chosen, and not down the one the traversal opened
    // on.
    await expect(activeThing(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000005',
    );
    await settled(page);
    expect((await camera(page)).x).not.toBe(beforeChoosing.x);
  },
);

/**
 * The presenting chrome at a phone width, where it has the whole viewport.
 *
 * Presenting removes the Dock, so at this width nothing is left over the canvas
 * to reopen or to take a keypress before the traversal does. The primary
 * Traversal choices stay choices: their own full-width row, not a menu, and not
 * a block wrapped over the Thing being presented.
 */
test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * **The Sheet this described is gone (ADR 0082).**
   *
   * The Sidebar's phone branch was a modal over the canvas whose trigger
   * survived into a presentation, so it could be reopened mid-traversal and had
   * to own the keys pressed inside it — one Escape dismissed the sheet and left
   * the traversal where it was. The Dock has no Sheet and no trigger that
   * outlives the surface: presenting removes the whole thing, so there is
   * nothing to reopen and no key to arbitrate. What replaced the obligation is
   * `mobile-dock.spec.ts`, which holds the surface to fitting rather than to
   * dismissing.
   */
  test('presenting leaves no command surface to reopen at a phone width', async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    await presentControl(page).click();
    await expect(page.getByTestId('presenting-chrome')).toBeVisible();
    await expect(dock(page)).toBeHidden();
    await settled(page);

    // The traversal keys reach the canvas rather than a surface over it: there
    // is nothing left at this width to own a keypress before the presentation
    // gets it, which is the whole of what the Sheet's arbitration was for.
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('presenting-chrome')).toBeVisible();
    await expect(activeThing(page)).toHaveAttribute(
      'data-id',
      '00000000-0000-4000-8000-000000000003',
    );

    // And Escape is the way out, reaching the presentation for the same reason.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('presenting-chrome')).toHaveCount(0);
    await expect(dock(page)).toBeVisible();
  });

  test(
    'the choices keep their own row above Back, the guidance and Overview',
    { tag: '@parity:presenting-narrow-keeps-choices-and-controls' },
    async ({ page }) => {
      await page.goto('/');
      await expect(nodeByTitle(page, 'A').first()).toBeVisible();
      await settled(page);

      await presentControl(page).click();
      await expect(page.getByTestId('presenting-chrome')).toBeVisible();
      // Nothing covers the canvas: presenting removed the command surface, so
      // what is measured below is the presenting chrome alone (ADR 0082).
      await expect(dock(page)).toBeHidden();
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
      await expect(activeThing(page)).toHaveAttribute(
        'data-id',
        '00000000-0000-4000-8000-000000000002',
      );
    },
  );
});
