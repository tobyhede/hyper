import { expect, test, type Page } from './fixtures';
import type { SpaceSnapshot } from '@project/core';
import { authoringHandle, nodeByTitle, settled } from './graph';

test('a focused Card opens with Enter and Space', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('open-card')).toContainText('**A**');

  await page.getByTestId('close-card').click();
  await expect(page.getByTestId('open-card')).toBeHidden();
  await card.focus();
  await expect(card).toBeFocused();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('open-card')).toContainText('**A**');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test('the graph shows React Flow attribution', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('.react-flow__attribution a[href*="reactflow.dev"]')).toBeVisible();
});

interface HttpLoadedSpace {
  readonly snapshot: SpaceSnapshot;
  readonly revision: string;
  readonly exportedRevision: string | null;
}

const seedLayoutWithNoVisibleRoutes = async (page: Page): Promise<HttpLoadedSpace> => {
  const summariesResponse = await page.request.get('/api/spaces');
  expect(summariesResponse.ok()).toBe(true);
  const summaries = (await summariesResponse.json()) as readonly { id: string }[];
  const spaceId = summaries[0]?.id;
  expect(spaceId).toBeDefined();

  const loadedResponse = await page.request.get(`/api/spaces/${spaceId}`);
  expect(loadedResponse.ok()).toBe(true);
  const loaded = (await loadedResponse.json()) as HttpLoadedSpace;
  const layoutId = '00000000-0000-4000-8000-000000000099';
  const positions = Object.fromEntries(
    loaded.snapshot.cards.map((card, index) => [
      card.id,
      { x: (index % 5) * 320, y: Math.floor(index / 5) * 200 },
    ]),
  );
  const snapshot = {
    ...loaded.snapshot,
    document: {
      ...loaded.snapshot.document,
      layouts: [
        {
          id: layoutId,
          title: 'No Routes',
          kind: 'positioned',
          positions,
          routes: [],
        },
      ],
      defaultView: layoutId,
    },
  };
  const commitResponse = await page.request.put(`/api/spaces/${spaceId}`, {
    data: { snapshot, expectedRevision: loaded.revision },
  });
  expect(commitResponse.ok()).toBe(true);

  const seededResponse = await page.request.get(`/api/spaces/${spaceId}`);
  expect(seededResponse.ok()).toBe(true);
  return (await seededResponse.json()) as HttpLoadedSpace;
};

test('a Layout with no visible Route suppresses Alt empty-drop creation', async ({ page }) => {
  const seeded = await seedLayoutWithNoVisibleRoutes(page);
  await page.goto('/');
  const source = nodeByTitle(page, 'A').first();
  await expect(source).toBeVisible();
  await settled(page);
  await expect(page.getByTestId('layout-selector')).toContainText('No Routes');
  await expect(page.getByTestId('route-selector')).toContainText('None');
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    seeded.revision,
  );

  await source.hover();
  const sourceHandle = authoringHandle(source, 'source', 'right');
  const from = (await sourceHandle.boundingBox())!;
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2, { steps: 4 });
  await page.keyboard.down('Alt');
  await page.mouse.move(pane.x + 36, pane.y + 36, { steps: 4 });

  await expect(page.getByTestId('new-card-preview')).toHaveCount(0);
  await page.mouse.up();
  await page.keyboard.up('Alt');

  await expect(page.locator('.react-flow__node')).toHaveCount(seeded.snapshot.cards.length);
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-revision',
    seeded.revision,
  );
  const afterResponse = await page.request.get(`/api/spaces/${seeded.snapshot.id}`);
  expect(afterResponse.ok()).toBe(true);
  expect(await afterResponse.json()).toEqual(seeded);
});
