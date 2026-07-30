import { expect, test } from './fixtures';
import { allPositions, dragBy, nodeByTitle, positionOf, settled } from './graph';

/**
 * Dragging a card writes its placement into the Layout.
 *
 * The fixture declares no Layout, so its first edit converts the resolved
 * automatic arrangement into one (ADR 0025). What this asserts is the point of
 * the whole pivot: a card goes where you put it and *nothing else moves*. Three
 * spike increments failed exactly here — a global optimiser reshuffled the rest
 * of the graph on every edit, so a drop landed somewhere arbitrary.
 */

test('a dragged card stays where it is dropped, and nothing else moves', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();

  // Wait for the arrangement to resolve — before it does, the space is not yet
  // draggable and every card sits at the origin.
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  await settled(page);
  const before = await allPositions(page);
  const from = await positionOf(a);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await dragBy(page, a, 0, 260);

  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.getByTestId('layout-live-indicator')).toBeVisible();

  const to = await positionOf(a);
  expect(to.y).toBeGreaterThan(from.y + 100);

  // Every other card is exactly where it was. Not "roughly" — a global
  // optimiser is what this rules out, and it moves things by pixels as readily
  // as by hundreds.
  const after = await allPositions(page);
  const draggedId = await a.getAttribute('data-id');
  for (const [id, position] of Object.entries(before)) {
    if (id === draggedId) continue;
    expect(after[id], `card ${id} moved`).toEqual(position);
  }
});

test('selecting Graph or Grid is navigation and does not persist', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await page.getByTestId('layout-selector').click();
  await expect(page.getByText('Layouts · authored')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('route-selector').click();
  await expect(page.getByText('Active route', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('view-selector').click();
  await page.getByRole('option', { name: 'Grid' }).click();
  await expect(page.getByTestId('view-selector')).toContainText('Grid');
  await expect(page.getByTestId('layout-selector')).toContainText('None');
  await expect(page.getByTestId('layout-live-indicator')).toHaveCount(0);
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await page.getByTestId('view-selector').click();
  await page.getByRole('option', { name: 'Graph' }).click();
  await expect(page.getByTestId('view-selector')).toContainText('Graph');
  await expect(persistence).toHaveAttribute('data-revision', '0');
});

test('editing an existing Layout updates it instead of creating another one', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);

  await dragBy(page, a, 0, 220);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');

  await page.getByTestId('view-selector').click();
  await page.getByRole('option', { name: 'Grid' }).click();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await page.getByTestId('layout-selector').click();
  await page.getByRole('option', { name: 'Layout 1' }).click();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  await dragBy(page, a, 0, 160);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await page.getByTestId('layout-selector').click();
  await expect(page.getByRole('option', { name: 'Layout 1' })).toHaveCount(1);
});

test('edges follow a card that has been dragged', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  const edgePath = () =>
    page
      .locator('.react-flow__edge-path')
      .first()
      .evaluate((el) => el.getAttribute('d') ?? '');
  await settled(page);
  const before = await edgePath();
  const from = await positionOf(a);

  await dragBy(page, a, 0, 260);
  // Assert the drag landed, so a silent no-drag fails here rather than
  // masquerading as an edge that did not redraw.
  expect((await positionOf(a)).y).toBeGreaterThan(from.y + 100);

  // The routed geometry described the arrangement the layout computed, so it is
  // stale the moment a card leaves it. The edge is redrawn between where the
  // cards now are.
  await expect.poll(edgePath).not.toBe(before);
});

test('a completed drag persists automatically without a Save action', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  await expect(page.getByTestId('save-button')).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await dragBy(page, a, 0, 260);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});
