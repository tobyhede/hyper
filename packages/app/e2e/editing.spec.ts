import { expect, test } from './fixtures';
import { allPositions, dragBy, nodeByTitle, positionOf, settled } from './graph';

/**
 * Dragging a card writes its placement into the Layout.
 *
 * The fixture declares no Layout, so it gets one from its first resolved layout
 * (ADR 0017) and is editable on open. What this asserts is the point of the
 * whole pivot: a card goes where you put it and *nothing else moves*. Three
 * spike increments failed exactly here — a global optimiser reshuffled the rest
 * of the graph on every edit, so a drop landed somewhere arbitrary.
 */

test('a dragged card stays where it is dropped, and nothing else moves', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();

  // Wait for the layout to resolve — before it does, the space is not editable
  // and every card sits at the origin (ADR 0017).
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  await settled(page);
  const before = await allPositions(page);
  const from = await positionOf(a);

  await dragBy(page, a, 0, 260);

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

test('auto-arrange puts a dragged card back, and it stays draggable', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  await settled(page);
  const arranged = await positionOf(a);

  await dragBy(page, a, 0, 260);
  const dragged = await positionOf(a);
  expect(dragged.y).toBeGreaterThan(arranged.y + 100);

  await page.getByTestId('auto-arrange-button').click();

  // Back where the strategy puts it. ELK is deterministic over the same graph, so
  // this is an equality rather than a "somewhere near".
  await expect.poll(async () => (await positionOf(a)).y).toBe(arranged.y);
  expect((await positionOf(a)).x).toBe(arranged.x);

  // Auto-arrange is an edit, not a switch to a computed view — so the card is
  // still yours to move afterwards.
  await dragBy(page, a, 0, 260);
  expect((await positionOf(a)).y).toBeGreaterThan(arranged.y + 100);
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
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});
