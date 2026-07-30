// `test` comes from ./fixtures, not @playwright/test — it carries the auto-use
// gate that fails a test if React Flow logged a warning while it ran.
import { expect, test, type Locator, type Page } from './fixtures';

// The app loads the abstract layout fixture (packages/app/fixture) — two
// disconnected collections sharing no cards, laid out by ELK as separate bands:
//   1. Long (A→B→C→D→A′), Mid (A→B→C→D), Short (A→B→C) — routes over one spine
//   2. Echo (E→F→G→H→E′) — a plain linear collection
// Each returns to its start via an alias, so this particular fixture is acyclic
// and lays out as clean forward paths even though Routes may contain cycles
// (ADR 0032). These tests assert *behaviour* against that shape; none read card prose. See
// fixture/README.md for why each case is there.
//
// This file is the **overview**: the space drawn whole, every route at once.
// Presenting is absent — the deck it used to be went with the step sequence (ADR
// 0023, 0024) and returns as a traversal on this same canvas (ADR 0027), with
// its own spec. The deck's tests are not adapted here; they asserted against a
// surface that no longer exists.

/** A graph node located by its exact card title, so single-letter titles don't
 *  collide (an alias node names its target, so "A" appears on more than one). */
function nodeByTitle(page: Page, title: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test('offers more than one named route', async ({ page }) => {
  await page.goto('/');
  // Open the (Radix, non-native) select and count its listbox options.
  await page.getByTestId('route-selector').click();
  await expect(page.getByRole('option')).toHaveCount(4);
});

test('draws every route at once, each in its own color', async ({ page }) => {
  await page.goto('/');

  // A legend maps each route to a color.
  await expect(page.getByTestId('route-legend').locator('.legend__item')).toHaveCount(4);

  // Two collections: 5 + 5 = 10 cards, and one drawn edge per authored edge:
  // Long 4 + Mid 3 + Short 2 + Echo 4 = 13. Handles per (route, direction)
  // through a card sum to 18 (collection 1) + 8 (collection 2) = 26.
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);
  await expect(page.locator('.rf-card-node__port')).toHaveCount(26);

  // Distinct colors, so the routes can be told apart.
  const strokes = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  expect(strokes.every((s) => s && s !== 'none' && s !== 'rgb(0, 0, 0)')).toBe(true);
  expect(new Set(strokes).size).toBe(4);
});

test('handles stay measurable, so edges attach where the layout put them', async ({ page }) => {
  await page.goto('/');

  // React Flow measures every handle's box to work out where an edge attaches,
  // so a handle hidden with `display: none` reports 0x0 and its edges land
  // somewhere else — silently, with no warning to catch. `CardNode` dims
  // receding routes with `opacity`, which keeps the box; that reads as an
  // ordinary styling choice, and this is what stops a later CSS tidy-up from
  // reaching for `display: none`. See react-flow-guidance/issues/03.
  const ports = page.locator('.rf-card-node__port');
  await expect(ports.first()).toBeAttached();

  const boxes = await ports.evaluateAll((els) =>
    els.map((el) => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );

  // Asserted against whatever the fixture currently draws — its route/card
  // shape is free to change (fixture/README.md).
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every((box) => box.width > 0 && box.height > 0)).toBe(true);
});

test("edges are drawn along ELK's routing, not default beziers", async ({ page }) => {
  await page.goto('/');

  // Retries until the async ELK layout resolves and replaces the first-paint
  // bezier fallback with the routed polyline (a single layout pass routes them
  // all, so once one has an `L` command they all do). No visibility check — a
  // dead-horizontal SVG line has a zero-height box, which Playwright reads as
  // hidden.
  const first = page.locator('.react-flow__edge-path').first();
  await expect(first).toHaveAttribute('d', /L/);

  // Every route edge is a polyline along ELK's routed points (issue 03) — none
  // is a React Flow cubic bezier, which would carry a `C` command.
  const paths = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((el) => el.getAttribute('d') ?? ''));
  expect(paths).toHaveLength(13);
  expect(paths.every((d) => d.startsWith('M') && !d.includes('C'))).toBe(true);
});

test('selecting a route keeps the others on screen', async ({ page }) => {
  await page.goto('/');
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  // Selection is emphasis: it never hides the rest of the space.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Echo' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);
  // Activating a route changes emphasis, not the persisted document.
  await page.waitForTimeout(50);
  await expect(persistence).toHaveAttribute('data-revision', '0');
});

test('selecting a route emphasises it without hiding the others', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);

  const opacities = async () =>
    page
      .locator('.react-flow__edge-path')
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));

  // "Long" is the first route, so it is selected on load and every other route
  // recedes — Mid 3 + Short 2 + Echo 4 = 9 edges.
  const faded = (await opacities()).filter((o) => o < 1);
  expect(faded).toHaveLength(9);
  expect(faded[0]!).toBeGreaterThan(0);

  // Every route stays drawn.
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);
});

test('a card shows its title in the graph, and opens to show its Markdown source', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();

  // The graph draws the title, plus a card's optional short description (ADR
  // 0006, card-display/03) — but never the card's body. A carries a description;
  // "entry point" is its body text, which must not appear.
  const a = nodeByTitle(page, 'A');
  await expect(a).toBeVisible();
  await expect(a.getByTestId('card-description')).toHaveText('Where every route begins');
  await expect(a).not.toContainText('entry point');
  // A card without a description renders no description element.
  await expect(nodeByTitle(page, 'B').getByTestId('card-description')).toHaveCount(0);
  await expect(page.getByTestId('open-card')).toBeHidden();

  // Opening shows the Markdown source verbatim, not rendered (ADR 0011) — the
  // `**` emphasis markers survive rather than becoming bold text.
  await a.click();
  const opened = page.getByTestId('open-card');
  await expect(opened).toBeVisible();
  await expect(opened).toContainText('**A**');

  await page.getByTestId('close-card').click();
  await expect(opened).toBeHidden();
});

test('escape closes an opened card', async ({ page }) => {
  await page.goto('/');
  await page.locator('.react-flow__node').first().click();
  await expect(page.getByTestId('open-card')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('open-card')).toBeHidden();
});

test('a card can be opened even when it is not on the selected route', async ({ page }) => {
  await page.goto('/');

  // "E" is in the Echo collection; select Long (band 1), then open E anyway.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Long' }).click();

  await nodeByTitle(page, 'E').click();
  await expect(page.getByTestId('open-card')).toContainText('Echo collection');
});

test('cards are drawn at exactly the size the layout placed them at', async ({ page }) => {
  await page.goto('/');
  const inner = page.locator('.rf-card-node__inner').first();
  await expect(inner).toBeVisible();

  // The layout arranges cards at `card.ts`'s size and the stylesheet draws them
  // from the same numbers. If these drift, handles land where the card isn't —
  // silently, and looking like a layout bug.
  const declared = await page.evaluate(() => {
    const el = document.querySelector('.graph-area')!;
    const s = getComputedStyle(el);
    return {
      w: s.getPropertyValue('--card-width').trim(),
      h: s.getPropertyValue('--card-height').trim(),
    };
  });
  expect(declared.w).toBe('260px');

  const drawn = await inner.evaluate((el) => {
    const s = getComputedStyle(el);
    const card = el.querySelector('.card--node')!;
    return { w: s.width, h: getComputedStyle(card).height };
  });
  expect(drawn.w).toBe(declared.w);
  expect(drawn.h).toBe(declared.h);

  // 16:9, matching the presentation surface — wider than tall.
  expect(parseFloat(drawn.w)).toBeGreaterThan(parseFloat(drawn.h));
});

test('the card frame is 16:9, and letterboxes rather than reshaping content', async ({ page }) => {
  const ratio = async () => {
    const box = (await page.locator('.open-card__panel').boundingBox())!;
    return box.width / box.height;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('.react-flow__node').first().click();
  await expect(page.getByTestId('open-card')).toBeVisible();
  expect(await ratio()).toBeCloseTo(16 / 9, 1);

  // A viewport that is not 16:9 must not change the shape of the frame.
  await page.setViewportSize({ width: 900, height: 1200 });
  expect(await ratio()).toBeCloseTo(16 / 9, 1);
  await page.setViewportSize({ width: 2200, height: 700 });
  expect(await ratio()).toBeCloseTo(16 / 9, 1);
});

test('content that exceeds the frame scrolls inside it, keeping controls reachable', async ({
  page,
}) => {
  // A small viewport shrinks the 16:9 frame until the fixture's longest card (D)
  // overflows it. The frame is fixed, so content scrolls rather than the frame
  // growing — which is what makes the ratio mean anything.
  //
  // Having to shrink the viewport at all is the flaw card-display/05 records:
  // the frame has a fixed ratio but not a fixed size, so whether a card
  // overflows depends on the window rather than on the card.
  //
  // Open D first, then shrink: at the tiny viewport D's node sits under the
  // minimap and can't be clicked, but the open-card overlay re-letterboxes on
  // resize, so the overflow is exercised all the same.
  await page.goto('/');
  await nodeByTitle(page, 'D').click();
  const content = page.locator('.open-card__content');
  await expect(content).toBeVisible();

  await page.setViewportSize({ width: 520, height: 380 });

  expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // The frame kept its ratio rather than growing to fit.
  const panel = (await page.locator('.open-card__panel').boundingBox())!;
  expect(panel.width / panel.height).toBeCloseTo(16 / 9, 1);

  // Actions stay inside the frame, so step controls never scroll away.
  const actions = (await page.locator('.open-card__actions').boundingBox())!;
  expect(actions.y + actions.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
});

test('an alias node names the card it redraws, and opens to that content', async ({ page }) => {
  await page.goto('/');

  // A′ is an alias of A. It is drawn as its own node, carrying its own title, with
  // a muted marker naming the card it shows, so a redraw reads as a deliberate
  // return (ADR 0009).
  const recap = nodeByTitle(page, 'A′');
  await expect(recap).toBeVisible();
  await expect(recap.getByTestId('alias-marker')).toHaveText('A');

  // Opening the alias resolves through to A's content — single source of truth —
  // under A′'s own title, and shows it as source (ADR 0011).
  await recap.click();
  const opened = page.getByTestId('open-card');
  await expect(opened).toBeVisible();
  await expect(opened.getByRole('heading', { name: 'A′', exact: true })).toBeVisible();
  await expect(opened).toContainText('entry point');
});
