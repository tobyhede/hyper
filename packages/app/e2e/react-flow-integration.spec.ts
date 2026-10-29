import { expect, test } from './fixtures';
import { nodeByTitle, resourceControls, selectCanvas, settled } from './graph';

test('a focused Resource opens with Enter, and Space reads it in Full View', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  const resource = nodeByTitle(page, 'A').first();
  await expect(resource).toBeVisible();
  await settled(page);

  // The guard that opening did not follow the pointer off the Resource when it
  // stopped being a gesture (ADR 0036).
  await resource.focus();
  await expect(resource).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(resource).toContainText('entry point');

  // Close is on the Resource's toolbar, drawn while it is selected (ADR 0102).
  const controls = await resourceControls(page, resource);
  await controls.getByRole('button', { name: 'Close Resource A' }).click();
  await resource.focus();
  await expect(resource).toBeFocused();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  const fullView = page.getByRole('region', { name: 'Full View' });
  await expect(fullView).toContainText('entry point');
  await expect(resource).not.toContainText('entry point');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await page.keyboard.press('Escape');
  await expect(fullView).toHaveCount(0);
  await expect(resource).toBeFocused();
});

test('the graph shows React Flow attribution', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await expect(page.locator('.react-flow__attribution a[href*="reactflow.dev"]')).toBeVisible();
});

test('Resources selected together by a Shift drag and a Cmd click move and leave the Map together', async ({
  page,
}) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((title) => nodeByTitle(page, title).first());
  if (a === undefined || b === undefined || c === undefined || d === undefined)
    throw new Error('missing a Resource');
  const before = await Promise.all([a, b, c, d].map((each) => each.boundingBox()));
  const [boxA, boxB] = before;
  if (boxA == null || boxB == null) throw new Error('missing a Resource box');

  // Shift and a drag draws a selection box: it takes A and B, not the Edge between them.
  await page.keyboard.down('Shift');
  await page.mouse.move(boxA.x - 20, boxA.y - 30);
  await page.mouse.down();
  await page.mouse.move(boxB.x + boxB.width + 20, boxB.y + boxB.height + 20, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(2);
  await expect(page.locator('.react-flow__edge.selected')).toHaveCount(0);

  // Cmd adds C to it.
  await c.click({ modifiers: ['Meta'] });
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(3);

  // Dragging one moves the three; D stays where it was.
  await page.mouse.move(boxB.x + 40, boxB.y + 30);
  await page.mouse.down();
  await page.mouse.move(boxB.x + 40, boxB.y + 230, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = await Promise.all([a, b, c, d].map((each) => each.boundingBox()));
      return after.map((box, index) => Math.round((box?.y ?? 0) - (before[index]?.y ?? 0)) > 100);
    })
    .toEqual([true, true, true, false]);

  // Delete removes the three from the Map.
  await page.keyboard.press('Delete');
  await expect(nodeByTitle(page, 'A')).toHaveCount(0);
  await expect(nodeByTitle(page, 'B')).toHaveCount(0);
  await expect(nodeByTitle(page, 'C')).toHaveCount(0);
  await expect(d).toBeVisible();
});
