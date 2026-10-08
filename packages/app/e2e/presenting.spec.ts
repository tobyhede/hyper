// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { expect, test, type Locator, type Page } from './fixtures';
import {
  activateGraph,
  authoringHandle,
  boxOf,
  connectHandles,
  createResource,
  dock,
  dragBy,
  nodeByTitle,
  openResource,
  presentControl,
  presentedName,
  presentedResource,
  resourceControls,
  selectCanvas,
  settled,
  stage,
  stageBody,
  stageFrame,
  viewportTransform,
} from './graph';

// Presenting draws the Active Resource on its own Stage over an inert canvas
// (ADR 0123): one 16:9 frame, the largest that fits above the presenting
// chrome, drawing the Resource by kind and never by where or how it sits on the
// Map. These tests assert the Stage, that nothing on the canvas reaches the
// audience, and that traversal follows Edges rather than an index.
//
// The fixture's graphs are all lines (see fixture/README.md), which is the
// degenerate graph rather than a second kind. A fork is therefore *authored*
// here, through the real Edge Authoring surface, rather than declared: every
// test owns a fresh memory repository, so the second outgoing Edge one test
// draws leaves the tracked fixture and every other test exactly as they were.

/** Open the fixture, wait for the canvas to settle, and Present its Active Graph. */
async function present(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);
  await presentControl(page).click();
  await expect(stage(page)).toBeVisible();
}

/**
 * The frame is the largest 16:9 box that fits in the Stage above the chrome,
 * centred in that room, so the room it does not fill is letterboxing.
 */
async function expectFrameFillsTheRoom(page: Page): Promise<void> {
  const room = await boxOf(stage(page), 'the Stage');
  const chrome = await boxOf(page.getByTestId('presenting-chrome'), 'the presenting chrome');
  const frame = await boxOf(stageFrame(page), 'the Stage frame');
  const roomHeight = chrome.y - room.y;

  expect(frame.width / frame.height).toBeCloseTo(16 / 9, 2);
  expect(frame.y).toBeGreaterThanOrEqual(room.y - 0.5);
  expect(frame.y + frame.height).toBeLessThanOrEqual(chrome.y + 0.5);
  expect(frame.x).toBeGreaterThanOrEqual(room.x - 0.5);
  expect(frame.x + frame.width).toBeLessThanOrEqual(room.x + room.width + 0.5);
  // The largest that fits: it meets the room on one axis.
  expect(
    Math.min(Math.abs(frame.width - room.width), Math.abs(frame.height - roomHeight)),
  ).toBeLessThan(1);
  // Letterboxed: the room left over is shared equally on both sides.
  expect(Math.abs(frame.x + frame.width / 2 - (room.x + room.width / 2))).toBeLessThan(1);
  expect(Math.abs(frame.y + frame.height / 2 - (room.y + roomHeight / 2))).toBeLessThan(1);
}

/** Every box the Stage draws a Resource in, so two Resources can be compared. */
async function framing(page: Page) {
  const frame = await boxOf(stageFrame(page), 'the Stage frame');
  const resource = await boxOf(presentedResource(page), 'the presented Resource');
  const name = presentedName(page);
  const nameSize = await name.evaluate((heading) => getComputedStyle(heading).fontSize);
  return { frame, resource: { x: resource.x, y: resource.y, width: resource.width }, nameSize };
}

test('traverses the graph on the Stage, with the canvas still mounted behind it', async ({
  page,
}) => {
  await present(page);

  // The canvas stays mounted behind the Stage (ADR 0123).
  await expect(page.locator('.react-flow__node')).toHaveCount(6);

  // Long starts at A — the resource no edge arrives at, not the first in any list.
  await expect(presentedName(page)).toHaveText('A');

  await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('B');

  await page.keyboard.press('ArrowLeft');
  await expect(presentedName(page)).toHaveText('A');
});

test('the Stage draws the Resource’s Markdown rendered', async ({ page }) => {
  await present(page);

  // A's body carries `**A**`, so the markers must be gone and the emphasis present.
  const content = presentedResource(page);
  await expect(content).toHaveCount(1);
  await expect(content).not.toContainText('**A**');
  await expect(content.locator('strong')).toHaveText('A');
});

test('a body heading is just a heading, drawn once alongside the name (ADR 0020)', async ({
  page,
}) => {
  await present(page);

  // C's body opens with `# Where Short ends`. TraversalHistory A → B → C.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('C');

  const content = presentedResource(page);
  await expect(content.locator('h1')).toHaveText('Where Short ends');
  await expect(content.locator('h1')).toHaveCount(1);

  // Type is sized in container units against the frame, so the name scales with
  // whatever size the window gives the frame: 5cqw of its width.
  const frame = await boxOf(stageFrame(page), 'the Stage frame');
  const size = await presentedName(page).evaluate((heading) =>
    Number.parseFloat(getComputedStyle(heading).fontSize),
  );
  expect(size).toBeCloseTo(frame.width * 0.05, 0);
});

test(
  'the frame is the largest 16:9 box above the chrome, letterboxed',
  { tag: '@parity:stage-frames-the-largest-16-9-above-the-chrome' },
  async ({ page }) => {
    await present(page);
    await expectFrameFillsTheRoom(page);

    // Present takes the window fullscreen, and a fullscreen window cannot be
    // resized, so each other size is presented afresh.
    for (const size of [
      { width: 900, height: 900 },
      { width: 1600, height: 500 },
    ]) {
      await page.getByTestId('exit-presenting').click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await page.setViewportSize(size);
      await presentControl(page).click();
      await expect(stage(page)).toBeVisible();
      await expectFrameFillsTheRoom(page);
    }
  },
);

/**
 * Size and Open are the Map's (ADR 0122, ADR 0064), and neither reaches the
 * Stage: a Closed Resource, an Open one and one resized on the Map are framed
 * identically.
 */
test('a Closed, an Open and a resized Resource are framed identically', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await settled(page);

  // B Open at the size it has; C Open and then resized through the real control.
  await openResource(nodeByTitle(page, 'B').first(), 'B');
  const c = nodeByTitle(page, 'C').first();
  await openResource(c, 'C');
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveText('Persisted');
  await settled(page);
  const before = await c.evaluate((element) => element.getBoundingClientRect().width);
  await c.hover();
  const control = c.locator('.react-flow__resize-control.handle.bottom.right');
  const handle = await boxOf(control, 'the resize control');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + handle.height / 2 + 80, {
    steps: 6,
  });
  await page.mouse.up();
  await expect(persistence).toHaveText('Persisted');
  await expect
    .poll(() => c.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(before + 50);
  await settled(page);

  await presentControl(page).click();
  await expect(presentedName(page)).toHaveText('A');
  const closed = await framing(page);
  await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('B');
  const open = await framing(page);
  await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('C');
  const resized = await framing(page);

  expect(open).toEqual(closed);
  expect(resized).toEqual(closed);
});

/**
 * Nothing on the canvas reaches the audience (ADR 0123): the Stage covers it,
 * nothing on it takes focus, and the Stage itself offers no authoring.
 */
test('no authoring control is visible or reachable, and the canvas behind the Stage is not focusable', async ({
  page,
}) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  // Selected and Open going in, so its toolbar, its handles and its resize
  // control are all drawn on the canvas when Present is pressed.
  await openResource(a, 'A');
  await expect(a).toHaveClass(/selected/);
  await presentControl(page).click();
  await expect(stage(page)).toBeVisible();

  // Nothing authoring is drawn on the Stage.
  for (const control of [
    '.rf-resource-node__authoring-handle',
    '.react-flow__node-toolbar',
    '.react-flow__resize-control',
    '[contenteditable]',
  ]) {
    await expect(stage(page).locator(control)).toHaveCount(0);
  }
  await expect(stage(page).getByRole('textbox')).toHaveCount(0);

  // The Stage covers the canvas: whatever is under any point of the window is
  // the Stage's.
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('The page has no viewport.');
  const covered = await page.evaluate(
    ({ width, height }) => {
      const points: [number, number][] = [];
      for (const x of [1, width / 4, width / 2, (3 * width) / 4, width - 1])
        for (const y of [1, height / 4, height / 2, (3 * height) / 4, height - 1])
          points.push([x, y]);
      return points.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && hit.closest('.react-flow') === null;
      });
    },
    { width: viewport.width, height: viewport.height },
  );
  expect(covered, 'a point of the window reaches the canvas').toBe(true);

  // Nothing on the canvas takes focus, by Tab or by a script asking it to.
  for (let press = 0; press < 30; press += 1) {
    await page.keyboard.press('Tab');
    const onCanvas = await page.evaluate(
      () => document.activeElement?.closest('.react-flow') !== null,
    );
    expect(onCanvas, `Tab press ${press + 1} reached the canvas`).toBe(false);
  }
  const focusable = await page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('.react-flow__node');
    node?.focus();
    return document.activeElement === node;
  });
  expect(focusable).toBe(false);
});

/** A Reference Resource draws its own name over its Target's content (ADR 0070). */
test('a Reference Resource shows its own name over its Target’s content', async ({ page }) => {
  await present(page);

  // Long is A → B → C → D → A′, and A′ refers to A.
  for (const _ of [0, 1, 2, 3]) await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('A′');
  await expect(presentedResource(page).locator('strong')).toHaveText('A');
});

/** A Space Resource draws its name alone on the Stage, and no Map. */
test('a Space Resource shows its name only', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await selectCanvas(page, 'Linked Spaces');
  await settled(page);

  await presentControl(page).click();
  await expect(presentedName(page)).toHaveText('Presentation');
  await expect(presentedResource(page)).toHaveAttribute('data-content-kind', 'space');
  await expect(presentedResource(page).locator('.resource__body')).toHaveCount(0);
  await expect(stage(page).locator('.react-flow')).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  await expect(presentedName(page)).toHaveText('Deep dive');
});

/**
 * Overflowing content scrolls inside the frame rather than growing it, and the
 * arrow keys stay traversal while the scroll region has focus.
 */
test(
  'overflowing content scrolls inside the frame, and the arrow keys still traverse',
  { tag: '@parity:stage-scrolls-overflow-and-arrows-still-traverse' },
  async ({ page }) => {
    await present(page);
    // D is deliberately long. Long is A → B → C → D.
    for (const _ of [0, 1, 2]) await page.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('D');

    const body = stageBody(page);
    const scrollTop = () => body.evaluate((element) => element.scrollTop);
    const frameBefore = await boxOf(stageFrame(page), 'the Stage frame');
    expect(
      await body.evaluate((element) => element.scrollHeight > element.clientHeight),
      'D overflows the frame',
    ).toBe(true);

    // By wheel, over the frame.
    await page.mouse.move(
      frameBefore.x + frameBefore.width / 2,
      frameBefore.y + frameBefore.height / 2,
    );
    await page.mouse.wheel(0, 200);
    await expect.poll(scrollTop).toBeGreaterThan(0);
    const wheeled = await scrollTop();

    // By Page Down, with the scroll region focused.
    await body.focus();
    await page.keyboard.press('PageDown');
    await expect.poll(scrollTop).toBeGreaterThan(wheeled);
    const paged = await scrollTop();
    await page.keyboard.press('PageUp');
    await expect.poll(scrollTop).toBeLessThan(paged);

    // The frame did not grow to hold the content.
    expect(await boxOf(stageFrame(page), 'the Stage frame')).toEqual(frameBefore);

    // The arrow keys still traverse, and the next Resource starts at its top.
    await expect(body).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('A′');
    await expect.poll(scrollTop).toBe(0);
    await page.keyboard.press('ArrowLeft');
    await expect(presentedName(page)).toHaveText('D');
  },
);

/**
 * Leaving presenting returns the canvas exactly as it was before Present: the
 * camera never moved (ADR 0123).
 */
test.describe('leaving presenting leaves the canvas viewport as it was', () => {
  const leaves: readonly (readonly [string, (page: Page) => Promise<void>])[] = [
    ['Overview', (page) => page.getByTestId('exit-presenting').click()],
    ['Escape', (page) => page.keyboard.press('Escape')],
    // Back to the Resource before, then off the presentation altogether.
    [
      'the browser’s Back',
      async (page) => {
        await page.goBack();
        await expect(presentedName(page)).toHaveText('A');
        await page.goBack();
      },
    ],
  ];

  for (const [name, leave] of leaves) {
    test(`by ${name}`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.react-flow__node').first()).toBeVisible();
      await settled(page);
      // Panned off the opening fit, so a return to any fit is told apart.
      const pane = await boxOf(page.locator('.react-flow__pane'), 'the canvas pane');
      await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height - 40);
      await page.mouse.down();
      await page.mouse.move(pane.x + pane.width / 2 - 90, pane.y + pane.height - 70, { steps: 5 });
      await page.mouse.up();
      await settled(page);
      const before = await viewportTransform(page);

      await presentControl(page).click();
      await expect(stage(page)).toBeVisible();
      await page.keyboard.press('ArrowRight');
      await expect(presentedName(page)).toHaveText('B');

      await leave(page);
      await expect(stage(page)).toHaveCount(0);
      await settled(page);
      expect(await viewportTransform(page)).toBe(before);
    });
  }
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
    // Dock is furniture over the paper, so presenting removes the furniture and
    // there is no menu left to withdraw anything from. What the audience is
    // left with is the Stage and `PresentingChrome`, which carries the way out.
    await expect(page.getByTestId('command-dock')).toHaveAttribute('data-presenting', 'true');
    // **Hidden and still there**, which a role query cannot tell apart from
    // gone: `visibility: hidden` takes the toolbar out of the accessibility
    // tree, so `dock(page)` matches nothing and `toBeHidden()` is satisfied by
    // the absence rather than by the state. The frame is deliberately retained
    // to anchor the persistence report to the same slot, so the obligation is
    // that the surface is *attached* and not visible — and a CSS locator is
    // what can still see it.
    const surface = page.locator('.command-dock__surface');
    await expect(surface).toBeAttached();
    await expect(surface).toBeHidden();
    await expect(page.getByTestId('selected-canvas')).toBeHidden();
    await expect(page.getByTestId('exit-presenting')).toBeVisible();

    // A line gives a one-member choice at each resource — the degenerate fork, not a
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
    await expect(presentedName(page)).toHaveText('A′');
    await expect(page.getByTestId('presenting-end')).toBeVisible();

    // Advancing past the end stays put rather than wrapping to the start, which is
    // what a sequence would do.
    await page.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('A′');
  },
);

test('returning to the overview restores the space and its gestures', async ({ page }) => {
  await present(page);
  await page.getByTestId('exit-presenting').click();

  await expect(page.getByTestId('presenting-chrome')).toHaveCount(0);
  await expect(stage(page)).toHaveCount(0);
  await expect(page.locator('.react-flow__node').getByTestId('resource')).toHaveCount(6);

  // Opening works again — through the Resource's own control, which is the only
  // pointer graph to it (ADR 0036).
  await selectCanvas(page, 'Collection 1');
  // The control is on the Resource's toolbar, drawn while it is selected (ADR 0102).
  const b = await resourceControls(page, nodeByTitle(page, 'B'));
  await b.getByRole('button', { name: 'Open Resource B' }).click();
  await expect(b.getByRole('button', { name: 'Close Resource B' })).toBeVisible();
});

/**
 * A focused control and the global Traversal keys, on one press.
 *
 * A button activates itself on Space and the window listener sees the press
 * first. Advancing there as well moved two Resources for one press, and preventing
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

    await expect(presentedName(page)).toHaveText('B');
    // And the command owes focus, because it destroyed the control that ran it.
    await expect(page.getByRole('button', { name: 'Go to C' })).toBeFocused();

    // Arrow keys are nobody's native activation, so they stay global and still
    // reach a presenter whose focus is on a chrome control.
    await page.keyboard.press('ArrowLeft');
    await expect(presentedName(page)).toHaveText('A');
  },
);

/**
 * Entering presentation with the pointer, then advancing with Space.
 *
 * Space activates whatever has focus, so where focus lands on entering decides
 * what the first press does. The control that entered cannot keep it: presenting
 * hides the Dock's whole surface, so the button that was clicked is gone. The
 * chrome claims focus as it mounts, so the press reaches the move it is aimed at.
 */
test('Space advances on the first press after entering with the pointer', async ({ page }) => {
  await present(page);

  await expect(page.getByRole('button', { name: 'Go to B' })).toBeFocused();

  await page.keyboard.press('Space');

  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(presentedName(page)).toHaveText('B');
});

/**
 * The same deference, on the control that leaves rather than the one that moves.
 * Had the global handler taken this press it would have called `preventDefault`,
 * the button would never have activated, and the traversal would have advanced
 * instead — so the Stage being gone is the whole proof.
 */
test('Space on the presenting chrome exit control leaves presentation rather than advancing', async ({
  page,
}) => {
  await present(page);

  await page.getByTestId('exit-presenting').focus();
  await page.keyboard.press('Space');

  await expect(stage(page)).toHaveCount(0);
  await expect(presentControl(page)).toBeVisible();
});

/**
 * The end of the Graph, and the way back out of it.
 *
 * Back is the same Navigation operation Arrow Left performs, exposed to pointer
 * and assistive-technology users rather than added beside it — which is why the
 * Resource it recovers is the one the arrow key would have.
 */
test(
  'a sink announces the end of the Graph and Back recovers the Resource before it',
  { tag: '@parity:presenting-sink-ends-the-graph-and-can-retreat' },
  async ({ page }) => {
    await present(page);

    // Long is A → B → C → D → A′: four moves, then a sink.
    for (const _ of [0, 1, 2, 3]) await page.keyboard.press('ArrowRight');
    const announced = page.getByTestId('presenting-choices');
    await expect(announced).toHaveAttribute('aria-live', 'polite');
    await expect(announced).toContainText('End of Graph');
    await expect(page.getByTestId('presenting-moves')).toHaveCount(0);

    await page.getByRole('button', { name: 'Back' }).click();

    await expect(presentedName(page)).toHaveText('D');
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
 * on from the Resource the traversal begins at.
 */
test(
  'an authored fork offers both moves, selects without moving and commits down the one chosen',
  { tag: '@parity:presenting-fork-selects-then-commits' },
  async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await settled(page);

    // An authored Map whose Graph already holds an Edge out of A.
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
    // Attached rather than visible: A and C sit on the same row of this Map,
    // so the Edge is a flat line whose box has no height — which Playwright
    // reads as hidden.
    await expect(page.getByLabel(/^Edge from A to C in Short$/)).toBeAttached();
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await settled(page);

    await presentControl(page).click();
    await expect(stage(page)).toBeVisible();

    const moves = page.getByTestId('presenting-moves').getByRole('button');
    await expect(moves).toHaveText(['B', 'C']);
    await expect(moves.first()).toHaveAccessibleName('Go to B');
    await expect(moves.last()).toHaveAccessibleName('Choose C');

    await page.getByRole('button', { name: 'Choose C' }).click();

    // Selecting is the whole of what that click did: the verbs swap, and the
    // Resource being presented is still A.
    await expect(moves.first()).toHaveAccessibleName('Choose B');
    await expect(moves.last()).toHaveAccessibleName('Go to C');
    await expect(presentedName(page)).toHaveText('A');

    await page.getByRole('button', { name: 'Go to C' }).click();

    // Committed down the Edge chosen, and not down the one the traversal opened
    // on.
    await expect(presentedName(page)).toHaveText('C');
  },
);

/** The name's own line box, which a heading stretched to fill its room does not centre. */
async function textBox(heading: Locator) {
  return heading.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const { x, y, width, height } = range.getBoundingClientRect();
    return { x, y, width, height };
  });
}

/**
 * An Ur Resource on the canvas and then presented (ADR 0113).
 *
 * It has no content, so it offers no Open and draws its Title and nothing
 * else, and the traversal stops on it to draw its name alone, centred in the
 * frame as a title slide.
 */
test(
  'an Ur Resource offers no Open, draws its Title alone and presents its name only, centred',
  { tag: '@parity:stage-centres-a-title-slide' },
  async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await settled(page);

    // `Short` runs A → B → C, so an Edge from C makes the Ur Resource the
    // fourth stop.
    await selectCanvas(page, 'Collection 1');
    await activateGraph(page, 'Short');
    await settled(page);

    await createResource(page, 'Ur Resource');
    const title = page.getByRole('textbox', { name: 'Resource title' });
    await expect(title).toBeFocused();
    await title.fill('Title slide');
    await title.press('Enter');
    const ur = nodeByTitle(page, 'Title slide').first();
    await expect(ur.locator('.canvas-resource')).toHaveAttribute('data-kind', 'ur');
    await settled(page);

    // A new Resource lands at the centre of the view, which on this Map is over
    // C; moved clear of the row, each end's handles are reachable.
    await dragBy(page, ur, 0, 250);
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

    const c = nodeByTitle(page, 'C').first();
    await c.hover();
    await connectHandles(
      page,
      authoringHandle(c, 'source', 'right'),
      authoringHandle(ur, 'target', 'top'),
    );
    await expect(page.getByLabel(/^Edge from C to Title slide in Short$/)).toBeAttached();
    await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
    await settled(page);

    const controls = await resourceControls(page, ur);
    await expect(controls.getByRole('button', { name: /^Actions for Resource/ })).toBeVisible();
    await expect(controls.getByRole('button', { name: 'Open Resource Title slide' })).toHaveCount(
      0,
    );
    await expect(ur.locator('.canvas-resource')).toHaveAttribute('data-open', 'false');
    await expect(ur.locator('.canvas-resource__content')).toHaveCount(0);
    await expect(controls.getByRole('button', { name: 'Edit Resource Title slide' })).toHaveCount(
      0,
    );

    await presentControl(page).click();
    await expect(stage(page)).toBeVisible();
    for (const _ of [0, 1, 2]) await page.keyboard.press('ArrowRight');

    const slide = presentedResource(page);
    await expect(slide).toHaveAttribute('data-content-kind', 'ur');
    await expect(presentedName(page)).toHaveText('Title slide');
    await expect(slide.locator('.resource__body')).toHaveCount(0);

    // Centred on both axes in the frame.
    const frame = await boxOf(stageFrame(page), 'the Stage frame');
    const name = await textBox(presentedName(page));
    const tolerance = Math.max(2, frame.height / 100);
    expect(Math.abs(name.x + name.width / 2 - (frame.x + frame.width / 2))).toBeLessThanOrEqual(
      tolerance,
    );
    expect(Math.abs(name.y + name.height / 2 - (frame.y + frame.height / 2))).toBeLessThanOrEqual(
      tolerance,
    );
  },
);

/**
 * The presenting chrome at a phone width, where it has the whole viewport.
 *
 * Presenting removes the Dock, so at this width nothing is left over the Stage
 * to reopen or to take a keypress before the traversal does. The primary
 * Traversal choices stay choices: their own full-width row, not a menu.
 */
test.describe('at a phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('presenting leaves no command surface to reopen at a phone width', async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    await presentControl(page).click();
    await expect(stage(page)).toBeVisible();
    await expect(dock(page)).toBeHidden();
    await expectFrameFillsTheRoom(page);

    await page.keyboard.press('ArrowRight');
    await expect(presentedName(page)).toHaveText('B');

    // And Escape is the way out.
    await page.keyboard.press('Escape');
    await expect(stage(page)).toHaveCount(0);
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
      await expect(stage(page)).toBeVisible();
      await expect(dock(page)).toBeHidden();

      // One move on, taken with the pointer, which is the affordance a narrow
      // screen actually has — and what puts Back beside the other two controls.
      await page.getByRole('button', { name: 'Go to B' }).click();
      await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();

      const choices = page.getByTestId('presenting-choices');
      const back = page.getByRole('button', { name: 'Back' });
      const overview = page.getByTestId('exit-presenting');
      const choicesBox = await boxOf(choices, 'the choices');
      const backBox = await boxOf(back, 'Back');
      const overviewBox = await boxOf(overview, 'Overview');

      expect(backBox.y).toBeGreaterThanOrEqual(choicesBox.y + choicesBox.height);
      expect(overviewBox.y).toBeGreaterThanOrEqual(choicesBox.y + choicesBox.height);
      // Labels and touch targets intact — not glyphs, and not a toolbar row's
      // height.
      await expect(back).toHaveText('Back');
      await expect(overview).toHaveText('Overview');
      expect(backBox.height).toBeGreaterThanOrEqual(44);
      expect(overviewBox.height).toBeGreaterThanOrEqual(44);

      await expect(page.getByTestId('presenting-moves').getByRole('button')).toHaveText(['C']);
      await expect(page.getByTestId('presenting-keys').getByRole('listitem')).toHaveText([
        '→go',
        '←back',
        'Escoverview',
      ]);

      await page.keyboard.press('ArrowLeft');
      await expect(presentedName(page)).toHaveText('A');
    },
  );
});
