import { expect, test } from './fixtures';
import { dragBy, nodeByTitle, positionOf, settled } from './graph';

/**
 * Opening the app with nothing to open gives a new space: one card (ADR 0018).
 *
 * This project drives a second dev server started with no `SPACE_DIR`, which is
 * the whole switch — "which space opens" turns on whether a path was supplied,
 * and the rest of the suite supplies one pointing at the fixture. That
 * separation is deliberate: it is what stops this ticket quietly retargeting
 * every other test.
 */

test('shows one card, and it is the only thing on screen', async ({ page }) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Start here');
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  // No routes means no edges to draw.
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('offers no route controls, having no routes (ADR 0015)', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'Start here')).toBeVisible();

  // A space with no routes has nothing to select or legend. Whether it can be
  // *presented* is not asserted here: presenting is being rebuilt as a traversal
  // (ADR 0024, 0027) and there is no affordance to point at until it lands.
  await expect(page.getByTestId('route-selector')).toHaveCount(0);
  await expect(page.getByTestId('route-legend')).toHaveCount(0);
});

test('its one card is draggable from the first frame (ADR 0017)', async ({ page }) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Start here');
  await expect(card).toBeVisible();
  await settled(page);

  const before = await positionOf(card);
  await dragBy(page, card, 0, 200);
  const after = await positionOf(card);

  expect(after.y).toBeGreaterThan(before.y + 80);
});

test('renders at natural size rather than filling the screen', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'Start here')).toBeVisible();
  await settled(page);

  // The overview fit caps at `maxZoom: 1`. Without the cap React Flow's default
  // max of 2 applies, and a lone card is scaled to 2x — padding reserves margin,
  // it does not cap zoom. This is the one place that cap is reachable, because
  // it takes a space small enough for the fit to want to zoom in.
  const zoom = await page.evaluate(() => {
    const transform = document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform;
    return Number(/scale\(([\d.]+)\)/.exec(transform ?? '')?.[1] ?? NaN);
  });
  expect(zoom).toBeLessThanOrEqual(1);
});

test('persists a completed edit through the backend session', async ({ page }) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Start here');
  await expect(card).toBeVisible();
  await settled(page);
  const before = await positionOf(card);
  await dragBy(page, card, 0, 220);
  expect((await positionOf(card)).y).toBeGreaterThan(before.y + 80);
  await expect(page.getByTestId('save-button')).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});
