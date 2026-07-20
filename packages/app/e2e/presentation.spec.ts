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

test('shows the selected route as a single colored flow', async ({ page }) => {
  await page.goto('/');

  // A legend maps each route to a color.
  await expect(page.getByTestId('route-legend').locator('.legend__item')).toHaveCount(2);

  // The default "main" route: 6 cards, 5 rail edges, 10 ports (in/out per step).
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Main walkthrough' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(5);
  await expect(page.locator('.rf-card-node__port')).toHaveCount(10);

  // Rails are colored (the SVG edge path carries a non-empty stroke color).
  const strokes = await page
    .locator('.react-flow__edge-path')
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  expect(strokes.some((s) => s && s !== 'none' && s !== 'rgb(0, 0, 0)')).toBe(true);
});

test('switching the route swaps the visible flow', async ({ page }) => {
  await page.goto('/');

  // "quick" tour visits three cards.
  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Quick tour' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
});
