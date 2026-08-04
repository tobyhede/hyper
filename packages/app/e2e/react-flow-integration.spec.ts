import { expect, test } from './fixtures';
import { authoringHandle, boxOf, nodeByTitle, settled } from './graph';
import { allCardsOnAGrid, seedRouteLessLayout } from './seed';

test('a focused Card opens with Enter and Space', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A').first();
  await expect(card).toBeVisible();
  await settled(page);

  // The guard that opening did not follow the pointer off the Card when it
  // stopped being a gesture (ADR 0036, 0037).
  const source = page.getByRole('textbox', { name: 'Markdown source' });
  await card.focus();
  await expect(card).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(source).toHaveValue(/\*\*A\*\*/);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('open-card')).toBeHidden();
  await card.focus();
  await expect(card).toBeFocused();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(source).toHaveValue(/\*\*A\*\*/);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

test('the graph shows React Flow attribution', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('.react-flow__attribution a[href*="reactflow.dev"]')).toBeVisible();
});

test('a Layout with no visible Route suppresses Alt empty-drop creation', async ({ page }) => {
  const seeded = await seedRouteLessLayout(page, 'No Routes', allCardsOnAGrid);
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
  const from = await boxOf(sourceHandle, "the hovered Card's right source handle");
  const pane = await boxOf(page.locator('.react-flow__pane'), 'the React Flow pane');
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
