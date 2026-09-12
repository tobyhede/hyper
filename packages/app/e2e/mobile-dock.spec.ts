import { expect, test } from './fixtures';
import type { Route } from '@playwright/test';
import {
  activateGraph,
  boxOf,
  createThing,
  createThingControl,
  dock,
  diagramMenu,
  newDiagram,
  nodeByTitle,
  presentControl,
  selectCanvas,
  selectedCanvas,
  settled,
} from './graph';

/**
 * The app's chrome at phone width (ADR 0082).
 *
 * **This file replaced `mobile-sidebar.spec.ts`, and what it owes is a
 * different thing.** The Sidebar below its breakpoint was a modal Sheet drawn
 * over the canvas: it trapped focus and marked everything behind it inert, so
 * every command whose result was on the canvas had to dismiss it first, and
 * that dismissal contract was most of what the old file proved. All of it came
 * free from the registry `Sidebar` primitive, and ADR 0082 states the cost of
 * losing it plainly — *"The responsive story is now ours."*
 *
 * The Dock's answer is one constraint rather than a second arrangement. It never
 * takes the canvas away: it is furniture over it, it takes no layout space, and
 * at 390px it still covers a strip rather than a screen. So there is nothing to
 * dismiss and no dismissal to get right — what it owes is to **fit**, with every
 * cluster keeping its name, its disclosure and its place in the roving order.
 * Nothing is withdrawn at a breakpoint, which is what would make the phone a
 * different product.
 *
 * 390x844 is a phone. The suite's own project is a desktop, so this file is the
 * only place the narrow branch is exercised at all.
 */
test.use({ viewport: { width: 390, height: 844 } });

test(
  'every cluster keeps its name and its commands at phone width',
  { tag: '@parity:command-dock-fits-a-narrow-container' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    // Capped to the container it docks in rather than to a media query, so the
    // strip never exceeds the viewport it is furniture over. **Both edges**: a
    // width assertion alone passes a 380px strip sitting at x = 40, which
    // overflows by thirty and is exactly what "never exceeds the viewport"
    // means to a reader who cannot reach the end of the bar.
    const box = await page.getByTestId('command-dock').boundingBox();
    expect(box).not.toBeNull();
    if (box !== null) {
      expect(box.width).toBeLessThanOrEqual(390);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }

    // All four names, none of them withdrawn to fit.
    await expect(page.getByTestId('space-title')).toBeVisible();
    await expect(selectedCanvas(page)).toContainText('Collection 1');
    await expect(page.getByTestId('active-graph')).toBeVisible();
    await expect(dock(page).getByRole('button', { name: 'Things' })).toBeVisible();

    // And every disclosure still discloses. The Diagram menu is opened, a choice
    // is made, and the result is on the canvas with nothing dismissed in
    // between — which is the sentence the Sheet's contract used to be about.
    await selectCanvas(page, 'Collection 2');
    await expect(dock(page)).toBeVisible();
    await expect(page.getByTestId('active-graph')).toContainText('Echo');

    await selectCanvas(page, 'Collection 1');
    await activateGraph(page, 'Mid');
    await expect(dock(page)).toBeVisible();
  },
);

/**
 * A command whose result opens an editor on the canvas.
 *
 * This is the case the Sheet could not serve at all: the editor took focus as it
 * mounted and the Sheet's trap took it straight back, so Add Thing had to dismiss
 * before it could run. Here the strip is beside the result rather than over it,
 * and the caret lands where the author is looking.
 */
test('Create Thing from the strip names the new Thing on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createThing(page, 'Markdown Thing');

  const title = page.getByRole('textbox', { name: 'Thing title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Thing 1');
  await expect(dock(page)).toBeVisible();
});

/** The other kind, which mints its own Space and names both from one `Space N`. */
test('Create Space Thing from the strip names the new Thing on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createThing(page, 'Space Thing');

  const title = page.getByRole('textbox', { name: 'Thing title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(/^Space \d+$/);
  await expect(dock(page)).toBeVisible();
  await title.press('Escape');
  await settled(page);
});

/**
 * New Diagram at phone width, and the Delete that undoes it.
 *
 * Both are rows in the Diagram menu rather than a permanent control and a row
 * menu, which is the one thing the narrower box changed about them.
 */
test('New Diagram selects an empty authored Diagram, and Delete returns to the one before', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await newDiagram(page);
  await expect(selectedCanvas(page)).toContainText('Diagram 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

  // An empty Diagram reveals the Things list, which at this width overlays the
  // end of the strip — so it is dismissed before the next command rather than
  // reached around. That is the list's own contract and not the Dock's: a
  // surface the author opens is dismissed by the author.
  await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);

  const menu = await diagramMenu(page);
  await menu.getByRole('menuitem', { name: 'Delete Diagram 1' }).click();
  await expect(selectedCanvas(page)).toContainText('Collection 1');
});

/**
 * Delete reaching a Dock control leaves the selected Thing standing.
 *
 * React Flow subscribes its delete key on `document`, so a control beside the
 * canvas is inside that subscription and outside the canvas's own guard. Every
 * Dock control carries `nokey` for exactly this, and at phone width the strip is
 * the *only* chrome there is — so if the marker were ever dropped, this is where
 * a reader would lose a Thing to a keystroke meant for a menu.
 */
test('Delete on a Dock control leaves the selected Thing on the canvas', async ({ page }) => {
  await page.goto('/');
  const thing = nodeByTitle(page, 'A').first();
  await expect(thing).toBeVisible();
  await thing.click();

  await selectedCanvas(page).focus();
  await page.keyboard.press('Delete');

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await expect(thing).toBeVisible();
});

/**
 * Presenting removes the strip entirely and hands the keyboard to the canvas.
 *
 * The Sheet had to be dismissed before a presentation could be driven; the strip
 * is simply gone, and what is left is `PresentingChrome` and the canvas the
 * arrows reach.
 */
test('Present from the strip leaves the presentation reachable', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await presentControl(page).click();

  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.getByTestId('command-dock')).toHaveAttribute('data-presenting', 'true');
  await expect(dock(page)).toBeHidden();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.react-flow__node.rf-thing-node--active')).toHaveCount(1);
});

/**
 * The Graph menu at phone width, opened twice.
 *
 * At most one Dock disclosure is open at a time, and a press on a second trigger
 * while the first is up is an outside press Base UI spends on dismissing. That
 * is the one interaction rule the narrow strip makes easy to trip over, because
 * the triggers are close together — so it is asserted here rather than left to
 * the helper that works around it.
 */
test('one disclosure is open at a time', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await diagramMenu(page);
  await expect(page.getByRole('menu')).toHaveCount(1);

  // **The second trigger is pressed directly.** `disclose` dismisses whatever is
  // open before it clicks, which is the very behaviour under test — routed
  // through the helper, this asserted a state the helper had arranged and could
  // not have seen both menus open.
  await dock(page)
    .getByRole('button', { name: /^Active Graph: / })
    .click({ delay: 120 });
  await expect(page.getByRole('menu')).toHaveCount(1);
  await expect(page.getByRole('menu').getByRole('menuitemradio', { name: 'Long' })).toBeVisible();
});

/**
 * The standing persistence notice at phone width, beside a side-edge Dock.
 *
 * **This is the one piece of Dock furniture that is not the strip itself**, and
 * it is the piece that does not shrink with it. The frame caps to its container
 * so the bar always fits (the first test above), but the notice is absolutely
 * positioned *out* of that frame and hangs off the dock's inner side — so its
 * own width is spent from wherever the dock ends rather than from the edge of
 * the screen, and the cap the frame took says nothing about it.
 *
 * A side edge is the case that bites, because that is the orientation the Dock
 * keeps every cluster's name in: the column is the widest the strip ever is, and
 * the notice starts after all of it. The obligation is ADR 0082's — a failure
 * stays visible with Retry reachable — and the shell is `overflow: hidden`, so
 * anything past the right edge is not scrolled to, it is gone.
 *
 * Asserted as geometry rather than as a CSS value: what the reader is owed is a
 * notice inside the viewport with a Retry they can press, and any number of
 * sizing rules could honour or break that.
 */
test('a persistence failure stays inside the viewport beside a side-edge Dock', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  // Left edge, middle — the slot menu orders its four labelled edge groups
  // clockwise, so the second `Middle` is the left edge's midpoint.
  await dock(page)
    .getByRole('button', { name: /^Move Command Dock/ })
    .click();
  await page.getByRole('menuitemradio', { name: 'Middle', exact: true }).nth(1).click();
  await expect(dock(page)).toHaveAttribute('data-orientation', 'vertical');

  const failCommit = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/spaces') {
      return route.abort('failed');
    }
    return route.continue();
  };
  await page.route('**/api/spaces', failCommit);

  // Any Edit will do; this one is reachable from the strip itself at this width.
  await createThing(page, 'Markdown Thing');

  const failure = page.getByTestId('persistence-failure');
  await expect(failure).toBeVisible();
  const box = await boxOf(failure, 'the persistence notice');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(failure).toBeInViewport({ ratio: 1 });

  // And the recovery, which is the half the clipped edge takes first: Retry sits
  // at the notice's trailing end.
  const retry = failure.getByRole('button', { name: 'Retry', exact: true });
  await expect(retry).toBeVisible();
  await expect(retry).toBeInViewport({ ratio: 1 });

  await page.unroute('**/api/spaces', failCommit);
  await retry.click();
  await expect(failure).toBeHidden();
});

/**
 * **The other narrow direction: a short viewport with the Dock on a side edge.**
 *
 * The phone above is narrow and tall, which the horizontal strip answers by
 * scrolling along the axis it already runs on — and a block-level child fills
 * its parent's content *width* without being asked, so capping the frame was
 * enough for it. Height does not work that way. A vertical column whose clusters
 * are taller than the room the frame is capped to keeps its content height, and
 * a scroll property on a box with no viewport to scroll inside does nothing at
 * all: the column simply hung out of the bottom of the screen, with the last
 * cluster past the edge of a shell that is `overflow: hidden` and so cannot be
 * scrolled to.
 *
 * 844x220 is a phone turned on its side with the browser chrome in place — the
 * shortest box the app is asked to draw a column in. What ADR 0082 owes here is
 * the same thing it owes at 390px: every cluster keeps its name and its place,
 * and *"everything it offers is reachable and operable from the keyboard
 * alone."*
 *
 * Asserted as the obligation rather than as a CSS value: the strip is inside the
 * viewport, its content scrolls inside it, and the cluster furthest from the
 * grip can be reached and pressed.
 */
test.describe('a short viewport', () => {
  test.use({ viewport: { width: 844, height: 220 } });

  test('a side-edge Dock scrolls its clusters rather than overflowing the screen', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);

    // Left edge, middle — the same slot the notice test below uses, and the one
    // that gives the column the least room above and below it.
    await dock(page)
      .getByRole('button', { name: /^Move Command Dock/ })
      .click();
    await page.getByRole('menuitemradio', { name: 'Middle', exact: true }).nth(1).click();
    await expect(dock(page)).toHaveAttribute('data-orientation', 'vertical');
    // The slot transition is 160ms of `top`, and every measurement below is of
    // where the column came to rest rather than where it was passing through.
    await page.waitForTimeout(400);

    const surface = dock(page);
    const box = await boxOf(surface, 'the Dock');
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(220);

    // The strip is the scroll viewport for its own content, which is the half
    // that was missing: the cap was on the frame around it, so the column below
    // measured the same height scrolled as unscrolled.
    const scroll = await surface.evaluate((element) => ({
      client: element.clientHeight,
      content: element.scrollHeight,
    }));
    expect(scroll.content).toBeGreaterThan(scroll.client);

    // And the far cluster is reachable, which is what the scrolling is for.
    //
    // **Pressing it now completes an Edit rather than opening a menu.** Create
    // Thing was one `+` disclosing three kinds, so the cheapest proof that the
    // far cluster could be *pressed* was that its menu appeared. The kinds are
    // peers now and Create Markdown Thing completes on activation, so the proof
    // is the Thing it makes — and the assertion is the one
    // `Create Thing from the strip names the new Thing on the canvas` already
    // uses, rather than a second way of saying a Thing arrived.
    const create = createThingControl(page);
    await create.scrollIntoViewIfNeeded();
    await expect(create).toBeInViewport({ ratio: 1 });
    await create.click();
    await expect(page.getByRole('textbox', { name: 'Thing title' })).toBeFocused();
  });
});
