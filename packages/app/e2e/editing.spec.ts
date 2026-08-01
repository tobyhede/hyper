import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  allPositions,
  authoringHandle,
  AUTHORING_HANDLE_SIDES,
  connectHandles,
  connectToEmptyWithAlt,
  dragBy,
  FIXTURE_CARD_COUNT,
  FIXTURE_EDGE_COUNT,
  nodeByTitle,
  positionOf,
  settled,
} from './graph';

/**
 * The barrier a *negative* assertion needs.
 *
 * `toHaveAttribute` and `toHaveText` retry, but they succeed on their first poll
 * when the value already matches — so "the revision did not move" passes
 * instantly and cannot see an edit that arrives a moment later. Only elapsed
 * time makes it mean anything. `settled` is not that: it gates the camera, and
 * the delay it happens to take is incidental to what it promises.
 *
 * A completed edit installs its snapshot synchronously and reaches the DOM
 * within a frame or two, so this is generous against the case being ruled out.
 */
async function quiescent(page: Page): Promise<void> {
  await settled(page);
  await page.waitForTimeout(250);
}

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

test('connecting from Graph and Grid converts atomically without moving Cards', async ({
  page,
}) => {
  await page.goto('/');
  for (const [index, view, targetTitle] of [
    [0, 'Graph', 'E'],
    [1, 'Grid', 'F'],
  ] as const) {
    await test.step(view, async () => {
      if (view === 'Grid') {
        await page.getByTestId('view-selector').click();
        await page.getByRole('option', { name: view }).click();
      }

      const source = nodeByTitle(page, 'A').first();
      const target = nodeByTitle(page, targetTitle).first();
      await expect(source).toBeVisible();
      await source.hover();
      const sourceHandle = authoringHandle(source, 'source', 'right');
      const targetHandle = authoringHandle(target, 'target', 'top');
      await expect(sourceHandle).toHaveClass(/connectable/);
      await settled(page);
      const before = await allPositions(page);
      const persistence = page.getByTestId('persistence-status');
      await expect(persistence).toHaveAttribute('data-revision', String(index));
      await expect(page.getByTestId('layout-selector')).toContainText('None');

      await expect(sourceHandle).toHaveCSS('opacity', '1');
      const from = (await sourceHandle.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, {
        steps: 4,
      });
      await expect(targetHandle).toHaveCSS('opacity', '1');
      const pane = (await page.locator('.react-flow__pane').boundingBox())!;
      await page.mouse.move(pane.x + 16, pane.y + 16);
      await page.mouse.up();

      await quiescent(page);
      await expect(persistence).toHaveAttribute('data-revision', String(index));
      await expect(persistence).toHaveText('Persisted');
      await expect(page.getByTestId('layout-selector')).toContainText('None');
      expect(await allPositions(page)).toEqual(before);

      await source.hover();
      await connectHandles(page, sourceHandle, targetHandle);

      await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT + index + 1);
      await expect(persistence).toHaveAttribute('data-revision', String(index + 1));
      await expect(persistence).toHaveText('Persisted');
      await expect(page.getByTestId('layout-selector')).toContainText(`Layout ${index + 1}`);
      await expect(page.getByTestId('layout-live-indicator')).toBeVisible();
      await settled(page);
      expect(await allPositions(page)).toEqual(before);
    });
  }
});

test('creating from an Algorithmic View freezes existing Cards and places Card 1', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  const before = await allPositions(page);
  await source.hover();

  await connectToEmptyWithAlt(page, authoringHandle(source, 'source', 'right'));

  const created = nodeByTitle(page, 'Card 1');
  await expect(created).toBeVisible();
  const after = await allPositions(page);
  for (const [id, position] of Object.entries(before)) {
    expect(after[id], `card ${id} moved`).toEqual(position);
  }
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT + 1);
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
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

test('drawing an existing Edge from an Algorithmic View does not convert or persist', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  const target = nodeByTitle(page, 'B').first();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  const before = await allPositions(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');
  await expect(page.getByTestId('layout-selector')).toContainText('None');

  await source.hover();
  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'left'),
  );

  // The Edge was refused, so nothing here will ever announce itself — the
  // assertions below are all negative and need the barrier to mean anything.
  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(persistence).toHaveAttribute('data-revision', '0');
  await expect(persistence).toHaveText('Persisted');
  await expect(page.getByTestId('layout-selector')).toContainText('None');
  expect(await allPositions(page)).toEqual(before);
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

/**
 * The authoring handle is a drag affordance, and a click is not a drag.
 *
 * A press and release inside React Flow's drag threshold never starts a
 * connection, so the click reached the Card underneath and opened it to read —
 * from a control whose whole purpose is to begin an Edge.
 */
test('clicking a Card authoring handle neither opens the Card nor draws an Edge', async ({
  page,
}) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  await card.hover();

  const handleBox = (await authoringHandle(card, 'source', 'right').boundingBox())!;
  await page.mouse.click(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);

  await expect(page.getByTestId('close-card')).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * React Flow deletes on Backspace by default, and Hyper has no delete Edit.
 *
 * The graph is a projection of the authoritative Space. A default that removes a
 * Card from the live node array without a completed Edit puts the canvas into a
 * local, unpersisted state the Space never agreed to — and drops the Card's
 * Edges on the floor, since no `onEdgesChange` receives them.
 */
test('Backspace with a Card selected removes nothing', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  const cardBox = (await card.boundingBox())!;
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await expect(card).toHaveClass(/selected/);
  await page.getByTestId('close-card').click();
  await expect(page.getByTestId('close-card')).toHaveCount(0);

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');

  await expect(page.locator('.react-flow__node')).toHaveCount(FIXTURE_CARD_COUNT);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

test('Backspace with an Edge selected removes nothing', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  const edge = page.locator('.react-flow__edge').first();
  await expect(edge.locator('.react-flow__edge-path')).toHaveAttribute('d', /L/);
  await settled(page);

  const edgePoint = await page.locator('.react-flow__edge-path').evaluateAll((paths) => {
    for (const path of paths) {
      const geometry = path as SVGPathElement;
      const transform = geometry.getScreenCTM();
      if (transform === null) continue;
      const length = geometry.getTotalLength();
      for (const fraction of [0.25, 0.5, 0.75]) {
        const point = geometry.getPointAtLength(length * fraction).matrixTransform(transform);
        if (document.elementFromPoint(point.x, point.y)?.closest('.react-flow__edge') !== null) {
          return { x: point.x, y: point.y };
        }
      }
    }
    throw new Error('No rendered Edge has a clickable point.');
  });
  await page.mouse.click(edgePoint.x, edgePoint.y);
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');

  await expect(page.locator('.react-flow__node')).toHaveCount(FIXTURE_CARD_COUNT);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * React Flow's default assistive description offers a delete Hyper has not built.
 *
 * Sighted users never meet the claim; a screen reader reads it out as the way to
 * work with a Card. The keyboard behaviour is inert either way — a removal is
 * undone by the next projection sync — so the instruction is the whole defect.
 */
test('the graph does not advertise a delete action it does not implement', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('[id^="react-flow__node-desc"]')).not.toContainText(/delete/i);
  await expect(page.locator('[id^="react-flow__node-desc"]')).toContainText(/open a Card/i);
  await expect(page.locator('[id^="react-flow__edge-desc"]')).not.toContainText(/delete/i);
});

/**
 * The Edge description must not offer a key an Edge cannot receive.
 *
 * `edgesFocusable={false}` keeps Edges out of the tab order, which is the right
 * call — selecting one leads nowhere, so putting every Edge in the graph between
 * a keyboard user and the next Card would be noise. So any "press …" instruction
 * on an Edge names a key the only people who hear it can never deliver — the same
 * defect as the delete claim above, answered the same way: correct the
 * instruction rather than build the interaction it names.
 *
 * A Card is the opposite case — `nodesFocusable` is true and each key named there
 * does something — so its description keeps its instructions.
 */
test('the graph does not advertise an Edge keyboard action it cannot receive', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge').first()).toBeAttached();

  await expect(page.locator('.react-flow__edge').first()).not.toHaveAttribute('tabindex');
  await expect(page.locator('[id^="react-flow__edge-desc"]')).not.toContainText(/press/i);
});

/**
 * A duplicate Edge is refused before release, not silently after it.
 *
 * The rule already existed — Edit completion drops a duplicate — but it ran only
 * once the author let go, so a target that could not accept the Edge advertised
 * itself as valid for the whole drag. React Flow asks `isValidConnection` during
 * the gesture for exactly this, and drives the handle's own `valid` state from
 * the answer.
 */
test('a duplicate Edge is marked invalid while the drag is still live', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  const startDrag = async () => {
    await source.hover();
    const from = (await authoringHandle(source, 'source', 'right').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 3 });
  };
  const dragOnto = async (title: string) => {
    const handle = authoringHandle(nodeByTitle(page, title).first(), 'target', 'left');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    return handle;
  };

  // A→B is already an Edge of the active Route; A→E is not.
  await startDrag();
  await expect(await dragOnto('B')).not.toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);

  await startDrag();
  await expect(await dragOnto('E')).toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT + 1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});
