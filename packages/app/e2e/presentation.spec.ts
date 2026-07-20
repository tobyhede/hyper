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

  const layer = page.getByTestId('presentation-layer');
  await expect(layer).toBeVisible();
  await expect(page.getByTestId('step-counter')).toHaveText('1 / 6');

  const title = layer.locator('.card__title');
  const firstTitle = await title.textContent();

  // Next changes the focused card.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('step-counter')).toHaveText('2 / 6');
  await expect(title).not.toHaveText(firstTitle ?? '');

  // Previous returns to the first card.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('step-counter')).toHaveText('1 / 6');
  await expect(title).toHaveText(firstTitle ?? '');

  // Escape exits presentation mode.
  await page.keyboard.press('Escape');
  await expect(layer).toBeHidden();
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

test('selecting emphasises a route; presenting pushes the rest further back', async ({ page }) => {
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
  const subtle = faded[0]!;
  expect(subtle).toBeGreaterThan(0);

  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presentation-layer')).toBeVisible();

  // Presenting fades them further, and never removes them.
  await expect.poll(async () => (await opacities()).filter((o) => o < subtle).length).toBe(2);
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

  // 16:10 landscape — wider than tall.
  expect(parseFloat(drawn.w)).toBeGreaterThan(parseFloat(drawn.h));
});
