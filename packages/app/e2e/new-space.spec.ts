import { expect, test, type Page } from './fixtures';
import {
  activeCard,
  AUTHORING_HANDLE_SIDES,
  authoringHandle,
  connectHandles,
  connectToEmptyWithAlt,
  dragBy,
  nodeByTitle,
  positionOf,
  settled,
} from './graph';
import { seedRouteLessLayout } from './seed';

/**
 * Opening the app with nothing to open gives a new space: one card (ADR 0018).
 *
 * This project drives its own empty HTTP repository. Server-side database
 * startup creates the one-card Space once, and reloads reopen that durable UUID.
 */

const seedRouteLessFilteredLayout = (page: Page) =>
  seedRouteLessLayout(page, 'Empty Route Filter', (snapshot) => {
    const cardId = snapshot.cards[0]?.id;
    if (cardId === undefined) throw new Error('The new Space must hold Card 1.');
    return { [cardId]: { x: 0, y: 0 } };
  });

test('shows one card, and it is the only thing on screen', async ({ page }) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  // No routes means no edges to draw.
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('route-less handles preview Route 1 and an empty drop cancels', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await settled(page);
  await card.hover();

  const handles = card.locator('.rf-card-node__authoring-handle--source');
  await expect(handles).toHaveCount(AUTHORING_HANDLE_SIDES);
  await expect(handles.first()).toHaveCSS('background-color', 'rgb(110, 168, 254)');

  const source = authoringHandle(card, 'source', 'right');
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 40, from.y + from.height / 2, { steps: 4 });
  const preview = page.locator('.react-flow__connection-path');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS('stroke', 'rgb(110, 168, 254)');
  await page.mouse.move(from.x + from.width / 2 + 180, from.y + from.height / 2 + 180);
  await page.mouse.up();

  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(page.getByTestId('route-selector')).toContainText('None');
  await expect(page.getByTestId('layout-selector')).toContainText('None');
  await expect(page.getByTestId('view-selector')).toContainText('Graph');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

test('Alt toggles a transient Card 2 preview during an empty connection drag', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await settled(page);
  await card.hover();

  const source = authoringHandle(card, 'source', 'right');
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 180, from.y + from.height / 2 + 160, {
    steps: 4,
  });

  await expect(page.getByTestId('new-card-preview')).toHaveCount(0);
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('new-card-preview')).toContainText('Card 2');
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('new-card-preview')).toHaveCount(0);
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('new-card-preview')).toContainText('Card 2');
  await page.keyboard.up('Alt');
  await expect(page.getByTestId('new-card-preview')).toHaveCount(0);
  await page.mouse.up();

  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

test('Alt empty-drop creates, connects and selects Card 2 at the previewed position', async ({
  page,
}) => {
  await page.goto('/');
  const sourceCard = nodeByTitle(page, 'Card 1');
  await expect(sourceCard).toBeVisible();
  await settled(page);
  await sourceCard.hover();

  const source = authoringHandle(sourceCard, 'source', 'right');
  const from = (await source.boundingBox())!;
  const dropPoint = {
    x: Math.floor(from.x + from.width / 2 + 220),
    y: Math.floor(from.y + from.height / 2 + 180),
  };
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 4 });
  await page.keyboard.down('Alt');
  const preview = page.getByTestId('new-card-preview');
  await expect(preview).toContainText('Card 2');
  const previewBox = (await preview.boundingBox())!;
  expect(previewBox.x + previewBox.width / 2).toBeCloseTo(dropPoint.x, 0);
  expect(previewBox.y + previewBox.height / 2).toBeCloseTo(dropPoint.y, 0);
  await page.mouse.up();
  await page.keyboard.up('Alt');

  const created = nodeByTitle(page, 'Card 2');
  await expect(created).toBeVisible();
  const createdBox = (await created.boundingBox())!;
  expect(createdBox.x + createdBox.width / 2).toBeCloseTo(dropPoint.x, 0);
  expect(createdBox.y + createdBox.height / 2).toBeCloseTo(dropPoint.y, 0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('route-selector')).toContainText('Route 1');
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  await expect(authoringHandle(created, 'source', 'left')).toHaveCSS('opacity', '1');
  await expect(page.getByTestId('open-card')).toHaveCount(0);

  await settled(page);
  await created.hover();
  const continuedSource = authoringHandle(created, 'source', 'left');
  await connectHandles(page, continuedSource, authoringHandle(sourceCard, 'target', 'right'));
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

test('Alt empty-drop mints the first visible Route in a filtered positioned Layout', async ({
  page,
}) => {
  const seeded = await seedRouteLessFilteredLayout(page);
  const persistedRevision = String(BigInt(seeded.revision) + 1n);
  await page.goto('/');

  const sourceCard = nodeByTitle(page, 'Card 1');
  await expect(sourceCard).toBeVisible();
  await expect(page.getByTestId('layout-selector')).toContainText('Empty Route Filter');
  await expect(page.getByTestId('route-selector')).toContainText('None');
  await settled(page);
  await sourceCard.hover();

  await connectToEmptyWithAlt(page, authoringHandle(sourceCard, 'source', 'right'));

  await expect(nodeByTitle(page, 'Card 2')).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('route-selector')).toContainText('Route 1');
  await expect(page.getByTestId('route-legend')).toContainText('Route 1');
  await expect(page.getByTestId('layout-selector')).toContainText('Empty Route Filter');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    persistedRevision,
  );
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');

  await page.reload();
  await expect(nodeByTitle(page, 'Card 1')).toBeVisible();
  await expect(nodeByTitle(page, 'Card 2')).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('route-selector')).toContainText('Route 1');
  await expect(page.getByTestId('layout-selector')).toContainText('Empty Route Filter');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    persistedRevision,
  );
});

test('an Alt-drop released off the canvas creates no Card', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await settled(page);
  await card.hover();

  const source = authoringHandle(card, 'source', 'right');
  const from = (await source.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 220, from.y + from.height / 2 + 180, {
    steps: 4,
  });
  await page.keyboard.down('Alt');
  await expect(page.getByTestId('new-card-preview')).toContainText('Card 2');

  // Leaving the canvas fires no move the graph can see, so the preview's last
  // eligible point survives the departure. Where the release *landed* is the
  // only thing that may author a Card.
  const offCanvas = (await page.getByTestId('persistence-status').boundingBox())!;
  await page.mouse.move(offCanvas.x + offCanvas.width / 2, offCanvas.y + offCanvas.height / 2);
  await page.mouse.up();
  await page.keyboard.up('Alt');

  await expect(nodeByTitle(page, 'Card 2')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
});

test('the first self-connection mints and activates Route 1 in one persisted Layout', async ({
  page,
}) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await settled(page);
  const before = await positionOf(card);
  await card.hover();

  await connectHandles(
    page,
    authoringHandle(card, 'source', 'right'),
    authoringHandle(card, 'target', 'left'),
  );

  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('route-selector')).toContainText('Route 1');
  await expect(page.getByTestId('route-legend')).toContainText('Route 1');
  await expect(page.getByTestId('layout-selector')).toContainText('Layout 1');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
  // Conversion must not move what is already on screen (ADR 0025), so the
  // position is read once the graph has settled: sampling mid-transition could
  // report the unmoved position for the wrong reason, and would pass a card that
  // settles somewhere else a frame later.
  await settled(page);
  expect(await positionOf(card)).toEqual(before);
});

test('the Route that self-connection mints can be presented', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await settled(page);
  const cardId = await card.getAttribute('data-id');
  expect(cardId).not.toBeNull();
  await card.hover();

  await connectHandles(
    page,
    authoringHandle(card, 'source', 'right'),
    authoringHandle(card, 'target', 'left'),
  );
  await expect(page.getByTestId('route-selector')).toContainText('Route 1');

  // Every Card a fully cyclic Route holds is arrived at, so it has no entry
  // Card. The control is enabled because a Route *is* active, and presenting
  // used to return before changing anything — the click went nowhere.
  await page.getByTestId('present-button').click();

  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(activeCard(page)).toHaveAttribute('data-id', cardId!);
  const moves = page.getByTestId('presenting-moves').getByRole('button');
  await expect(moves).toHaveCount(1);
  await expect(moves).toHaveText('Card 1');
});

test('shows an empty disabled route control and no route HUD (ADR 0015)', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'Card 1')).toBeVisible();

  await expect(page.getByTestId('route-selector')).toContainText('None');
  await expect(page.getByTestId('present-button')).toBeDisabled();
  await expect(page.getByTestId('route-legend')).toHaveCount(0);
});

test('its one card is draggable once its automatic arrangement resolves (ADR 0025)', async ({
  page,
}) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await settled(page);

  const before = await positionOf(card);
  await dragBy(page, card, 0, 200);
  const after = await positionOf(card);

  expect(after.y).toBeGreaterThan(before.y + 80);
});

test('renders at natural size rather than filling the screen', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'Card 1')).toBeVisible();
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

test('persists a completed edit through the backend session', async ({ page }) => {
  await page.goto('/');

  const card = nodeByTitle(page, 'Card 1');
  await expect(card).toBeVisible();
  await settled(page);
  const before = await positionOf(card);
  await dragBy(page, card, 0, 220);
  expect((await positionOf(card)).y).toBeGreaterThan(before.y + 80);
  await expect(page.getByTestId('persistence-status')).toHaveText('Persisted');
});

test('a completed edit and workspace identity survive reload', async ({ page }) => {
  await page.goto('/');
  const first = nodeByTitle(page, 'Card 1');
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

  const second = nodeByTitle(page, 'Card 1');
  await expect(second).toBeVisible();
  await settled(page);
  expect(await second.getAttribute('data-id')).toBe(firstId);
  expect(await positionOf(second)).toEqual(durablePosition);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
});
