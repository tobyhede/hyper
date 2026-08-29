import {
  FLOW_SPACE_VIEW_ID,
  GRID_SPACE_VIEW_ID,
  encodeCompactUuid,
  uuidSchema,
} from '@project/core';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { SEEDED_GRAPH_ID, SEEDED_LAYOUT_ID, seedPositionedLayout } from './seed';

const FIXTURE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000040');
const MISSING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000041');
const FIRST_LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000050');
const LONG_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000023');
const MID_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000024');
const ECHO_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000026');
const CARD_A_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const CARD_B_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_C_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const CARD_E_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

const installClipboard = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: (value: string) => {
          sessionStorage.setItem('copied-product-url', value);
          return Promise.resolve();
        },
        readText: () => Promise.resolve(sessionStorage.getItem('copied-product-url') ?? ''),
      },
    });
  });
};

test('root redirects to and opens the canonical Entry Space URL', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);
  await expect(page.getByRole('heading', { name: 'Layout fixture', exact: true })).toBeVisible();
});

test('a direct canonical URL opens its exact existing Space', async ({ page }) => {
  const response = await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Layout fixture', exact: true })).toBeVisible();
});

test('a direct Space View URL restores the named Computed View', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
  );

  expect(response?.status()).toBe(200);
  await expect(page.getByText('Flow', { exact: true }).first()).toBeVisible();
});

test('choosing a Space View pushes history and Back, Forward and reload restore it without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}`;
  const grid = `${canonical}/views/${encodeCompactUuid(GRID_SPACE_VIEW_ID)}`;
  await page.goto(canonical);
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  await page.getByTestId('canvas-renderer').filter({ hasText: 'Grid' }).click();
  await expect(page).toHaveURL(grid);
  await page.reload();
  await expect(page.getByText('Grid', { exact: true }).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByText('Flow', { exact: true }).first()).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(grid);
  await expect(page.getByText('Grid', { exact: true }).first()).toBeVisible();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('Back or Forward to an unresolved destination shows the destination surface', async ({
  page,
}) => {
  await page.goto(`/spaces/${encodeCompactUuid(FIXTURE_ID)}`);
  await expect(page.getByTestId('selected-canvas')).toBeVisible();

  await page.evaluate(
    (path) => {
      window.history.pushState(null, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(MISSING_ID)}`,
  );

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Destination not found');
  await expect(alert).toContainText('The requested address does not exist in this Space.');
});

test('malformed and unresolved Space URLs have real host statuses', async ({ page }) => {
  const malformed = await page.goto('/spaces/not-a-compact-uuid');
  expect(malformed?.status()).toBe(400);

  const unresolved = await page.goto(`/spaces/${encodeCompactUuid(MISSING_ID)}`);
  expect(unresolved?.status()).toBe(404);

  const malformedView = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/not-a-compact-uuid`,
  );
  expect(malformedView?.status()).toBe(400);

  const unresolvedView = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedView?.status()).toBe(404);

  const malformedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/not-a-compact-uuid`,
  );
  expect(malformedGraph?.status()).toBe(400);

  const unresolvedGraph = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(MISSING_ID)}`,
  );
  expect(unresolvedGraph?.status()).toBe(404);
});

test('canonical and contextual Card links reveal a Closed Card without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_E_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(canonical))?.status()).toBe(200);
  const cardE = page.locator(`.react-flow__node[data-id="${CARD_E_ID}"]`);
  await expect(cardE).toBeFocused();
  await expect(cardE.getByTestId('card')).toHaveAttribute('data-expanded', 'false');

  expect((await page.goto(contextual))?.status()).toBe(200);
  const cardA = page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`);
  await expect(cardA).toBeFocused();
  await expect(cardA.getByTestId('card')).toHaveAttribute('data-expanded', 'false');
  await page.reload();
  await expect(cardA).toBeFocused();
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(cardE).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(contextual);
  await expect(cardA).toBeFocused();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('a contextual Layout-and-Card link is not found when the Layout omits the Card', async ({
  page,
}) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_E_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('a canonical Card omitted by the default Layout is revealed only in the Cards collection', async ({
  page,
}) => {
  const seeded = await seedPositionedLayout(page, 'Sparse Layout', (snapshot) => {
    const included = snapshot.cards[0];
    expect(included).toBeDefined();
    return included === undefined ? {} : { [included.id]: { x: 0, y: 0, open: false as const } };
  });
  const omitted = seeded.snapshot.cards[1];
  expect(omitted).toBeDefined();
  if (omitted === undefined) return;
  const canonical = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/cards/${encodeCompactUuid(omitted.id)}`;

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Layout');
  await expect(page.getByText('Cards', { exact: true })).toBeVisible();
  await expect(page.locator(`[data-card-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.locator(`.react-flow__node[data-id="${omitted.id}"]`)).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('selected-canvas')).toContainText('Sparse Layout');
  await expect(page.locator(`[data-card-id="${omitted.id}"]`)).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('history restores a canonical Card through the default Space View, not the context being left', async ({
  page,
}) => {
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`;
  await page.goto(contextual);
  await page.goto(canonical);
  await page.goBack();
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');

  await page.goForward();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByTestId('selected-canvas')).toContainText('Flow');
});

test(
  'copy commands distinguish canonical Card identity from its current Space View',
  {
    tag: '@parity:space-sidebar-copies-card-destinations',
  },
  async ({ page }) => {
    await installClipboard(page);
    const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
    await page.goto(view);
    await page.locator(`.react-flow__node[data-id="${CARD_A_ID}"]`).click();

    await page.getByRole('button', { name: 'Copy link to A' }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/cards/${encodeCompactUuid(CARD_A_ID)}`,
      );

    await page.getByRole('button', { name: 'Copy link in this Space View' }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${new URL(page.url()).origin}${view}/cards/${encodeCompactUuid(CARD_A_ID)}`);
  },
);

test('canonical and contextual Graph links restore navigation context without authoring', async ({
  page,
}) => {
  const canonical = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const contextual = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(canonical))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();

  expect((await page.goto(contextual))?.status()).toBe(200);
  await expect(page.getByTestId('selected-canvas')).toContainText('Flow');
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(canonical);
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(contextual);
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('activating a Graph pushes a contextual destination restored by Back and Forward', async ({
  page,
}) => {
  const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
  const mid = `${view}/graphs/${encodeCompactUuid(MID_GRAPH_ID)}`;
  await page.goto(view);

  await page.getByRole('button', { name: 'Mid', exact: true }).click();
  await expect(page).toHaveURL(mid);
  await page.goBack();
  await expect(page).toHaveURL(view);
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(mid);
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
});

test(
  'Graph copy commands distinguish canonical identity from the current Space View',
  {
    tag: '@parity:space-sidebar-copies-graph-destinations',
  },
  async ({ page }) => {
    await installClipboard(page);
    const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
    await page.goto(view);

    await page.getByRole('button', { name: 'Copy link to Long', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(
        `${new URL(page.url()).origin}/spaces/${encodeCompactUuid(FIXTURE_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`,
      );

    await page.getByRole('button', { name: 'Copy link to Long in this Space View' }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${new URL(page.url()).origin}${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);
  },
);

test('an incompatible contextual Layout-and-Graph destination has a real 404', async ({ page }) => {
  const response = await page.goto(
    `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(ECHO_GRAPH_ID)}`,
  );

  expect(response?.status()).toBe(404);
});

test('an exact presentation link starts fresh at its Card and moves through browser history', async ({
  page,
}) => {
  const view = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}`;
  const atB = `${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(CARD_B_ID)}`;
  const atC = `${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(CARD_C_ID)}`;
  const before = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());

  expect((await page.goto(atB))?.status()).toBe(200);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${CARD_B_ID}"]`)).toHaveClass(
    /rf-card-node--active/,
  );
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(atB);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await expect(page.locator(`.react-flow__node[data-id="${CARD_B_ID}"]`)).toHaveClass(
    /rf-card-node--active/,
  );
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(atC);
  await page.goBack();
  await expect(page).toHaveURL(atB);
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
  await page.goForward();
  await expect(page).toHaveURL(atC);
  await page.getByTestId('exit-presenting').click();
  await expect(page).toHaveURL(`${view}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`);

  const after = await page.request
    .get(`/api/spaces/${FIXTURE_ID}`)
    .then((response) => response.text());
  expect(after).toEqual(before);
});

test('copies the exact current presentation point', async ({ page }) => {
  await installClipboard(page);
  const path = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present/${encodeCompactUuid(CARD_B_ID)}`;
  await page.goto(path);

  await page.getByRole('button', { name: 'Copy link to this presentation point' }).click();

  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}${path}`);
});

test('entering, advancing and retreating each append presentation history', async ({ page }) => {
  const graph = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}`;
  const atA = `${graph}/present/${encodeCompactUuid(CARD_A_ID)}`;
  const atB = `${graph}/present/${encodeCompactUuid(CARD_B_ID)}`;
  await page.goto(graph);

  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page).toHaveURL(atA);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(atB);
  await page.getByTestId('presenting-chrome').getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(atA);

  await page.goBack();
  await expect(page).toHaveURL(atB);
  await page.goBack();
  await expect(page).toHaveURL(atA);
  await page.goForward();
  await expect(page).toHaveURL(atB);
  await page.goForward();
  await expect(page).toHaveURL(atA);
});

test('a self-Edge presentation move adds a same-URL browser entry', async ({ page }) => {
  const seeded = await seedPositionedLayout(page, 'Self Edge', () => ({
    [CARD_A_ID]: { x: 20, y: 20, open: false },
  }));
  const snapshot = {
    ...seeded.snapshot,
    document: {
      ...seeded.snapshot.document,
      layouts: [
        {
          ...seeded.snapshot.document.layouts?.[0],
          graphs: [
            {
              id: SEEDED_GRAPH_ID,
              title: 'Graph 1',
              edges: [{ from: CARD_A_ID, to: CARD_A_ID }],
            },
          ],
        },
      ],
    },
  };
  const commit = await page.request.put(`/api/spaces/${seeded.snapshot.id}`, {
    data: { snapshot, expectedRevision: seeded.revision },
  });
  expect(commit.ok()).toBe(true);
  const graph = `/spaces/${encodeCompactUuid(seeded.snapshot.id)}/views/${encodeCompactUuid(SEEDED_LAYOUT_ID)}/graphs/${encodeCompactUuid(SEEDED_GRAPH_ID)}`;
  const point = `${graph}/present/${encodeCompactUuid(CARD_A_ID)}`;
  await page.goto(graph);

  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page).toHaveURL(point);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(point);

  await page.goBack();
  await expect(page).toHaveURL(point);
  await expect(page.getByTestId('presenting-chrome')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(graph);
  await page.goForward();
  await expect(page).toHaveURL(point);
});

test('malformed and incompatible presentation destinations have real host statuses', async ({
  page,
}) => {
  const base = `/spaces/${encodeCompactUuid(FIXTURE_ID)}/views/${encodeCompactUuid(FIRST_LAYOUT_ID)}/graphs/${encodeCompactUuid(LONG_GRAPH_ID)}/present`;
  expect((await page.goto(`${base}/not-a-compact-uuid`))?.status()).toBe(400);
  expect((await page.goto(`${base}/${encodeCompactUuid(CARD_E_ID)}`))?.status()).toBe(404);
});
