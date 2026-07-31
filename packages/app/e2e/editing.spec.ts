import { expect, test } from './fixtures';
import {
  allPositions,
  authoringHandle,
  AUTHORING_HANDLE_SIDES,
  connectHandles,
  dragBy,
  FIXTURE_CARD_COUNT,
  FIXTURE_EDGE_COUNT,
  nodeByTitle,
  positionOf,
  settled,
} from './graph';

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

test('a completed drag persists automatically', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await dragBy(page, a, 0, 260);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('a selected Card exposes four circular handles coloured as the active Route', async ({
  page,
}) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await dragBy(page, a, 0, 180);

  const handles = a.locator('.rf-card-node__authoring-handle--source');
  await expect(handles).toHaveCount(4);
  await expect(handles.first()).toHaveCSS('width', '24px');
  await expect(handles.first()).toHaveCSS('height', '24px');
  const routeStroke = await page
    .locator('.rf-route-edge')
    .filter({ has: page.locator('.react-flow__edge-path') })
    .first()
    .locator('.react-flow__edge-path')
    .evaluate((edge) => getComputedStyle(edge).stroke);
  const handleColors = await handles.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).backgroundColor),
  );
  expect(handleColors).toEqual(Array(4).fill(routeStroke));
  expect(
    await handles.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).borderRadius === '50%'),
    ),
  ).toBe(true);
  await expect(a.locator('.rf-card-node__port').first()).toHaveCSS('opacity', '0');
});

test('drawing between existing Cards persists one active-Route Edge and selects the target', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  const target = nodeByTitle(page, 'E').first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Issue 02 begins in a positioned Layout; placement supplies that state using
  // the already-public edit gesture rather than reaching into React Flow state.
  await dragBy(page, source, 0, -100);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  const sourceHandle = authoringHandle(source, 'source', 'right');
  const targetHandle = authoringHandle(target, 'target', 'top');
  const targetHandles = page.locator('.rf-card-node__authoring-handle--target');
  await expect(sourceHandle).toHaveCSS('opacity', '1');
  await expect(targetHandle).toHaveCSS('opacity', '0');

  await connectHandles(page, sourceHandle, targetHandle, async () => {
    // Every Card offers a target on every side while a connection is in flight,
    // so the drop is never blocked by which side the author aimed at.
    await expect(targetHandles.first()).toHaveCSS('opacity', '1');
    await expect(targetHandles).toHaveCount(FIXTURE_CARD_COUNT * AUTHORING_HANDLE_SIDES);
    const preview = page.locator('.react-flow__connection-path');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS('stroke', 'rgb(110, 168, 254)');
    await expect(preview).toHaveAttribute('marker-end', /url/);
  });

  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT + 1);
  await expect(
    page.getByLabel(
      'Edge from 00000000-0000-4000-8000-000000000002 to 00000000-0000-4000-8000-000000000008',
    ),
  ).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect(target.locator('.rf-card-node__authoring-handle--source').first()).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.getByTestId('open-card')).toHaveCount(0);
});

test('an authored Edge is immediately available when presenting the Route', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'E').first();
  const target = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Convert the Algorithmic View through the public placement gesture before
  // authoring E → A on Long. That Edge makes E the Route's only entry Card:
  // A was the old entry, but now has an incoming Edge.
  await dragBy(page, source, 0, -100);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'top'),
  );

  await expect(
    page.getByLabel(
      'Edge from 00000000-0000-4000-8000-000000000008 to 00000000-0000-4000-8000-000000000002',
    ),
  ).toBeVisible();
  await expect(persistence).toHaveAttribute('data-revision', '2');
  await expect(persistence).toHaveText('Persisted');

  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  const activeCard = page.locator('.react-flow__node.rf-card-node--active');
  await expect(activeCard).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000008');
  await expect(page.getByTestId('presenting-moves').getByRole('button')).toHaveText('A');

  await page.keyboard.press('ArrowRight');
  await expect(activeCard).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000002');
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000008');
});

test('an Edge drawn from the presented Card is a move the presenter can take now', async ({
  page,
}) => {
  const A = '00000000-0000-4000-8000-000000000002';
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Authoring completes an Edge only in a selected Layout, so convert the
  // Algorithmic View through the public placement gesture first.
  await dragBy(page, a, 0, -100);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await settled(page);

  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  const activeCard = page.locator('.react-flow__node.rf-card-node--active');
  await expect(activeCard).toHaveAttribute('data-id', A);
  const moves = page.getByTestId('presenting-moves').getByRole('button');
  await expect(moves).toHaveText(['B']);
  // The presenting camera closes in over two animated moves; a handle box read
  // during them is stale by the time the mouse arrives.
  await settled(page);

  // A self-Edge is valid authored structure (ADR 0032), and it is the Edge this
  // gesture can reach: at a zoom where the active Card is legible every other
  // Card is provably off frame (ADR 0027), so the presented Card's own handles
  // are the only ones on screen.
  await connectHandles(
    page,
    authoringHandle(activeCard, 'source', 'right'),
    authoringHandle(activeCard, 'target', 'left'),
  );

  await expect(page.getByLabel(`Edge from ${A} to ${A}`)).toBeVisible();
  await expect(persistence).toHaveAttribute('data-revision', '2');
  await expect(persistence).toHaveText('Persisted');

  // The chrome enumerates the active Card's outgoing Edges, so the Edge just
  // drawn is available without leaving and re-entering the walk.
  await expect(moves).toHaveText(['B', 'A']);
});

test('drawing an existing active-Route Edge is a persistence no-op', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  const target = nodeByTitle(page, 'B').first();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await dragBy(page, source, 0, -100);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'left'),
  );

  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

/**
 * Two connections in one session, chained so the second starts from the Card the
 * first selected.
 *
 * The second one is the whole point. A Card's declared handles (`projection.ts`)
 * include every Route id, not only the ones incident to it, so a completed
 * connection resolves in the same render that first makes its target incident.
 * Forcing React Flow to re-measure from the DOM replaces those declarations with
 * only the anchors actually rendered, which drops the not-yet-incident ones — and
 * the *next* connection then fails to resolve its source handle. One connection
 * cannot see it; the damage is done to the gesture after.
 *
 * Verified both ways against the fixture: with a forced remeasure in `CardNode`
 * this fails with six React Flow #008 warnings on the second connection, and
 * without one it passes.
 */
test('a second connection drawn in the same session resolves its handles', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  const e = nodeByTitle(page, 'E').first();
  const f = nodeByTitle(page, 'F').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  await dragBy(page, a, 0, -100);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(a, 'source', 'right'),
    authoringHandle(e, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT + 1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(e, 'source', 'right'),
    authoringHandle(f, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT + 2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('changing the active Route recolours authoring handles without persisting or filtering', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await dragBy(page, source, 0, -100);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  const handle = source.locator('.rf-card-node__authoring-handle--source').first();
  const longColour = await handle.evaluate((element) => getComputedStyle(element).backgroundColor);

  await page.getByTestId('route-selector').click();
  await page.getByRole('option', { name: 'Mid' }).click();

  await expect(handle).not.toHaveCSS('background-color', longColour);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
});
