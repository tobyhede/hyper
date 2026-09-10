import { expect, test, type Page } from './fixtures';
import {
  activeThing,
  activeGraph,
  authoringHandle,
  connectHandles,
  connectToEmptyWithAlt,
  createThingControl,
  dragBy,
  nodeByTitle,
  positionOf,
  presentControl,
  selectedCanvas,
  settled,
} from './graph';
import { seedPositionedDiagram, type HttpLoadedSpace } from './seed';

/**
 * Opening the app with nothing to open gives a new space: one thing (ADR 0018).
 *
 * This project drives its own empty HTTP repository. Server-side database
 * startup creates the one-thing Space once, and reloads reopen that durable UUID.
 */

const seedNewSpaceDiagram = (page: Page) =>
  seedPositionedDiagram(page, 'Authored Diagram', (snapshot) => {
    const thingId = snapshot.things[0]?.id;
    if (thingId === undefined) throw new Error('The new Space must hold Thing 1.');
    return { [thingId]: { x: 0, y: 0, open: false } };
  });

/** A new Space already owns its complete first Diagram and centered Thing. */
const createDiagram = async (page: Page): Promise<void> => {
  await expect(selectedCanvas(page)).toContainText('Diagram 1');
  await expect(page.getByRole('dialog', { name: 'Things' })).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  await settled(page);
};

/**
 * The overview arrives already framed, rather than flying in from the origin.
 *
 * Asserted on the transform rather than on a screenshot, because the bug is a
 * *second* fit running after the first: React Flow's `fitView` prop fits before
 * first paint, and an effect that also fits on mount animates away from the
 * result the author is already looking at. Counting distinct transforms is what
 * distinguishes "fitted once" from "fitted, then moved" — a final-state check
 * passes either way, since both end up correctly framed.
 */
test('centres its first thing without animating it in from the canvas origin', async ({ page }) => {
  await page.addInitScript(() => {
    const transforms: string[] = [];
    Object.defineProperty(window, '__hyperOverviewTransforms', { value: transforms });

    const observeViewport = () => {
      const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
      if (viewport === null) {
        requestAnimationFrame(observeViewport);
        return;
      }

      const record = () => {
        const transform = viewport.style.transform;
        if (transform !== '' && transforms.at(-1) !== transform) transforms.push(transform);
      };
      new MutationObserver(record).observe(viewport, {
        attributes: true,
        attributeFilter: ['style'],
      });
      record();
    };

    requestAnimationFrame(observeViewport);
  });

  await page.goto('/');
  await expect(nodeByTitle(page, 'Thing 1')).toBeVisible();
  await settled(page);

  // SAFETY: `__hyperOverviewTransforms` is a debug array this same spec sets
  // on `window` above (`Object.defineProperty`) — not part of the DOM lib's
  // `Window` type, but a value only this test's own instrumentation writes.
  const transforms = await page.evaluate(
    () =>
      (window as Window & { __hyperOverviewTransforms?: string[] }).__hyperOverviewTransforms ?? [],
  );

  // React Flow's prop-driven initial fit may replace its identity transform once.
  // Intermediate transforms mean a second, animated fit ran after first paint.
  expect(transforms.length).toBeLessThanOrEqual(2);
});

test('shows one thing, and it is the only thing on screen', async ({ page }) => {
  await page.goto('/');

  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  // No graphs means no edges to draw.
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('starts in a complete authored Diagram with its first empty Active Graph', async ({
  page,
}) => {
  await page.goto('/');
  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await settled(page);
  await thing.hover();

  const handles = thing.locator('.rf-thing-node__authoring-handle--source');
  await expect(handles).toHaveCount(4);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(activeGraph(page)).toHaveText('Graph 1');
  await expect(selectedCanvas(page)).toContainText('Diagram 1');
  await expect(createThingControl(page)).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

test('Alt toggles a transient Thing 2 preview during an empty connection drag', async ({
  page,
}) => {
  await page.goto('/');
  await createDiagram(page);
  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await settled(page);
  await thing.hover();

  const source = authoringHandle(thing, 'source', 'right');
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 180, from.y + from.height / 2 + 160, {
    steps: 4,
  });

  await expect(page.getByTestId('new-thing-preview')).toHaveCount(0);
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('new-thing-preview')).toContainText('Thing 2');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('new-thing-preview')).toHaveCount(0);
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('new-thing-preview')).toContainText('Thing 2');
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('new-thing-preview')).toHaveCount(0);
  await page.mouse.up();

  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

test('Alt empty-drop creates, connects and selects Thing 2 at the previewed position', async ({
  page,
}) => {
  await page.goto('/');
  await createDiagram(page);
  const sourceThing = nodeByTitle(page, 'Thing 1');
  await expect(sourceThing).toBeVisible();
  await settled(page);
  await sourceThing.hover();

  const source = authoringHandle(sourceThing, 'source', 'right');
  const from = (await source.boundingBox())!;
  // Up and to the right, not down: the canvas HUD is anchored bottom-right and
  // is some 218px tall once its Graph key and minimap are both drawn, so a Thing
  // dropped below the source's line lands under it — and the hover further down
  // this test, which reveals the created Thing's own controls, then never reaches
  // it. The direction is incidental to what this proves; the collision is not.
  const dropPoint = {
    x: Math.floor(from.x + from.width / 2 + 220),
    y: Math.floor(from.y + from.height / 2 - 180),
  };
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 4 });
  await page.keyboard.down('Alt');
  const preview = page.getByTestId('new-thing-preview');
  await expect(preview).toContainText('Thing 2');
  const previewBox = (await preview.boundingBox())!;
  expect(previewBox.x + previewBox.width / 2).toBeCloseTo(dropPoint.x, 0);
  expect(previewBox.y + previewBox.height / 2).toBeCloseTo(dropPoint.y, 0);
  await page.mouse.up();
  await page.keyboard.up('Alt');

  const created = nodeByTitle(page, 'Thing 2');
  await expect(created).toBeVisible();
  const createdBox = (await created.boundingBox())!;
  expect(createdBox.x + createdBox.width / 2).toBeCloseTo(dropPoint.x, 0);
  expect(createdBox.y + createdBox.height / 2).toBeCloseTo(dropPoint.y, 0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(activeGraph(page)).toHaveText('Graph 1');
  await expect(selectedCanvas(page)).toContainText('Diagram 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect(authoringHandle(created, 'source', 'left')).toHaveCSS('opacity', '1');
  await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);

  await settled(page);
  await created.hover();
  const continuedSource = authoringHandle(created, 'source', 'left');
  await connectHandles(page, continuedSource, authoringHandle(sourceThing, 'target', 'right'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

/**
 * A selected Diagram always has a Graph to author into.
 *
 * Creating a Diagram creates its initial Active Graph in the same Edit (ADR
 * 0040), so the seeded Diagram owns one from the start — empty, exactly as a
 * conversion leaves it. What the drop does is put the Diagram's *first Edge* in
 * the Graph it already owns, rather than minting a second one beside it.
 */
test('Alt empty-drop authors the first Edge into the Graph a selected Diagram owns', async ({
  page,
}) => {
  const seeded = await seedNewSpaceDiagram(page);
  const persistedRevision = String(BigInt(seeded.revision) + 1n);
  await page.goto('/');

  const sourceThing = nodeByTitle(page, 'Thing 1');
  await expect(sourceThing).toBeVisible();
  await expect(selectedCanvas(page)).toContainText('Authored Diagram');
  await expect(activeGraph(page)).toHaveText('Graph 1');
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await settled(page);
  await sourceThing.hover();

  await connectToEmptyWithAlt(page, authoringHandle(sourceThing, 'source', 'right'));

  await expect(nodeByTitle(page, 'Thing 2')).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(activeGraph(page)).toHaveText('Graph 1');
  await expect(page.getByTestId('graph-legend')).toContainText('Graph 1');
  await expect(selectedCanvas(page)).toContainText('Authored Diagram');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    persistedRevision,
  );
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await page.reload();
  await expect(nodeByTitle(page, 'Thing 1')).toBeVisible();
  await expect(nodeByTitle(page, 'Thing 2')).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(activeGraph(page)).toHaveText('Graph 1');
  await expect(selectedCanvas(page)).toContainText('Authored Diagram');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    persistedRevision,
  );
});

test('an Alt-drop released off the canvas creates no Thing', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page);
  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await settled(page);
  await thing.hover();

  const source = authoringHandle(thing, 'source', 'right');
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 220, from.y + from.height / 2 - 180, {
    steps: 4,
  });
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('new-thing-preview')).toContainText('Thing 2');

  // Leaving the canvas fires no move the graph can see, so the preview's last
  // eligible point survives the departure. Where the release *landed* is the
  // only thing that may author a Thing.
  // Chrome over the canvas rather than beside it: the header this used went with
  // the Sidebar (ADR 0082), and the Command Dock is the surface a release lands
  // on without the flow ever seeing it.
  const offCanvas = (await page.getByTestId('command-dock').boundingBox())!;
  await page.mouse.move(offCanvas.x + offCanvas.width / 2, offCanvas.y + offCanvas.height / 2);
  // The frozen half, asserted rather than assumed: the preview is *still* on
  // screen over a point that would author nothing. Without this the test would
  // pass just as well if the preview correctly vanished, and the disagreement
  // the two suppliers are priced against would go unmeasured.
  await expect(page.getByTestId('new-thing-preview')).toContainText('Thing 2');
  await page.mouse.up();
  await page.keyboard.up('Alt');

  await expect(nodeByTitle(page, 'Thing 2')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

test('the first self-connection authors into the Graph the explicit Diagram owns', async ({
  page,
}) => {
  await page.goto('/');
  await createDiagram(page);
  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await settled(page);
  const before = await positionOf(thing);
  await thing.hover();

  await connectHandles(
    page,
    authoringHandle(thing, 'source', 'right'),
    authoringHandle(thing, 'target', 'left'),
  );

  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(activeGraph(page)).toHaveText('Graph 1');
  await expect(page.getByTestId('graph-legend')).toContainText('Graph 1');
  await expect(selectedCanvas(page)).toContainText('Diagram 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  // Authoring the Edge must not move the Thing already placed in the Diagram.
  await settled(page);
  expect(await positionOf(thing)).toEqual(before);
});

test('the Graph the explicit Diagram owns can be self-connected and presented', async ({
  page,
}) => {
  await page.goto('/');
  await createDiagram(page);
  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await settled(page);
  const thingId = await thing.getAttribute('data-id');
  expect(thingId).not.toBeNull();
  await thing.hover();

  await connectHandles(
    page,
    authoringHandle(thing, 'source', 'right'),
    authoringHandle(thing, 'target', 'left'),
  );
  await expect(activeGraph(page)).toHaveText('Graph 1');

  // Every Thing a fully cyclic Graph holds is arrived at, so it has no entry
  // Thing. The control is enabled because a Graph *is* active, and presenting
  // used to return before changing anything — the click went nowhere.
  await presentControl(page).click();

  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeThing(page)).toHaveAttribute('data-id', thingId!);
  const moves = page.getByTestId('presenting-moves').getByRole('button');
  await expect(moves).toHaveCount(1);
  await expect(moves).toHaveText('Thing 1');
});

test(
  'shows the empty initial Graph and its graph HUD',
  { tag: '@parity:command-dock-names-a-new-spaces-initial-diagram-and-graph' },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'Thing 1')).toBeVisible();

    await expect(activeGraph(page)).toHaveText('Graph 1');
    await expect(selectedCanvas(page)).toContainText('Diagram 1');
    // `aria-disabled` rather than the attribute — a toolbar item stays focusable
    // while it is unavailable (ADR 0073).
    await expect(presentControl(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('graph-legend')).toContainText('Graph 1');
  },
);

test('its one centered authored Thing is draggable', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page);

  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await settled(page);

  const before = await positionOf(thing);
  await dragBy(page, thing, 0, 200);
  const after = await positionOf(thing);

  expect(after.y).toBeGreaterThan(before.y + 80);
});

test('renders at natural size rather than filling the screen', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'Thing 1')).toBeVisible();
  await settled(page);

  // The overview fit caps at `maxZoom: 1`. Without the cap React Flow's default
  // max of 2 applies, and a lone thing is scaled to 2x — padding reserves margin,
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
  await createDiagram(page);

  const thing = nodeByTitle(page, 'Thing 1');
  await expect(thing).toBeVisible();
  await settled(page);
  const before = await positionOf(thing);
  await dragBy(page, thing, 0, 220);
  expect((await positionOf(thing)).y).toBeGreaterThan(before.y + 80);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('a completed edit and space identity survive reload', async ({ page }) => {
  await page.goto('/');
  await createDiagram(page);
  const first = nodeByTitle(page, 'Thing 1');
  await expect(first).toBeVisible();
  const firstId = await first.getAttribute('data-id');
  // Without this, two missing attributes compare equal after the reload and the
  // identity assertion below passes while proving nothing.
  expect(firstId).not.toBeNull();
  await settled(page);
  await dragBy(page, first, 0, 220);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  const durablePosition = await positionOf(first);

  await page.reload();

  const second = nodeByTitle(page, 'Thing 1');
  await expect(second).toBeVisible();
  await settled(page);
  expect(await second.getAttribute('data-id')).toBe(firstId);
  expect(await positionOf(second)).toEqual(durablePosition);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});

/**
 * Open Spaces validates the backend's response before opening it
 * (`open-spaces.ts`) — a real backend can return a snapshot referencing a
 * thing it does not hold (a partial write, a migration gap), and this proves
 * that reaches `StartupFailure` rather than an unhandled rejection. The
 * response is wire-valid (it parses as a `SpaceSnapshot`) and only fails
 * domain intake, so this is the real client boundary rather than a decode
 * error.
 */
test(
  'a backend snapshot naming a thing its own Graph does not hold fails startup with the real diagnostic',
  { tag: '@parity:operational-feedback-startup-failure' },
  async ({ page }) => {
    const summariesResponse = await page.request.get('/api/spaces');
    expect(summariesResponse.ok()).toBe(true);
    // SAFETY: this E2E test trusts the running app's own `/api/spaces`
    // response shape rather than importing its Zod schema here — the read is
    // narrow (just `id`), and a real shape mismatch fails the assertion below.
    const summaries = (await summariesResponse.json()) as readonly { readonly id: string }[];
    const spaceId = summaries[0]?.id;
    if (spaceId === undefined) throw new Error('The new Space must already exist.');

    const loadedResponse = await page.request.get(`/api/spaces/${spaceId}`);
    expect(loadedResponse.ok()).toBe(true);
    // SAFETY: `HttpLoadedSpace` is this app's own wire type for a GET
    // `/api/spaces/:id` response — the server producing it is this same
    // codebase, not third-party JSON.
    const loaded = (await loadedResponse.json()) as HttpLoadedSpace;
    const thingId = loaded.snapshot.things[0]?.id;
    if (thingId === undefined) throw new Error('The new Space must hold Thing 1.');

    const diagramId = '00000000-0000-4000-8000-0000000000fe';
    const graphId = '00000000-0000-4000-8000-0000000000fd';
    const missingThingId = '00000000-0000-4000-8000-0000000000ff';
    await page.route('**/api/spaces/*', async (route) => {
      const request = route.request();
      const isLoadOne =
        request.method() === 'GET' &&
        /\/api\/spaces\/[0-9a-f-]+$/.test(new URL(request.url()).pathname);
      if (!isLoadOne) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...loaded,
          snapshot: {
            ...loaded.snapshot,
            document: {
              ...loaded.snapshot.document,
              diagrams: [
                {
                  id: diagramId,
                  title: 'Diagram',
                  kind: 'positioned',
                  positions: { [thingId]: { x: 0, y: 0, open: false } },
                  graphs: [
                    { id: graphId, title: 'Graph', edges: [{ from: thingId, to: missingThingId }] },
                  ],
                },
              ],
              defaultDiagram: diagramId,
            },
          },
        }),
      });
    });

    await page.goto('/');
    const alert = page.getByRole('alert');
    await expect(alert.getByText('Application could not start')).toBeVisible();
    await expect(alert).toContainText(missingThingId);
  },
);
