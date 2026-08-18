import { expect, test } from '@playwright/test';

test('working Sidebar design exposes one current canvas arrangement', async ({ page }) => {
  await page.goto(
    '/?story=review--designing--workspace-sidebar--single-canvas-choice&mode=preview',
  );

  const flow = page.getByRole('button', { name: 'Flow' });
  const grid = page.getByRole('button', { name: 'Grid' });
  const collection = page.getByRole('button', { name: 'Collection 1' });

  await expect(collection).toHaveAttribute('aria-pressed', 'true');
  await expect(flow).toHaveAttribute('aria-pressed', 'false');
  await expect(grid).toHaveAttribute('aria-pressed', 'false');

  await grid.click();

  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(collection).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('heading', { name: 'Grid' })).toBeVisible();
  await expect(page.getByText('Computed view', { exact: true })).toBeVisible();
});
