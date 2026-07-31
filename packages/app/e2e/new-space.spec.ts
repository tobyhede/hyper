import { expect, test } from './fixtures';
import { dragBy, nodeByTitle, positionOf, settled } from './graph';

/**
 * Opening the app with nothing to open gives a new space: one card (ADR 0018).
 *
 * This project drives its own empty HTTP repository. Server-side database
 * startup creates the one-card Space once, and reloads reopen that durable UUID.
 */

test('shows one card, and it is the only thing on screen', async ({ page }) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Start here');
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  // No routes means no edges to draw.
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('shows an empty disabled route control and no route HUD (ADR 0015)', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'Start here')).toBeVisible();

  await expect(page.getByTestId('route-selector')).toContainText('None');
  await expect(page.getByTestId('present-button')).toBeDisabled();
  await expect(page.getByTestId('route-legend')).toHaveCount(0);
});

test('its one card is draggable once its automatic arrangement resolves (ADR 0025)', async ({
  page,
}) => {
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
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('a completed edit and workspace identity survive reload', async ({ page }) => {
  await page.goto('/');
  const first = nodeByTitle(page, 'Start here');
  await expect(first).toBeVisible();
  const firstId = await first.getAttribute('data-id');
  await settled(page);
  await dragBy(page, first, 0, 220);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  const durablePosition = await positionOf(first);

  await page.reload();

  const second = nodeByTitle(page, 'Start here');
  await expect(second).toBeVisible();
  await settled(page);
  expect(await second.getAttribute('data-id')).toBe(firstId);
  expect(await positionOf(second)).toEqual(durablePosition);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});
