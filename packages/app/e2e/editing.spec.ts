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

/**
 * Saving is asked for, never a consequence of an edit (ADR 0029).
 *
 * This server is read-only, so the endpoint answers without writing: what these
 * assert is the control and the request, not the file. That a save survives a
 * reload — and that an unsaved one does not — is proven in `new-space.spec`,
 * against the one server in the suite that genuinely writes.
 */

test('a drag leaves the space unsaved, and saving clears it', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  // Opening a space is not editing it, so there is nothing to write. The
  // disabled control is the save-state indicator ADR 0025 asks for.
  const save = page.getByTestId('save-button');
  await expect(save).toBeDisabled();

  await dragBy(page, a, 0, 260);
  await expect(save).toBeEnabled();

  const responded = page.waitForResponse((response) => response.url().endsWith('/__space'));
  await save.click();
  await responded;
  await expect(save).toBeDisabled();
});

test('leaving with unsaved work asks first, and leaving with none does not', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  // Accepting a `beforeunload` dialog is "leave the page", so the reloads below
  // still happen. Without a listener Playwright dismisses dialogs, which for
  // this one means *stay* — the reload would be cancelled and the test would
  // fail somewhere far from the cause.
  const asked: string[] = [];
  page.on('dialog', (dialog) => {
    asked.push(dialog.type());
    void dialog.accept();
  });

  // Nothing has been edited, so there is nothing to lose and nothing to ask.
  // The handler is not merely inert here — it is not registered at all.
  await page.reload();
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  expect(asked).toEqual([]);

  await settled(page);
  await dragBy(page, nodeByTitle(page, 'A').first(), 0, 240);
  await expect(page.getByTestId('save-button')).toBeEnabled();

  await page.reload();
  expect(asked).toEqual(['beforeunload']);
});

test('Cmd-S saves, and is the same act as the button', async ({ page }) => {
  await page.goto('/');
  const a = nodeByTitle(page, 'A').first();
  await expect(a).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  await dragBy(page, a, 0, 260);
  const save = page.getByTestId('save-button');
  await expect(save).toBeEnabled();

  const responded = page.waitForResponse((response) => response.url().endsWith('/__space'));
  await page.keyboard.press('ControlOrMeta+s');
  await responded;
  await expect(save).toBeDisabled();
});

test('a newer save waits for an older save to finish', async ({ page }) => {
  let finishFirst: () => void = () => undefined;
  const firstMayFinish = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  let announceFirst: () => void = () => undefined;
  const firstStarted = new Promise<void>((resolve) => {
    announceFirst = resolve;
  });
  const requests: string[] = [];

  await page.route('**/__space', async (route) => {
    requests.push(route.request().postData() ?? '');
    if (requests.length === 1) {
      announceFirst();
      await firstMayFinish;
    }
    await route.fulfill({ status: 204 });
  });

  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute('d', /L/);
  await settled(page);

  const save = page.getByTestId('save-button');
  await dragBy(page, nodeByTitle(page, 'A').first(), 0, 260);
  await save.click();
  await firstStarted;

  await dragBy(page, nodeByTitle(page, 'B').first(), 0, 260);
  await save.click();

  await page.waitForTimeout(200);
  expect(requests).toHaveLength(1);

  finishFirst();
  await expect.poll(() => requests.length).toBe(2);
  await expect(save).toBeDisabled();
});
