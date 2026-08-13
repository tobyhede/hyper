import type { Locator, Page } from '@playwright/test';
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

/**
 * A point on the pane far enough from every handle that React Flow resolves no
 * connection target — `connectionRadius` is 20 at the pinned 12.11.2, so a
 * release nearer than that reads as aiming at a handle rather than at canvas.
 */
async function emptyCanvasPoint(page: Page): Promise<{ x: number; y: number }> {
  const pane = await boxOf(page.locator('.react-flow__pane'), 'the React Flow pane');
  const point = { x: pane.x + 24, y: pane.y + 24 };
  const clear = await page.evaluate((at) => {
    // Optional chaining would turn a null hit into `undefined`, which is neither
    // `=== null` nor `!== null` in the way either check reads — so the element is
    // required first and only then asked what it is under.
    const hit = document.elementFromPoint(at.x, at.y);
    return hit !== null && hit.closest('.react-flow__node') === null;
  }, point);
  expect(clear, 'the chosen point is over a Card rather than empty canvas').toBe(true);
  return point;
}

/**
 * Drag one endpoint of a selected Edge to a screen point.
 *
 * The anchors are transparent circles React Flow draws only on a reconnectable
 * Edge, so the press is asserted to land on one — a Card handle drawn over it
 * would otherwise read as a reconnection that silently never began. React Flow
 * starts the connection on the first move after mousedown and can swallow a
 * single jump, which is why the move is stepped, as in `connectHandles`.
 */
async function dragEndpointTo(
  page: Page,
  edge: Locator,
  end: 'source' | 'target',
  to: { x: number; y: number },
): Promise<void> {
  const anchor = await boxOf(edge.locator(`.react-flow__edgeupdater-${end}`), `the ${end} anchor`);
  const from = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  const onAnchor = await page.evaluate((at) => {
    const hit = document.elementFromPoint(at.x, at.y);
    return hit !== null && hit.closest('.react-flow__edgeupdater') !== null;
  }, from);
  expect(onAnchor, `the ${end} reconnect anchor is covered at its own centre`).toBe(true);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + 12, from.y, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 6 });
  } finally {
    await page.mouse.up();
  }
}

/** Drag one endpoint onto a Card's authoring target handle. */
async function reconnectOnto(
  page: Page,
  edge: Locator,
  end: 'source' | 'target',
  targetHandle: Locator,
): Promise<void> {
  const anchor = await boxOf(edge.locator(`.react-flow__edgeupdater-${end}`), `the ${end} anchor`);
  const from = { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + 12, from.y, { steps: 3 });
    // Target handles appear only once React Flow has really started the
    // connection, so this gate is what stops a release that ends a drag which
    // never began being reported as a missing Edit later.
    await expect(targetHandle).toHaveCSS('opacity', '1');
    await expect(targetHandle).toHaveClass(/connectableend/);
    await targetHandle.hover();
    expect(await targetHandle.evaluate((element) => element.matches(':hover'))).toBe(true);
  } finally {
    await page.mouse.up();
  }
}

/**
 * Click one focusable Edge, and answer the accessible name it carries.
 *
 * Only the Active Graph's Edges are selectable, and an Edge is an SVG path a few
 * pixels wide, so the point is found by walking the geometry and hit-testing:
 * `elementFromPoint` answers null outside the viewport and `closest` answers null
 * off an Edge, so both are checked rather than assumed.
 */
async function selectAnEdge(page: Page): Promise<string> {
  const point = await page
    .locator('.react-flow__edge[tabindex] .react-flow__edge-path')
    .evaluateAll((paths) => {
      for (const path of paths) {
        const geometry = path as SVGPathElement;
        const transform = geometry.getScreenCTM();
        if (transform === null) continue;
        const length = geometry.getTotalLength();
        for (const fraction of [0.5, 0.25, 0.75, 0.4, 0.6]) {
          const at = geometry.getPointAtLength(length * fraction).matrixTransform(transform);
          const hit = document.elementFromPoint(at.x, at.y)?.closest('.react-flow__edge');
          if (hit) return { x: at.x, y: at.y };
        }
      }
      throw new Error('No focusable Edge has a clickable point.');
    });
  await page.mouse.click(point.x, point.y);
  const selected = page.locator('.react-flow__edge.selected');
  await expect(selected).toHaveCount(1);
  return (await selected.getAttribute('aria-label')) ?? '';
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

test('editing through an Alias updates its target and survives reload', async ({ page }) => {
  await page.goto('/');
  const target = nodeByTitle(page, 'A').first();
  const alias = nodeByTitle(page, 'A′').first();
  await expect(alias).toBeVisible();
  await settled(page);
  const before = await allPositions(page);

  await openCard(alias, 'A′');
  await expect(page.getByText('Opened through A′')).toBeVisible();
  await expect(page.getByText('Editing content on A')).toBeVisible();
  // The Title is the *occurrence's* own, and this line is what says so: it read
  // `toHaveCount(0)` and pinned a pane that could not rename the Alias it was
  // opened on at all. What it was guarding — that no field here renames the Card
  // that owns the content — is the value, not the absence.
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('A′');
  // Named for the Card they author, exactly, because A′ carries a description of
  // its own on the graph behind this pane and these fields do not write it.
  await page
    .getByRole('textbox', { name: 'Description of A', exact: true })
    .fill('Shared through every occurrence');
  await page
    .getByRole('textbox', { name: 'Markdown source of A', exact: true })
    .fill('One shared source');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  expect(await allPositions(page)).toEqual(before);
  await expect(nodeByTitle(page, 'A′').first()).toBeVisible();

  await openCard(target, 'A');
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue(
    'Shared through every occurrence',
  );
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toHaveValue(
    'One shared source',
  );
  await page.getByRole('button', { name: 'Cancel' }).click();

  await openCard(nodeByTitle(page, 'A′').first(), 'A′');
  await expect(
    page.getByRole('textbox', { name: 'Markdown source of A', exact: true }),
  ).toHaveValue('One shared source');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.reload();
  await openCard(nodeByTitle(page, 'A′').first(), 'A′');
  await expect(
    page.getByRole('textbox', { name: 'Markdown source of A', exact: true }),
  ).toHaveValue('One shared source');
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
  // An Edge names its Cards and its Graph for a screen reader. Matched loosely
  // on the Graph, whose neutral title depends on how many the Space already had.
  await expect(page.getByLabel(/^Edge from A to E in /)).toBeVisible();
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

  await expect(page.getByLabel(/^Edge from E to A in /)).toBeVisible();
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
  await expect(page.getByLabel(new RegExp(`^Edge from A to A in `))).toBeAttached();
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
  await expect(page.getByLabel(new RegExp(`^Edge from A to B in `))).toBeAttached();
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
 * The Delete key acts on the selected Edge through `onBeforeDelete`.
 *
 * React Flow's own document-level handler finds the selection and asks; Hyper
 * answers `false` so nothing is removed locally, and the completed Space Edit
 * supplies the next projection. That indirection is the point — a local removal
 * would put the canvas in a state the Space never agreed to.
 *
 * `deleteKeyCode` is `['Backspace', 'Delete']`: React Flow defaults to Backspace
 * alone, so both keys are exercised.
 */
for (const key of ['Backspace', 'Delete'] as const) {
  test(`${key} removes the selected Edge from its Graph and nothing else`, async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
    // An Edge belongs to a Layout's Graph, so an Edge Edit needs one selected.
    await selectLayout(page, 'Collection 1');
    await settled(page);
    const drawn = await page.locator('.react-flow__edge').count();
    const persistence = page.getByTestId('persistence-status');
    await expect(persistence).toHaveAttribute('data-revision', '0');

    await selectAnEdge(page);
    await page.keyboard.press(key);

    await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - 1);
    await expect(page.locator('.react-flow__node')).toHaveCount(FIXTURE_CARD_COUNT);
    await expect(persistence).toHaveAttribute('data-revision', '1');
    await expect(persistence).toHaveText('Persisted');
  });
}

/**
 * A Card deletion and an Edge deletion arrive through the same callback.
 *
 * React Flow gathers every deletable Edge incident to a requested node *before*
 * calling `onBeforeDelete`, so without the canvas dispatcher one Card removal
 * would look like several independent Edge deletions — and would drop those
 * Edges while the Card stayed. Card deletion is package 8's, so the whole
 * payload is declined here; what this pins is that the Edges went with it.
 */
test('Backspace with a Card selected removes neither the Card nor its Edges', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const cardBox = (await card.boundingBox())!;
  await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await expect(card).toHaveClass(/selected/);

  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await quiescent(page);

  await expect(page.locator('.react-flow__node')).toHaveCount(FIXTURE_CARD_COUNT);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * The assistive description names the keys that actually do something.
 *
 * React Flow's defaults offer "press delete to remove it" for both kinds. For an
 * Edge that is now true and the description says so; for a Card it is not —
 * removing one is package 8's — so the Card keeps a description that names only
 * opening and moving. Sighted users never meet either claim; a screen reader
 * reads it out as the way to work with the graph.
 */
test('the graph advertises the Edge delete it implements and no Card delete', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('[id^="react-flow__node-desc"]')).not.toContainText(/delete/i);
  await expect(page.locator('[id^="react-flow__node-desc"]')).toContainText(/open a Card/i);
  await expect(page.locator('[id^="react-flow__edge-desc"]')).toContainText(/delete/i);
});

/**
 * Only the Active Graph's Edges are tab stops, and each is named for a reader.
 *
 * An Edge belonging to another Graph the Layout draws is there to be seen —
 * putting every Edge in the graph into the tab order would place inert stops
 * between a keyboard author and the ones they can act on.
 */
test('only Active Graph Edges are focusable, and focus selects the one reached', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectLayout(page, 'Collection 1');
  await settled(page);

  const activeGraph = page.getByTestId('graph-selector');
  const activeTitle = ((await activeGraph.textContent()) ?? '').trim();
  const focusable = page.locator('.react-flow__edge[tabindex]');
  await expect(focusable.first()).toBeAttached();
  const names = await focusable.evaluateAll((edges) =>
    edges.map((edge) => edge.getAttribute('aria-label') ?? ''),
  );
  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(name).toMatch(/^Edge from .+ to .+ in .+$/);
    expect(name.endsWith(` in ${activeTitle}`), `${name} is not in ${activeTitle}`).toBe(true);
  }
  // Every other Edge the Layout draws is out of the tab order entirely.
  expect(await page.locator('.react-flow__edge:not([tabindex])').count()).toBeGreaterThan(0);

  // React Flow does not select an Edge that receives focus; Hyper bridges that,
  // so the Delete key acts on the Edge a keyboard author reached.
  await focusable.first().focus();
  await expect(focusable.first()).toHaveClass(/selected/);
});

/**
 * React Flow's native Edge Escape clears the selection and calls `blur()`, which
 * can leave focus on `body` — not an authoring context, and not somewhere a
 * workspace command can be issued from. Hyper repairs that and only that: focus
 * already taken by another control is left alone.
 */
test('Escape on a focused Edge leaves focus on the canvas rather than the document', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectLayout(page, 'Collection 1');
  await settled(page);

  const edge = page.locator('.react-flow__edge[tabindex]').first();
  await edge.focus();
  await expect(edge).toHaveClass(/selected/);

  await page.keyboard.press('Escape');

  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? 'NONE'))
    .not.toBe('BODY');
});

/**
 * The toolbar an Edge draws for itself, and the two commands on it.
 *
 * It is rendered through `EdgeLabelRenderer`, so it is ordinary DOM over the
 * canvas rather than SVG, and it appears on the selected Edge alone.
 */
test('a selected Edge offers a toolbar that deletes it and opens its endpoint editor', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();
  await expect(page.getByRole('button', { name: 'Delete this Edge' })).toHaveCount(0);

  await selectAnEdge(page);
  await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();

  // The endpoints, as the keyboard reaches them: two pickers over this Layout's
  // Cards, each showing the Card the Edge currently names.
  await page.getByRole('button', { name: 'Edit this Edge' }).click();
  await expect(page.getByRole('combobox', { name: 'From' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'To' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Delete this Edge' }).click();

  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - 1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

/**
 * Moving an endpoint from the keyboard, through the same picker the pointer drag
 * has no use for.
 *
 * The completion is Space Authoring's and the Edge keeps its Graph — what this
 * proves is that the picker reaches it and the projection redraws from the
 * completed Space rather than from a local React Flow change.
 */
test('the Edge editor moves an endpoint and keeps the Edge in its Graph', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const selected = await selectAnEdge(page);
  await page.getByRole('button', { name: 'Edit this Edge' }).click();
  await page.getByRole('combobox', { name: 'To' }).click();
  // How an *eligible* row is named, which is the only way to name one: cmdk
  // writes `data-disabled` on **every** row, `"false"` included, so the
  // attribute's absence says nothing and only its value distinguishes them.
  // `hasNot` is no use either — it matches a *descendant*, and the primitive
  // marks the option element itself.
  //
  // Here the filter excludes nothing, and that is the fixture rather than the
  // rule: every Graph in it is a line, so no endpoint this list offers would
  // duplicate an existing Edge, and self-Edges, cycles and the endpoint the Edge
  // already names are all eligible (ADR 0032, ADR 0042). It is load-bearing at
  // the keyboard Connect picker below, where B is disabled as a duplicate.
  const option = page.locator('[role="option"][data-disabled="false"]');
  await option.last().click();

  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  // Replaced, not removed: the Graph still draws as many Edges as before.
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(page.getByLabel(selected, { exact: true })).toHaveCount(0);
});

/**
 * A selected Edge's reconnect anchors sit over the Card's four authoring handles
 * where they overlap, and the anchors have to win.
 *
 * Reconnection is per-Edge and narrowed to the *selected* one for exactly this
 * reason: `edgesReconnectable` left globally true would put two transparent
 * anchors permanently live on every Edge, over every Card's handles.
 */
test('reconnect anchors exist only on the selected Edge', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const anchors = page.locator('.react-flow__edgeupdater');
  await expect(anchors).toHaveCount(0);

  await selectAnEdge(page);

  // Two per Edge, source and target, and on one Edge only.
  await expect(anchors).toHaveCount(2);
});

/**
 * Pointer reconnection, end to end through all three native callbacks.
 *
 * The unit tests drive `beginPointerReconnect` directly, so nothing there sees
 * what React Flow actually does around a reconnect drag: it calls
 * `onReconnectStart` and then the *store's* `onConnectStart`, and on release the
 * store's `onConnectEnd` before `onReconnectEnd`. Only a real drag proves the
 * Edge lifecycle survives being handed those pairs.
 *
 * `Long` is A→B→C→D→A′, so moving A→B's target onto D makes A→D, which is no
 * duplicate.
 */
test('dragging an endpoint onto another Card moves it and keeps the Edge in its Graph', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();
  const persistence = page.getByTestId('persistence-status');
  await expect(persistence).toHaveAttribute('data-revision', '0');

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  await expect(edge).toHaveClass(/selected/);

  await reconnectOnto(
    page,
    edge,
    'target',
    authoringHandle(nodeByTitle(page, 'D').first(), 'target', 'left'),
  );

  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to D in Long"]'),
  ).toHaveCount(1);
  // Replaced, not added or dropped: the Graph draws exactly as many Edges.
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(persistence).toHaveAttribute('data-revision', '1');
  await expect(persistence).toHaveText('Persisted');
});

/**
 * The gestures that follow a reconnection, which one-gesture tests cannot see.
 *
 * React Flow drives a reconnect drag through the connection callbacks too, so
 * Edge Authoring stands them down for its duration — and a flag left raised
 * disables the Alt empty-drop and the continue-at-the-target selection for as
 * long as the canvas is mounted. **A plain connection is the wrong probe**:
 * `onConnect` is not among the handlers stood down, so an Edge still authors
 * and the damage hides. The empty-drop is the one that goes dark, because it
 * needs the preview state the stood-down handlers maintain.
 */
test('an Alt empty-drop still works after a reconnection', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  await reconnectOnto(
    page,
    edge,
    'target',
    authoringHandle(nodeByTitle(page, 'D').first(), 'target', 'left'),
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await settled(page);

  // `connectToEmptyWithAlt` gates on the preview appearing, which is exactly the
  // state a raised flag starves — so a leak fails inside the helper rather than
  // as a Card that mysteriously never arrived.
  const source = nodeByTitle(page, 'B').first();
  await source.hover();
  await connectToEmptyWithAlt(page, authoringHandle(source, 'source', 'right'));

  await expect(nodeByTitle(page, 'Card 1')).toBeVisible();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

/**
 * The *source* anchor, which React Flow reports through the **opposite** handle's
 * type — so a mapping read straight off `handleType` names the wrong endpoint.
 *
 * `Short` is A→B→C, so moving A→B's source onto C makes C→B, which is no
 * duplicate of anything Short holds.
 */
test('dragging the source endpoint moves the end the author took hold of', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await page.getByTestId('graph-selector').click();
  await page.getByRole('option', { name: 'Short' }).click();
  await settled(page);

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Short"]');
  await edge.focus();
  await expect(edge).toHaveClass(/selected/);

  // A source-endpoint drag anchors at the Edge's target and looks for a new
  // *source*, so the Card offers its source handles for this gesture alone.
  await reconnectOnto(
    page,
    edge,
    'source',
    authoringHandle(nodeByTitle(page, 'C').first(), 'source', 'right'),
  );

  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from C to B in Short"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * An endpoint dragged back where it came from is offered, not marked invalid.
 *
 * React Flow consults its one global validator during a reconnect too, so a
 * validator that always asks the connect rule reads this as the duplicate Edge
 * it textually is — the anchor shows invalid for the whole drag even though the
 * Edit would accept it as `unchanged`. Asserted live, mid-drag, because that is
 * where the wrong answer is visible; the release then changes nothing.
 */
test('an endpoint dropped back where it came from stays valid throughout', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  const anchor = await boxOf(edge.locator('.react-flow__edgeupdater-target'), 'the target anchor');
  const back = authoringHandle(nodeByTitle(page, 'B').first(), 'target', 'left');

  await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(anchor.x + anchor.width / 2 + 12, anchor.y + anchor.height / 2, {
      steps: 3,
    });
    await expect(back).toHaveCSS('opacity', '1');
    await back.hover();
    // React Flow marks the handle it is over, then whether the drop is allowed.
    // Waiting for the first is what stops the second passing vacuously.
    await expect(back).toHaveClass(/connectingto/);
    await expect(back).toHaveClass(/valid/);
  } finally {
    await page.mouse.up();
  }

  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * The one pointer gesture that deletes an Edge: an endpoint released on empty
 * canvas. A release that merely *missed* a handle cancels instead, which is what
 * the off-canvas case below is for.
 */
test('dragging an endpoint onto empty canvas deletes the Edge', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  await dragEndpointTo(page, edge, 'target', await emptyCanvasPoint(page));

  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn - 1);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

test('dragging an endpoint off the canvas restores the Edge', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  const edge = page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]');
  await edge.focus();
  // The persistence status sits in the toolbar, outside the flow container.
  const toolbar = await boxOf(page.getByTestId('persistence-status'), 'the persistence status');
  await dragEndpointTo(page, edge, 'target', {
    x: toolbar.x + toolbar.width / 2,
    y: toolbar.y + toolbar.height / 2,
  });

  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(
    page.locator('.react-flow__edge[aria-label="Edge from A to B in Long"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * The third `DropTarget` classification, and the reason the DOM half of the
 * empty-drop rule exists: a release over a Card's *body* is far enough from any
 * handle that React Flow resolves no target, so without the hit-test an Alt-drop
 * there would author a Card on top of the one underneath.
 */
test('an Alt-drop released over a Card body creates no Card', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  await source.hover();

  const from = await boxOf(authoringHandle(source, 'source', 'right'), 'the source handle');
  const over = await boxOf(nodeByTitle(page, 'C').first(), 'Card C');
  try {
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });
    await page.keyboard.down('Alt');
    // The centre of a 260x146 Card is some 73px from its nearest handle, well
    // outside React Flow's connection radius of 20 — so `toNode` is null here
    // and only the DOM says this is a Card.
    await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 4 });
    await expect(page.getByTestId('new-card-preview')).toHaveCount(0);
  } finally {
    await page.mouse.up();
    await page.keyboard.up('Alt');
  }

  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(FIXTURE_CARD_COUNT);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

/**
 * The keyboard's way into an Edge: a real control on the Card, then a picker.
 *
 * The four spatial handles are drag affordances and reach no keyboard author, so
 * a Card that can be connected from carries one tab stop that opens a target
 * list over this Layout's Cards.
 */
test('a Card offers a keyboard Connect control that authors an Edge', async ({ page }) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await selectLayout(page, 'Collection 1');
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  await source.hover();
  await source.getByRole('button', { name: 'Connect from A' }).click();
  await expect(page.getByTestId('connect-target-picker')).toBeVisible();
  await page.getByRole('combobox', { name: 'Connect to' }).click();
  await page.locator('[role="option"][data-disabled="false"]').last().click();

  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn + 1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect(page.getByTestId('connect-target-picker')).toHaveCount(0);
});

/**
 * The same two-stage Escape rule the Alias pane keeps, on the connect picker:
 * the first press belongs to the open list, and only the second cancels the
 * connection. An author who opens the list to look must be able to back out of
 * it without losing the gesture.
 *
 * **Only a browser answers this one.** Two of the facts it turns on are the
 * host's rather than the app's. The press goes wherever focus really is, not to
 * an element a test names — so the second stage exists only if closing the list
 * really does hand focus back inside the picker. And Radix closes from a
 * document capture listener whose React flush lands in the microtask checkpoint
 * *between* listeners, which unmounts the list before React's own delegated
 * listener can dispatch the press anywhere; jsdom performs no such checkpoint,
 * dispatching a whole event in one JS frame, so it reaches the two stages by a
 * different route. `edge-authoring-react.test.tsx` pins the handler's rule; this
 * pins what the author gets.
 */
test('Escape closes the connect picker’s list before it cancels the connection', async ({
  page,
}) => {
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);
  const drawn = await page.locator('.react-flow__edge').count();

  await source.hover();
  await source.getByRole('button', { name: 'Connect from A' }).click();
  const picker = page.getByTestId('connect-target-picker');
  await expect(picker).toBeVisible();
  const trigger = page.getByRole('combobox', { name: 'Connect to' });
  await trigger.click();
  await expect(page.getByRole('combobox', { name: 'Search' })).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(page.getByRole('combobox', { name: 'Search' })).toHaveCount(0);
  await expect(picker).toBeVisible();
  // **The handoff, asserted rather than assumed.** Radix restores focus from a
  // `setTimeout(0)` in the focus scope's unmount, so for a moment after the list
  // goes there is nothing focused inside the picker and a press would reach no
  // handler at all. A human never presses that fast; a test does.
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(picker).toHaveCount(0);
  // Cancelling authors nothing — no Edge, and no conversion of the View the
  // fixture opens in, which is what a commit here would have to have made first.
  await quiescent(page);
  await expect(page.locator('.react-flow__edge')).toHaveCount(drawn);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
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
 * An opened Card is an editor, and an editor needs somewhere to write. Changing
 * the renderer underneath one left it on screen over a graph that was still
 * arranging, and an Edit completed in that window is refused for having no
 * placement to write into — with the pane closing on `Done` exactly as it does
 * on success. The author saw a save and got nothing.
 *
 * The pane closing with the renderer is what removes the window. The fixture
 * names no `defaultView`, so it opens on `Flow` — selecting that again is not a
 * change and the selector reports nothing. `Grid` is the other Algorithmic View,
 * and it installs no placement until its strategy resolves, which is the state
 * this is about.
 */
test('changing the renderer closes an opened Card rather than stranding its editor', async ({
  page,
}) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await settled(page);
  await openCard(card, 'A');

  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await expect(source).toBeVisible();
  await source.fill('Typed into a pane about to lose its placement');

  await page.getByTestId('view-selector').click();
  await page.getByRole('option', { name: 'Grid' }).click();

  await expect(page.getByTestId('open-card')).toHaveCount(0);
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
 * The same containment, and the pointer gesture that traversed straight out of it.
 *
 * `containTab` is bound to the panel, so it only ever sees a `Tab` pressed while
 * focus is already inside. A mousedown on anything unfocusable moves focus to
 * `<body>`, and from there the handler never fires at all: `Tab` traverses the
 * document from the top, into the toolbar and on to the Card nodes the pane
 * covers. Two surfaces are unfocusable and always clickable — the backdrop,
 * which is visible at every viewport because the panel letterboxes inside it,
 * and the panel's own padding and gaps. Both were confirmed to escape before
 * this was fixed; neither is reachable from the test above, which only ever
 * presses `Tab` from a field it focused first.
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
  expect(await withinPane(), 'focus left the pane when the backdrop was clicked').toBe(true);
  await page.keyboard.press('Tab');
  expect(await withinPane(), 'focus left the pane on the Tab after a backdrop click').toBe(true);

  // And the panel's own corner, which is its 1rem padding ring — inside the
  // pane, and no more focusable than the backdrop.
  await page.locator('.card-pane__panel').click({ position: { x: 4, y: 4 } });
  expect(await withinPane(), 'focus left the pane when its padding was clicked').toBe(true);
  await page.keyboard.press('Tab');
  expect(await withinPane(), 'focus left the pane on the Tab after a padding click').toBe(true);

  // A click on a control still focuses it, which is what the prevention must not
  // cost: it is prevented only where the default would take focus out of here.
  await page.getByRole('textbox', { name: 'Markdown source' }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toBeFocused();
  // Including through a label's text, which focuses its field by click rather
  // than by mousedown.
  await page.getByText('Description', { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toBeFocused();
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

  // The field draft takes the first Escape, the surface the second.
  await search.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.getByTestId('new-alias')).toBeVisible();
  await search.press('Escape');

  await expect(page.getByTestId('new-alias')).toHaveCount(0);
  await quiescent(page);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);
  await expect(page.getByTestId('layout-selector')).toContainText('None');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await expect(page.getByTestId('add-card-menu')).toBeFocused();
});

/**
 * The pane's controls stay reachable when the pane cannot fit its content.
 *
 * `.card-pane__panel` is a fixed 16/9 frame that clips, and its width is clamped
 * by viewport height — so on a short or narrow window the panel is smaller than
 * what is in it. The opened-Card editor survives that because its Markdown field
 * absorbs the squeeze, but the Alias creation pane has no such field: heading,
 * Title, list, hint and actions are all fixed. With the frame clipping and
 * nothing inside it scrolling, Cancel and the refusal line simply fall off the
 * bottom, and a wheel over the panel does nothing because `overflow: hidden`
 * takes no wheel.
 *
 * 500px is below the ~620px where clipping begins, measured against this pane.
 */
test('keeps the Alias pane’s controls reachable on a short viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  const panel = page.locator('.card-pane__panel');
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  if (box === null) throw new Error('the pane has no box');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);

  await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();
});

/**
 * The same two-stage rule, on the field beside that picker.
 *
 * The Title holds a draft exactly as the search does and the contract exempts
 * neither, so a typed title has to survive the press that would otherwise take
 * the pane down with it. What it restores to is the empty string — there is no
 * Alias yet to have read a title off — which makes restoring and clearing one
 * act here, and the surface goes only on the press after.
 */
test('the Alias title draft takes its own first Escape', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Alias' }).click();
  const title = page.getByTestId('new-alias-title');
  await title.fill('Recap');

  await title.press('Escape');
  await expect(title).toHaveValue('');
  await expect(page.getByTestId('new-alias')).toBeVisible();

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

  // The pane it is now on is the delegated editor over the Card that owns the
  // content, which is what opening an Alias has always given (ADR 0039).
  await expect(page.getByTestId('new-alias')).toHaveCount(0);
  await expect(page.getByText('Opened through B')).toBeVisible();
  await expect(page.getByText('Editing content on B')).toBeVisible();
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
  await title.press('Enter');

  await expect(nodeByTitle(page, 'Recap')).toHaveCount(1);
  // The Target keeps its own: one Card called B, the one that was always there.
  await expect(nodeByTitle(page, 'B')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  // Closing the pane completes nothing further, and the rename outlives it.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('open-card')).toHaveCount(0);
  await quiescent(page);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

/**
 * And the rename is a draft, so Escape restores it rather than closing the pane
 * out from under it: "Dirty field restores value before surface closes".
 *
 * The Alias itself is not a draft and does not come back with it — it was
 * created the moment the Target was chosen, one revision earlier — so this is
 * also the test that the two are told apart.
 */
test('an Alias rename draft takes its own first Escape', async ({ page }) => {
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
  await expect(title).toHaveValue('B');
  await expect(page.getByTestId('open-card')).toBeVisible();

  await title.press('Escape');

  await expect(page.getByTestId('open-card')).toHaveCount(0);
  await quiescent(page);
  await expect(nodeByTitle(page, 'Recap')).toHaveCount(0);
  await expect(nodeByTitle(page, 'B')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});
