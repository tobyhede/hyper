import { expect, test, type Locator, type Page } from './fixtures';

/**
 * Dragging a card writes its placement into the Layout.
 *
 * The fixture declares no Layout, so it gets one from its first resolved layout
 * (ADR 0017) and is editable on open. What this asserts is the point of the
 * whole pivot: a card goes where you put it and *nothing else moves*. Three
 * spike increments failed exactly here — a global optimiser reshuffled the rest
 * of the graph on every edit, so a drop landed somewhere arbitrary.
 */

function nodeByTitle(page: Page, title: string): Locator {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

/** Where React Flow has actually put a node, in flow coordinates. */
async function positionOf(node: Locator): Promise<{ x: number; y: number }> {
  return node.evaluate((el) => {
    const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
      (el as HTMLElement).style.transform,
    );
    return { x: Number(match?.[1] ?? NaN), y: Number(match?.[2] ?? NaN) };
  });
}

/** All node positions, keyed by the node's React Flow id. */
async function allPositions(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.locator('.react-flow__node').evaluateAll((els) =>
    Object.fromEntries(
      els.map((el) => {
        const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(
          (el as HTMLElement).style.transform,
        );
        return [
          el.getAttribute('data-id') ?? '',
          { x: Number(match?.[1] ?? NaN), y: Number(match?.[2] ?? NaN) },
        ];
      }),
    ),
  );
}

const viewportTransform = (page: Page) =>
  page.evaluate(
    () => document.querySelector<HTMLElement>('.react-flow__viewport')?.style.transform ?? '',
  );

/**
 * Wait until the viewport stops moving.
 *
 * Once the layout resolves, `ViewController` runs an animated `fitView`. A
 * bounding box read during it is stale by the time the mouse gets there, so
 * mousedown lands beside the card and no drag starts — a failure that looks
 * exactly like dragging being broken.
 */
async function settled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      // The two reads must straddle a real gap. Comparing values sampled in the
      // same tick reports "stable" on the first try, every time, mid-animation.
      const before = await viewportTransform(page);
      await page.waitForTimeout(120);
      return before !== '' && (await viewportTransform(page)) === before;
    })
    .toBe(true);
}

/** Drag by a flow-space delta, scaled through the current zoom. */
async function dragBy(page: Page, node: Locator, dx: number, dy: number): Promise<void> {
  await settled(page);
  const box = (await node.boundingBox())!;
  const zoom = Number(/scale\(([\d.]+)\)/.exec(await viewportTransform(page))?.[1] ?? 1);

  // Grab the card's header rather than its centre: the body scrolls its markdown
  // and the ports sit at the edges.
  await page.mouse.move(box.x + box.width / 2, box.y + 12);
  await page.mouse.down();
  // React Flow starts a drag on the first move after mousedown; a single jump
  // can be swallowed, so move twice.
  await page.mouse.move(box.x + box.width / 2 + (dx * zoom) / 2, box.y + 12 + (dy * zoom) / 2, {
    steps: 5,
  });
  await page.mouse.move(box.x + box.width / 2 + dx * zoom, box.y + 12 + dy * zoom, { steps: 5 });
  await page.mouse.up();
}

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
