import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  activeCard,
  allPositions,
  authoringHandle,
  AUTHORING_HANDLE_SIDES,
  boxOf,
  connectHandles,
  connectToEmptyWithAlt,
  dragBy,
  FIXTURE_CARD_COUNT,
  FIXTURE_EDGE_COUNT,
  nodeByTitle,
  openCard,
  positionOf,
  selectLayout,
  settled,
  viewportTransform,
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

test('inline title editing persists without moving or opening the Card', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);
  const before = await allPositions(page);

  await card.hover();
  const edit = card.getByRole('button', { name: 'Edit Card A' });
  await expect(edit).toHaveCSS('opacity', '1');
  // The affordance draws a glyph, so nothing about its own content keeps it in
  // shape or in place. Sized square in CSS and parked in the corner, clear of
  // the title — a name is what a screen reader gets, and the box is all a
  // pointer gets.
  const editBox = await boxOf(edit, 'the Card affordance');
  const cardBox = await boxOf(card, 'Card A');
  const titleBox = await boxOf(card.getByRole('heading', { name: 'A' }), "Card A's title");
  expect(Math.abs(editBox.width - editBox.height)).toBeLessThanOrEqual(1);
  expect(editBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(editBox.x + editBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  expect(editBox.y).toBeGreaterThanOrEqual(cardBox.y);
  expect(editBox.y + editBox.height).toBeLessThanOrEqual(titleBox.y);

  // Renaming is the title's own double click (ADR 0036), and it must not open
  // the Card — an opened Card covers the field being typed into.
  await card.getByRole('heading', { name: 'A' }).dblclick();
  await expect(page.getByTestId('open-card')).toHaveCount(0);
  const title = page.getByRole('textbox', { name: 'Card title' });
  await title.fill('Renamed A');
  await title.press('Enter');

  const renamed = nodeByTitle(page, 'Renamed A').first();
  await expect(renamed).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  expect(await allPositions(page)).toEqual(before);

  await openCard(renamed, 'Renamed A');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await renamed.click();
  await page.keyboard.press('F2');
  const keyboardTitle = page.getByRole('textbox', { name: 'Card title' });
  await expect(keyboardTitle).toBeVisible();
  await keyboardTitle.fill('');
  await nodeByTitle(page, 'B').first().click();
  await expect(keyboardTitle).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('open-card')).toHaveCount(0);
  await quiescent(page);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await keyboardTitle.focus();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(nodeByTitle(page, 'Renamed A').first()).toBeVisible();
});

test('a click selects a Card, and no pointer gesture on its body opens it', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);
  const transform = await viewportTransform(page);

  await card.click();
  await expect(card).toHaveClass(/selected/);
  await expect(page.getByTestId('open-card')).toHaveCount(0);

  // Off the title, which has its own double click. React Flow zooms on a double
  // click by default and its filter exempts only `.nopan`, which a Card is not.
  await card.dblclick({ position: { x: 24, y: 12 } });
  await expect(page.getByTestId('open-card')).toHaveCount(0);
  expect(await viewportTransform(page)).toEqual(transform);
});

test('the Card affordance opens the Card on its editable fields', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  await openCard(card, 'A');

  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('A');
  await expect(source).toHaveValue(/entry point/);
  await source.fill('Authored from the graph');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await page.reload();
  await openCard(nodeByTitle(page, 'A').first(), 'A');
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toHaveValue(
    'Authored from the graph',
  );
});

test('a title authored in the pane persists like one authored on the graph', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  await openCard(card, 'A');
  await page.getByRole('textbox', { name: 'Title' }).fill('Renamed from the pane');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(nodeByTitle(page, 'Renamed from the pane').first()).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await page.reload();
  await expect(nodeByTitle(page, 'Renamed from the pane').first()).toBeVisible();
});

test('opened Markdown editing persists source and description without moving Cards', async ({
  page,
}) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);
  const before = await allPositions(page);

  await openCard(card, 'A');
  await page.getByRole('textbox', { name: 'Description' }).fill('Edited in place');
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Edited\n\nNew source');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByTestId('open-card')).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  expect(await allPositions(page)).toEqual(before);
  await expect(card.getByTestId('card-description')).toHaveText('Edited in place');

  await page.reload();
  const persisted = nodeByTitle(page, 'A').first();
  await expect(persisted.getByTestId('card-description')).toHaveText('Edited in place');
  await openCard(persisted, 'A');
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toHaveValue(
    '# Edited\n\nNew source',
  );
});

test('editing an Alias updates only its metadata and survives reload', async ({ page }) => {
  await page.goto('/');
  const alias = nodeByTitle(page, 'A′').first();
  await expect(alias).toBeVisible();
  await settled(page);
  const before = await allPositions(page);

  await openCard(alias, 'A′');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('A′');
  await expect(page.getByRole('textbox', { name: /Description/ })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /Markdown source/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Title' }).fill('Recap');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  expect(await allPositions(page)).toEqual(before);
  await expect(nodeByTitle(page, 'Recap').first().getByTestId('alias-marker')).toHaveText('A');

  await page.reload();
  await expect(nodeByTitle(page, 'Recap').first()).toBeVisible();
});

/**
 * Dragging a card writes its placement into the Layout.
 *
 * The fixture names no `defaultView`, so it opens in Flow however many Layouts
 * it declares, and this first edit converts the resolved automatic arrangement
 * into a Layout of its own (ADR 0025). What this asserts is the point of
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

test('selecting Flow or Grid is navigation and does not persist', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await settled(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await page.getByTestId('layout-selector').click();
  await expect(page.getByText('Layouts · authored')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('graph-selector').click();
  await expect(page.getByText('Active Graph', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('view-selector').click();
  await page.getByRole('option', { name: 'Grid' }).click();
  await expect(page.getByTestId('view-selector')).toContainText('Grid');
  await expect(page.getByTestId('layout-selector')).toContainText('None');
  await expect(page.getByTestId('layout-live-indicator')).toHaveCount(0);
  await expect(persistence).toHaveAttribute('data-revision', '0');

  await page.getByTestId('view-selector').click();
  await page.getByRole('option', { name: 'Flow' }).click();
  await expect(page.getByTestId('view-selector')).toContainText('Flow');
  await expect(persistence).toHaveAttribute('data-revision', '0');
});

test('connecting from Flow and Grid converts atomically without moving Cards', async ({ page }) => {
  await page.goto('/');
  for (const [index, view, targetTitle] of [
    [0, 'Flow', 'E'],
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

      // Conversion produces a Layout owning one fresh, empty Graph (ADR 0045),
      // and this Edge is what the same Edit puts in it. The renderer is now that
      // Layout, which draws the Graphs it owns and only those — so the fixture's
      // thirteen are off screen rather than lost, and one Edge is the whole of
      // what this view has to draw.
      await expect(page.locator('.react-flow__edge')).toHaveCount(1);
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
  // The converted Layout owns one fresh Graph and this Edge is all it holds, so
  // the Graphs the fixture's own two Layouts own are not drawn here.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // `Persisted` says the commit was acknowledged, not that the conversion is what
  // reopens. Reload against the same repository: the created Layout must still be
  // `defaultView`, still hold the created Card and still carry its Edge — a
  // conversion that only lived in runtime state passes every assertion above.
  await page.reload();
  await expect(nodeByTitle(page, 'Card 1')).toBeVisible();
  await settled(page);
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
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

/**
 * Dragged in an authored Layout, because that is where a Card and the Edges
 * around it stay together.
 *
 * A drag on an Algorithmic View converts it, and Flow converts by returning one
 * fresh *empty* Graph (ADR 0045) — so the Layout the drag produces has no Edge
 * left to watch. The fixture's own `Collection 1` owns Long, Mid and Short over
 * the spine, so dragging A there updates that Layout in place and its Edges are
 * still drawn around the Card that moved.
 */
test('edges follow a card that has been dragged', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();

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

  // Whatever geometry the arrangement computed described where the cards were,
  // so it is stale the moment one leaves it. The edge is redrawn between where
  // the cards now are.
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

  // Automatic means automatic: the status is the whole indicator and there is
  // nothing to press (ADR 0030). A reintroduced Save would still let every
  // assertion above pass.
  await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
});

test('a selected Card exposes four circular handles coloured as the active Graph', async ({
  page,
}) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  // Selecting is all this needs, and it keeps the Active Graph the fixture's
  // own first one — a drag here would convert the View and activate the empty
  // Graph the conversion mints, leaving no Edge to read a colour from.
  await a.click();
  await expect(a).toHaveClass(/selected/);

  const handles = a.locator('.rf-card-node__authoring-handle--source');
  await expect(handles).toHaveCount(4);
  await expect(handles.first()).toHaveCSS('width', '24px');
  await expect(handles.first()).toHaveCSS('height', '24px');
  const graphStroke = await page
    .locator('.rf-graph-edge')
    .filter({ has: page.locator('.react-flow__edge-path') })
    .first()
    .locator('.react-flow__edge-path')
    .evaluate((edge) => getComputedStyle(edge).stroke);
  const handleColors = await handles.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).backgroundColor),
  );
  expect(handleColors).toEqual(Array(4).fill(graphStroke));
  expect(
    await handles.evaluateAll((elements) =>
      elements.every((element) => getComputedStyle(element).borderRadius === '50%'),
    ),
  ).toBe(true);
  await expect(a.locator('.rf-card-node__port').first()).toHaveCSS('opacity', '0');
});

test('drawing between existing Cards persists one active-Graph Edge and selects the target', async ({
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
  // The Graph this Edge will join is the one conversion minted, and it is what
  // colours both the handle and the preview (ADR 0033). Read off the handle
  // rather than written down, so the assertion below is that the two agree
  // rather than that either matches a palette entry a test knows by heart.
  const activeGraphColor = await sourceHandle.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await connectHandles(page, sourceHandle, targetHandle, async () => {
    // Every Card offers a target on every side while a connection is in flight,
    // so the drop is never blocked by which side the author aimed at.
    await expect(targetHandles.first()).toHaveCSS('opacity', '1');
    await expect(targetHandles).toHaveCount(FIXTURE_CARD_COUNT * AUTHORING_HANDLE_SIDES);
    const preview = page.locator('.react-flow__connection-path');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS('stroke', activeGraphColor);
    await expect(preview).toHaveAttribute('marker-end', /url/);
  });

  // One Edge, because the selected Layout draws the Graphs it owns and the one
  // it owns is the empty Graph conversion minted a moment ago.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
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

test('an authored Edge is immediately available when presenting the Graph', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'E').first();
  const target = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Convert the Algorithmic View through the public placement gesture, then
  // author E → A into the empty Graph that conversion minted. It is that
  // Graph's only Edge, so E is where presenting it begins.
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
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000008');
  await expect(page.getByTestId('presenting-moves').getByRole('button')).toHaveText('A');

  await page.keyboard.press('ArrowRight');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000002');
  await page.keyboard.press('ArrowLeft');
  await expect(activeCard(page)).toHaveAttribute('data-id', '00000000-0000-4000-8000-000000000008');
});

test('an Edge drawn from the presented Card is a move the presenter can take now', async ({
  page,
}) => {
  const A = '00000000-0000-4000-8000-000000000002';
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  const b = nodeByTitle(page, 'B').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);

  // Authoring completes an Edge only in a selected Layout, so convert the
  // Algorithmic View through the public placement gesture first. Conversion
  // mints an *empty* Graph (ADR 0045), which cannot be presented at all, so
  // A → B is what gives this Graph something to traverse.
  await dragBy(page, a, 0, -100);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await settled(page);
  await connectHandles(
    page,
    authoringHandle(a, 'source', 'right'),
    authoringHandle(b, 'target', 'left'),
  );
  await expect(persistence).toHaveAttribute('data-revision', '2');
  await settled(page);
  // Drawing an Edge selects its target (B), and a Card's source handles are the
  // hovered or selected Card's. The gesture below is made from the presented
  // Card, so A has to be the selected one going in.
  await a.click();
  await expect(a).toHaveClass(/selected/);

  await page.getByTestId('present-button').click();
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeCard(page)).toHaveAttribute('data-id', A);
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
    authoringHandle(activeCard(page), 'source', 'right'),
    authoringHandle(activeCard(page), 'target', 'left'),
  );

  // Attached rather than visible: with one Graph on the Card its inbound and
  // outbound handles sit at the same height, so a self-Edge is a flat line whose
  // box has no height — which Playwright reads as hidden. The moves below are
  // what prove it was authored.
  await expect(page.getByLabel(`Edge from ${A} to ${A}`)).toBeAttached();
  await expect(persistence).toHaveAttribute('data-revision', '3');
  await expect(persistence).toHaveText('Persisted');

  // The chrome enumerates the active Card's outgoing Edges, so the Edge just
  // drawn is available without leaving and re-entering presentation.
  await expect(moves).toHaveText(['B', 'A']);
});

/**
 * An Edge the emphasised Graph already holds is not a duplicate here.
 *
 * A → B is Long's first Edge and Long is emphasised on load, so this used to be
 * the refusal case. It is not one any more: on an Algorithmic View the Edge
 * joins the fresh, empty Graph conversion mints rather than the Graph being
 * emphasised (ADR 0045), so it is that Graph's *first* Edge and there is nothing
 * to duplicate. The refusal now belongs to a selected Layout, whose Active Graph
 * is one an Edit can genuinely repeat an Edge in — asserted below, live.
 */
test('drawing an Edge the emphasised Graph already holds converts rather than refusing', async ({
  page,
}) => {
  const A = '00000000-0000-4000-8000-000000000002';
  const B = '00000000-0000-4000-8000-000000000003';
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

  // Attached rather than visible: A and B are on the same ELK row, so this Edge
  // is a dead-horizontal line with a zero-height box, which Playwright reads as
  // hidden.
  await expect(page.getByLabel(`Edge from ${A} to ${B}`)).toBeAttached();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  // Conversion copies what is on screen; nothing moves at the moment of it.
  expect(await allPositions(page)).toEqual(before);

  // Drawn a second time, in the Layout that now owns the Graph holding it, it is
  // the duplicate the rule is about — refused, with nothing persisted. The
  // assertions are negative, so they need the barrier to mean anything.
  await source.hover();
  await connectHandles(
    page,
    authoringHandle(source, 'source', 'right'),
    authoringHandle(target, 'target', 'left'),
  );
  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
});

/**
 * Two connections in one session, chained so the second starts from the Card the
 * first selected.
 *
 * The second one is the whole point. A Card's declared handles (`projection.ts`)
 * include every Graph id, not only the ones incident to it, so a completed
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
  // The renderer is the Layout this Edit converted into, so it draws its own
  // Graph and nothing else — one Edge, then two.
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await settled(page);

  await connectHandles(
    page,
    authoringHandle(e, 'source', 'right'),
    authoringHandle(f, 'target', 'top'),
  );
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('changing the active Graph recolours authoring handles without persisting or filtering', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');
  // On the Algorithmic View, whose subject is the Space's Cards, all four
  // Graphs are drawn and all four can be activated — a converted Layout owns
  // only the one Graph its conversion minted, so there would be nothing to
  // change to.
  await source.hover();
  const handle = source.locator('.rf-card-node__authoring-handle--source').first();
  const longColour = await handle.evaluate((element) => getComputedStyle(element).backgroundColor);

  await page.getByTestId('graph-selector').click();
  await page.getByRole('option', { name: 'Mid' }).click();

  await source.hover();
  await expect(handle).not.toHaveCSS('background-color', longColour);
  await expect(page.locator('.react-flow__edge')).toHaveCount(FIXTURE_EDGE_COUNT);
  await expect(persistence).toHaveAttribute('data-revision', '0');
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

  await expect(page.getByTestId('open-card')).toHaveCount(0);
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

  // Selecting is all a click does now (ADR 0036), so there is no opened Card to
  // close before the keys under test are pressed.
  const cardBox = (await card.boundingBox())!;
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await expect(card).toHaveClass(/selected/);
  await expect(page.getByTestId('open-card')).toHaveCount(0);

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
        // `elementFromPoint` answers null outside the viewport and `closest`
        // answers null off an edge, but optional chaining turns the first into
        // `undefined` — so `!== null` accepted a point covering no edge at all
        // and the click below landed on the pane.
        const hit = document.elementFromPoint(point.x, point.y)?.closest('.react-flow__edge');
        if (hit) return { x: point.x, y: point.y };
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
 *
 * It is a rule about the Active Graph of a *selected Layout*: on an Algorithmic
 * View the Edge joins the Graph conversion mints, so no Edge drawn there can
 * duplicate anything (ADR 0045). The drag and the first connection below are
 * what put this Space in the state the rule is about.
 */
test('a duplicate Edge is marked invalid while the drag is still live', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  await dragBy(page, source, 0, -100);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
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

  // Author A→B into the Layout's own Graph, so the Active Graph now holds it.
  await startDrag();
  await expect(await dragOnto('B')).toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await settled(page);

  // A→B is now an Edge of the Active Graph; A→E is not.
  await startDrag();
  const overDuplicate = await dragOnto('B');
  // Wait for React Flow to mark the handle as the drag's current target before
  // asserting what it did *not* mark. Asserting the absence of `valid` straight
  // after the move can pass because no connection class has landed yet, which
  // would make this test green even if `isValidConnection` were never consulted.
  await expect(overDuplicate).toHaveClass(/connectingto/);
  await expect(overDuplicate).not.toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  await startDrag();
  await expect(await dragOnto('E')).toHaveClass(/valid/);
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '3');
});

/**
 * The app is behind the pane, and the toolbar is part of the app.
 *
 * This replaces a test that changed the renderer *from under* an open editor and
 * checked the pane closed with it — the guard against an editor stranded over a
 * graph that is still arranging, whose Edit is refused for having no placement
 * while `Done` closes the pane either way. `Navigation.selectRenderer` still
 * clears the opened Card and `navigation.test.ts` holds it; what changed is that
 * the gesture can no longer be made. A modal Dialog takes pointer events off
 * everything outside its content (ADR 0047), and the backdrop is fixed to the
 * viewport so the header is dimmed rather than left looking available.
 *
 * The second half is the regression that would be silent in jsdom: the app has
 * to come back. Radix restores `pointer-events` on unmount, and a modal that
 * leaves the body inert is a known way for that to go wrong.
 */
test('an opened Card puts the app behind it, and gives it back on close', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await settled(page);
  await openCard(card, 'A');
  await page
    .getByRole('textbox', { name: 'Markdown source' })
    .fill('Typed into a pane the toolbar cannot reach');

  const viewSelector = page.getByTestId('view-selector');
  await expect(viewSelector).toBeVisible();
  // Visible, dimmed by the backdrop, and answering nothing: the modality is the
  // primitive's and it covers the chrome as well as the graph.
  await expect(async () => {
    await viewSelector.click({ trial: true, timeout: 250 });
  }).rejects.toThrow();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('open-card')).toHaveCount(0);

  await viewSelector.click();
  await page.getByRole('option', { name: 'Grid' }).click();
  await settled(page);
  // Nothing was written, and nothing was persisted from the abandoned draft.
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * Containment, in a browser that actually moves focus on `Tab`.
 *
 * The unit tests beside `OpenCard` press `Tab` through `fireEvent`, which runs
 * the handler but moves nothing — jsdom implements no sequential navigation. So
 * they prove the two wrap-around branches call `focus()` and cannot prove
 * containment: a break that left the wraps intact would pass them.
 *
 * The graph behind the pane cannot be `inert`, because React Flow measures its
 * nodes and keeps them in the tab order, so this is the only thing keeping a
 * keyboard author off Cards that answer `Enter` by opening themselves.
 */
test('an opened Card keeps Tab inside it, so the graph behind cannot take focus', async ({
  page,
}) => {
  await page.goto('/');
  await settled(page);
  await openCard(nodeByTitle(page, 'A').first(), 'A');
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();

  const withinPane = () =>
    page.evaluate(() => document.activeElement?.closest('.card-pane__panel') !== null);

  // More presses than the pane has controls, so a leak shows as focus landing on
  // the toolbar or a Card rather than wrapping back to the first field.
  for (let press = 1; press <= 8; press += 1) {
    await page.keyboard.press('Tab');
    expect(await withinPane(), `focus left the pane after ${press} Tab presses`).toBe(true);
  }
  for (let press = 1; press <= 8; press += 1) {
    await page.keyboard.press('Shift+Tab');
    expect(await withinPane(), `focus left the pane after ${press} Shift+Tab presses`).toBe(true);
  }
});

/**
 * The same containment, after the pointer gesture that used to traverse straight
 * out of it — and the one place Radix's containment reads differently from the
 * hand-roll it replaced.
 *
 * A mousedown on anything unfocusable moves focus to `<body>`, and the old pane
 * answered that by cancelling the default, so focus never left. `FocusScope`
 * lets it leave and pulls it back on the way in: a `focusout` whose
 * `relatedTarget` is null is deliberately ignored, because that is also what a
 * lost window looks like, and a `focusin` anywhere outside the content is
 * redirected to the last element inside it. So the property is not "focus never
 * leaves" but "focus cannot come to rest outside" — which is the one that
 * matters, since a Card node answers `Enter` by opening itself and `<body>` does
 * not. The backdrop and the panel's own padding are the two surfaces that reach
 * this; both were confirmed to escape before any of it existed.
 */
test('an opened Card keeps Tab inside it after a click that focuses nothing', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  await openCard(nodeByTitle(page, 'A').first(), 'A');
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();

  const withinPane = () =>
    page.evaluate(() => document.activeElement?.closest('.card-pane__panel') !== null);

  // The overlay's top-left corner is inside its 2rem padding, so it is backdrop
  // whatever the viewport does to the panel it letterboxes.
  await page.locator('.card-pane').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Tab');
  expect(await withinPane(), 'focus left the pane on the Tab after a backdrop click').toBe(true);

  // And the panel's own corner, which is its 1rem padding ring. `Content` is
  // `tabIndex={-1}`, so this one focuses the panel itself and never leaves.
  await page.locator('.card-pane__panel').click({ position: { x: 4, y: 4 } });
  expect(await withinPane(), 'focus left the pane when its padding was clicked').toBe(true);
  await page.keyboard.press('Tab');
  expect(await withinPane(), 'focus left the pane on the Tab after a padding click').toBe(true);

  // A click on a control still focuses it, which nothing here may cost.
  await page.getByRole('textbox', { name: 'Markdown source' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toBeFocused();
  // Including through a label's text, which focuses its field by click.
  await page.getByText('Description', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();

  // The backdrop is not a way out, either: outside dismissal is declined so the
  // one exit that does not commit stays the button that says Cancel (ADR 0048).
  await page.locator('.card-pane').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('open-card')).toBeVisible();

  // A scrollbar inside the pane can be dragged. The old containment cancelled
  // the mousedown default on everything that was not a control, the pane's own
  // scrollbars included, so dragging one did nothing.
  const draggable = await page.evaluate(() => {
    const fields = document.querySelector<HTMLElement>('.card-pane__fields');
    if (fields === null) return false;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    fields.dispatchEvent(down);
    return !down.defaultPrevented;
  });
  expect(draggable, 'a mousedown inside the pane was cancelled').toBe(true);
});

/**
 * Closing hands focus back to the Card, not to the document.
 *
 * It cannot hand it back to the control that opened it: opening withdraws every
 * Card affordance (`titleEditingEnabled` goes false while a Card is open), so
 * that control no longer exists by the time the pane closes. The Card itself is
 * still there, is focusable outside presenting, and is where the author was — so
 * it is what `Escape` and `Cancel` return to, leaving `Enter` to reopen and `F2`
 * to rename without a journey back through the tab order.
 */
test('closing an opened Card returns focus to the Card, not the document', async ({ page }) => {
  await page.goto('/');
  await settled(page);
  const card = nodeByTitle(page, 'A').first();
  await openCard(card, 'A');
  await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('open-card')).toHaveCount(0);

  await expect(card).toBeFocused();
  // And the Card answers the key it advertises, without a Tab in between.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('open-card')).toBeVisible();
});

/**
 * Add Card from an Algorithmic View: one conversion, and the naming that
 * follows it.
 *
 * The fixture opens in Flow because it declares no `defaultView`, so this is the
 * ordinary first Edit an author makes. Two things are being watched that a unit
 * test cannot see: that the conversion happens exactly once — the fixture's own
 * two Layouts plus one, not two — and that the created Card really is under the
 * caret, in a browser where focus is the browser's to give.
 */
test('Add Card converts an Algorithmic View once and names the Card in place', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const before = await allPositions(page);
  const addCard = page.getByTestId('add-card');
  await expect(addCard).toBeEnabled();

  await addCard.click();

  const title = page.getByRole('textbox', { name: 'Card title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Card 1');
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  // Converting moves nothing: the Cards on screen keep the positions the View
  // computed for them (ADR 0025).
  const after = await allPositions(page);
  for (const [id, position] of Object.entries(before)) {
    expect(after[id], `card ${id} moved`).toEqual(position);
  }

  await title.fill('Consequences');
  await title.press('Enter');

  await expect(nodeByTitle(page, 'Consequences')).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  // One conversion, so one new Layout beside the two the fixture declares.
  await page.getByTestId('layout-selector').click();
  await expect(page.getByRole('option')).toHaveCount(3);
  await page.keyboard.press('Escape');
});

/**
 * The Alias creation state is local and creates nothing (ADR 0042).
 *
 * Cancelling it must leave the Space exactly as it was — no Card, no conversion,
 * no commit — and must leave focus somewhere an author can carry on from. The
 * revision assertion needs `quiescent`: "still 0" passes instantly against a
 * commit that has not happened yet.
 */
test('cancelling the Alias Target picker creates nothing', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  const search = page.getByRole('combobox', { name: 'Target' });
  await expect(search).toBeFocused();
  await search.fill('A');

  // One press, from a field holding a draft: Escape is Cancel's alias and the
  // field takes no first press of its own (ADR 0048).
  await search.press('Escape');

  await expect(page.getByTestId('new-alias')).toHaveCount(0);
  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);
  await expect(page.getByTestId('layout-selector')).toContainText('None');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await expect(page.getByTestId('add-card-menu')).toBeFocused();
});

/**
 * The pane's actions stay put when the pane cannot fit its content.
 *
 * `.card-pane__panel` is a fixed 16/9 frame that clips, and its width is clamped
 * by viewport height — so on a short or narrow window the panel is smaller than
 * what is in it. The opened-Card editor survives that because its Markdown field
 * absorbs the squeeze, but the Alias creation pane has no such field: heading,
 * Title, list, hint and actions are all fixed.
 *
 * This once wheeled 600px to reach `Cancel`, and that wheel was the standing
 * evidence for a defect: the actions were inside the scrolling region, so they
 * scrolled away with the fields. Reaching them at rest is what the fix means,
 * and the wheel went with it.
 *
 * 500px is below the ~620px where clipping begins, measured against this pane.
 */
test('keeps the Alias pane’s actions in place on a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  await expect(page.locator('.card-pane__panel')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();
  // And the fields above them really are the part that moved out of reach: the
  // region holding them is what scrolls.
  const scrolls = await page.evaluate(() => {
    const fields = document.querySelector('.card-pane__fields');
    return fields !== null && fields.scrollHeight > fields.clientHeight;
  });
  expect(scrolls, 'the pane fits at 500px, so this proves nothing').toBe(true);
});

/**
 * The Title beside that picker holds a draft and takes no press of its own for
 * it: Escape is the pane's, with a label on it.
 */
test('the Alias title draft is discarded by Escape, in one press', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  const title = page.getByTestId('new-alias-title');
  await title.fill('Recap');

  await title.press('Escape');

  await expect(page.getByTestId('new-alias')).toHaveCount(0);
  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * Choosing a Target is the creation, and the editor stays open on what it made.
 */
test('choosing a Target creates the Alias and leaves its editor open', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  await page.getByRole('combobox', { name: 'Target' }).fill('B');
  await page.getByRole('option', { name: 'Markdown Card B' }).click();

  // The pane it is now on authors the Alias that creation just made.
  await expect(page.getByTestId('new-alias')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'B' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // An empty title takes the Target's, so the Alias is a second Card called B.
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
  await expect(nodeByTitle(page, 'B')).toHaveCount(2);
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * The whole gesture, and the reason the Title field had to exist.
 *
 * An empty title takes the Target's, so creation leaves two Cards called `B` and
 * the author standing in the one pane that could not tell them apart — no Title
 * field, and the fields it did draw belonging to the other Card. Renaming has to
 * be reachable from where the author already is, has to reach the *Alias*, and
 * has to leave the Target's own title alone.
 *
 * Frame 4's focus rule rides along: this pane opens on its first field, and the
 * Target picker no longer takes the caret off it.
 */
test('an Alias is renamed in the editor its creation leaves open', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  await page.getByRole('combobox', { name: 'Target' }).fill('B');
  await page.getByRole('option', { name: 'Markdown Card B' }).click();

  const title = page.getByRole('textbox', { name: 'Title' });
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('B');
  await title.fill('Recap');
  // Enter in a single-line field submits the form it is in, which on this pane
  // is `Done` — the platform's own rule, and the one ADR 0048 leaves standing
  // now that the field commits nothing by itself.
  await title.press('Enter');

  await expect(page.getByTestId('open-card')).toHaveCount(0);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(1);
  // The Target keeps its own: one Card called B, the one that was always there.
  await expect(nodeByTitle(page, 'B')).toHaveCount(1);
  await quiescent(page);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

/**
 * And the rename is a draft, so Escape discards it and closes — one press, and
 * the same thing `Cancel` beside it does (ADR 0048).
 *
 * The Alias itself is not a draft and does not come back with it — it was
 * created the moment the Target was chosen, one revision earlier — so this is
 * also the test that the two are told apart.
 */
test('an Alias rename draft is discarded by Escape, in one press', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  await page.getByRole('combobox', { name: 'Target' }).fill('B');
  await page.getByRole('option', { name: 'Markdown Card B' }).click();
  const title = page.getByRole('textbox', { name: 'Title' });
  await title.fill('Recap');

  await title.press('Escape');

  await expect(page.getByTestId('open-card')).toHaveCount(0);
  await quiescent(page);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(0);
  await expect(nodeByTitle(page, 'B')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/** Title and Target are one pending Alias edit (ADRs 0048 and 0049). */
test('retargeting an open Alias keeps its metadata draft until Done', async ({ page }) => {
  await page.goto('/');
  const alias = nodeByTitle(page, 'A′').first();
  await expect(alias).toBeVisible();
  await settled(page);

  await openCard(alias, 'A′');
  const title = page.getByRole('textbox', { name: 'Title' });
  await title.fill('Retargeted');

  await page.getByRole('combobox', { name: 'Target' }).fill('B');
  await page.getByRole('option', { name: 'Markdown Card B' }).click();

  await expect(title).toHaveValue('Retargeted');
  await expect(page.getByRole('textbox', { name: /Markdown source/ })).toHaveCount(0);
  await quiescent(page);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');

  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByTestId('open-card')).toHaveCount(0);
  const retargeted = nodeByTitle(page, 'Retargeted').first();
  await expect(retargeted).toBeVisible();
  await expect(retargeted.getByTestId('alias-marker')).toHaveText('B');
});
