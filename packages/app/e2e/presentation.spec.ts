import { expect, test } from '@playwright/test';

test('walks a presentation route with keyboard navigation', async ({ page }) => {
  await page.goto('/');

  // App loads.
  await expect(
    page.getByRole('heading', { name: 'Graph-Native Technical Presentations' }),
  ).toBeVisible();

  // Graph is visible.
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  const nodeCount = await page.locator('.react-flow__node').count();
  expect(nodeCount).toBeGreaterThan(1);

  // Select a route and enter presentation mode.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Main walkthrough' }).click();
  await page.getByTestId('present-button').click();

  // Presenting is a deck (ADR 0008), not an opened card.
  const deck = page.getByTestId('presentation-deck');
  await expect(deck).toBeVisible();

  const current = page.locator('.reveal .slides section.present');
  await expect(current).toHaveAttribute('data-card-id', 'intro');

  // reveal owns stepping.
  await page.keyboard.press('ArrowRight');
  await expect(current).toHaveAttribute('data-card-id', 'problem');

  await page.keyboard.press('ArrowLeft');
  await expect(current).toHaveAttribute('data-card-id', 'intro');

  // Escape leaves the deck and returns to the space.
  await page.keyboard.press('Escape');
  await expect(deck).toBeHidden();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
});

test('offers more than one named route', async ({ page }) => {
  await page.goto('/');
  // Open the (Radix, non-native) select and count its listbox options.
  await page.getByTestId('route-selector').click();
  await expect(page.getByRole('option')).toHaveCount(2);
});

test('draws every route at once, each in its own color', async ({ page }) => {
  await page.goto('/');

  // A legend maps each route to a color.
  await expect(page.getByTestId('route-legend').locator('.legend__item')).toHaveCount(2);

  // Both routes, overlaid. "main" visits all 6 cards, "quick" visits 3 of them,
  // so the union is 6 cards; 5 main edges + 2 quick edges; and a shared card
  // carries one handle pair per route running through it.
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
  await expect(page.locator('.rf-card-node__port')).toHaveCount(14);

  // Distinct colors, so the two routes can be told apart.
  const strokes = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  expect(strokes.every((s) => s && s !== 'none' && s !== 'rgb(0, 0, 0)')).toBe(true);
  expect(new Set(strokes).size).toBe(2);
});

test('selecting a route keeps the others on screen', async ({ page }) => {
  await page.goto('/');

  // Selection chooses what Present walks; it no longer hides the rest of the space.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Quick tour' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
});

test('selecting a route emphasises it without hiding the others', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);

  const opacities = async () =>
    page
      .locator('.react-flow__edge-path')
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));

  // "main" is selected on load, so "quick"'s two edges already recede. The
  // selector does something without having to press Present.
  const faded = (await opacities()).filter((o) => o < 1);
  expect(faded).toHaveLength(2);
  expect(faded[0]!).toBeGreaterThan(0);

  // Every route stays drawn.
  await expect(page.locator('.react-flow__edge')).toHaveCount(7);
});

test('a card shows its title in the graph, and opens to reveal its content', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node').first()).toBeVisible();

  // The graph draws titles only — no card body text (ADR 0006).
  const intro = page.locator('.react-flow__node', { hasText: 'Graph-native presentations' });
  await expect(intro).toBeVisible();
  await expect(intro).not.toContainText('A technical deck authored as');
  await expect(page.getByTestId('open-card')).toBeHidden();

  // Opening one reveals the content.
  await intro.click();
  const opened = page.getByTestId('open-card');
  await expect(opened).toBeVisible();
  await expect(opened).toContainText('A technical deck authored as');

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

  // "problem" is on main only; select the quick tour, which skips it.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Quick tour' }).click();

  await page.locator('.react-flow__node', { hasText: 'The problem with linear decks' }).click();
  await expect(page.getByTestId('open-card')).toContainText('Slides force');
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

  // Presenting takes over: the space goes away.
  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presentation-deck')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);
  await expect(page.getByTestId('open-card')).toBeHidden();

  // Every step of the route is a slide — including a card the route revisits.
  await expect(page.locator('.reveal .slides section')).toHaveCount(6);

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
  // A small viewport shrinks the 16:9 frame until the demo's longest card
  // overflows it. The frame is fixed, so content scrolls rather than the frame
  // growing — which is what makes the ratio mean anything.
  await page.setViewportSize({ width: 760, height: 460 });
  await page.goto('/');

  await page.locator('.react-flow__node', { hasText: 'The problem with linear decks' }).click();
  const content = page.locator('.open-card__content');
  await expect(content).toBeVisible();

  expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // The frame kept its ratio rather than growing to fit.
  const panel = (await page.locator('.open-card__panel').boundingBox())!;
  expect(panel.width / panel.height).toBeCloseTo(16 / 9, 1);

  // Actions stay inside the frame, so step controls never scroll away.
  const actions = (await page.locator('.open-card__actions').boundingBox())!;
  expect(actions.y + actions.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
});
