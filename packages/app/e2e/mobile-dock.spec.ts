import { expect, test } from './fixtures';
import type { Route } from '@playwright/test';
import {
  activateGraph,
  boxOf,
  createCard,
  dock,
  layoutMenu,
  newLayout,
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
    await expect(dock(page).getByRole('button', { name: 'Cards' })).toBeVisible();

    // And every disclosure still discloses. The Layout menu is opened, a choice
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
 * mounted and the Sheet's trap took it straight back, so Add Card had to dismiss
 * before it could run. Here the strip is beside the result rather than over it,
 * and the caret lands where the author is looking.
 */
test('Create Card from the strip names the new Card on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createCard(page, 'Markdown Card');

  const title = page.getByRole('textbox', { name: 'Card title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Card 1');
  await expect(dock(page)).toBeVisible();
});

/** The Alias creation state, which takes focus onto its own picker. */
test('Create Alias from the strip opens the Target picker', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await createCard(page, 'Alias');

  await expect(page.getByRole('combobox', { name: 'Target' })).toBeFocused();
});

/**
 * New Layout at phone width, and the Delete that undoes it.
 *
 * Both are rows in the Layout menu rather than a permanent control and a row
 * menu, which is the one thing the narrower box changed about them.
 */
test('New Layout selects an empty authored Layout, and Delete returns to the one before', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await newLayout(page);
  await expect(selectedCanvas(page)).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

  // An empty Layout reveals the Cards drawer, which at this width overlays the
  // end of the strip — so it is dismissed before the next command rather than
  // reached around. That is the drawer's own contract and not the Dock's: a
  // surface the author opens is dismissed by the author.
  await expect(page.getByRole('dialog', { name: 'Cards' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Cards' })).toHaveCount(0);

  const menu = await layoutMenu(page);
  await menu.getByRole('menuitem', { name: 'Delete Layout 1' }).click();
  await expect(selectedCanvas(page)).toContainText('Collection 1');
});

/**
 * Delete reaching a Dock control leaves the selected Card standing.
 *
 * React Flow subscribes its delete key on `document`, so a control beside the
 * canvas is inside that subscription and outside the canvas's own guard. Every
 * Dock control carries `nokey` for exactly this, and at phone width the strip is
 * the *only* chrome there is — so if the marker were ever dropped, this is where
 * a reader would lose a Card to a keystroke meant for a menu.
 */
test('Delete on a Dock control leaves the selected Card on the canvas', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await card.click();

  await selectedCanvas(page).focus();
  await page.keyboard.press('Delete');

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await expect(card).toBeVisible();
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
  await expect(page.locator('.react-flow__node.rf-card-node--active')).toHaveCount(1);
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

  await layoutMenu(page);
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
  await createCard(page, 'Markdown Card');

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
