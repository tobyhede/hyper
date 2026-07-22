import { expect, test, type Locator, type Page } from '@playwright/test';

// The app loads the abstract layout fixture (packages/app/fixture) — two
// disconnected collections sharing no cards, laid out by ELK as separate bands:
//   1. Long (A→B→C→D→A′), Mid (A→B→C→D), Short (A→B→C) — routes over one spine
//   2. Echo (E→F→G→H→E′) — a plain linear collection
// Each returns to its start via an alias; a route may not revisit a card (ADR
// 0012), so the fixture is acyclic and lays out as clean forward paths. These
// tests assert *behaviour* against that shape; none read card prose. See
// fixture/README.md for why each case is there.

/** A graph node located by its exact card title, so single-letter titles don't
 *  collide (an alias node names its target, so "A" appears on more than one). */
function nodeByTitle(page: Page, title: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

test('walks a presentation route with keyboard navigation', async ({ page }) => {
  await page.goto('/');

  // App loads.
  await expect(page.getByRole('heading', { name: 'Layout fixture' })).toBeVisible();

  // Graph is visible.
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(1);

  // Select a route and enter presentation mode.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Long' }).click();
  await page.getByTestId('present-button').click();

  // Presenting is a deck (ADR 0008), not an opened card.
  const deck = page.getByTestId('presentation-deck');
  await expect(deck).toBeVisible();

  const current = page.locator('.reveal .slides section.present');
  await expect(current).toHaveAttribute('data-card-id', 'a');

  // reveal owns stepping.
  await page.keyboard.press('ArrowRight');
  await expect(current).toHaveAttribute('data-card-id', 'b');

  await page.keyboard.press('ArrowLeft');
  await expect(current).toHaveAttribute('data-card-id', 'a');

  // Escape leaves the deck and returns to the space.
  await page.keyboard.press('Escape');
  await expect(deck).toBeHidden();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
});

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

  // Two collections: 5 + 5 = 10 cards. Edges are one per step transition:
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

  // Selection chooses what Present walks; it no longer hides the rest of the space.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Echo' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(10);
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);
});

test('selecting a route emphasises it without hiding the others', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(13);

  const opacities = async () =>
    page
      .locator('.react-flow__edge-path')
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));

  // "Long" is the first route, so it is selected on load and every other route
  // recedes — Mid 3 + Short 2 + Echo 4 = 9 edges. The selector does something
  // without having to press Present.
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

test('presenting is a deck, and opening a card is not (ADR 0008)', async ({ page }) => {
  await page.goto('/');

  // Opening reads a card in place: the space is still what you are looking at.
  await page.locator('.react-flow__node').first().click();
  await expect(page.getByTestId('open-card')).toBeVisible();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await expect(page.getByTestId('presentation-deck')).toBeHidden();
  await page.getByTestId('close-card').click();

  // Presenting takes over: the space goes away. Long is selected on load.
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presentation-deck')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByTestId('open-card')).toBeHidden();

  // Every step of the route is a slide — Long has five (A B C D A′).
  await expect(page.locator('.reveal .slides section')).toHaveCount(5);

  // Exiting returns to the space.
  await page.getByTestId('exit-presentation').click();
  await expect(page.getByTestId('presentation-deck')).toBeHidden();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
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

test('a card title appears once, not twice', async ({ page }) => {
  await page.goto('/');

  // The space owns the title, so a card's Markdown is body-only. When a body
  // repeated its title as a heading, every surface rendered it twice.
  await nodeByTitle(page, 'C').click();
  const opened = page.getByTestId('open-card');
  await expect(opened).toBeVisible();
  expect(await opened.getByText('C', { exact: true }).count()).toBe(1);

  await page.getByTestId('close-card').click();

  // Present Long (which visits C) and check the slide carries its title once.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Long' }).click();
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presentation-deck')).toBeVisible();

  const slide = page.locator('.reveal .slides section[data-card-id="c"]');
  expect(await slide.getByText('C', { exact: true }).count()).toBe(1);
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
