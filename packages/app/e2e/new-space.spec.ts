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

test('is saved and reopens where you left it — the round trip', async ({ page }) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Start here');
  await expect(card).toBeVisible();
  await settled(page);
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/__space') && response.status() === 204,
  );
  await dragBy(page, card, 0, 220);

  // The save is fire-and-forget, so wait for the response rather than a promise —
  // and read the position *after* it, so what is compared is the placement the
  // store committed at drag-end rather than wherever the last mouse move left the
  // node mid-gesture.
  const response = await saved;

  // 204 alone does not mean it wrote: a read-only server answers 204 too, having
  // done nothing. This project's whole point is that this server *does* write, so
  // assert the file count rather than the status. Two files — the minted card and
  // the space file that now names a Layout positioning it.
  expect(Number(response.headers()['x-space-files-written'])).toBeGreaterThan(0);
  const moved = await positionOf(card);

  await page.reload();

  // The card is still here at all only because its *file* was written: a minted
  // space's card is described by nothing until the first save (ADR 0020).
  const reopened = nodeByTitle(page, 'Start here');
  await expect(reopened).toBeVisible();
  await settled(page);

  // And it is where it was left, because the space file now names a Layout that
  // positions it — an arrangement that does not reopen is the derived-placement
  // failure wearing a different hat.
  const after = await positionOf(reopened);
  expect(Math.abs(after.x - moved.x)).toBeLessThan(2);
  expect(Math.abs(after.y - moved.y)).toBeLessThan(2);
});
