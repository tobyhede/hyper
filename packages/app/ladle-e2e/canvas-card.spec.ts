import { expect, test } from '@playwright/test';

test(
  'Canvas Card exposes Alias identity and keyboard-focusable actions',
  { tag: '@parity:canvas-card-exposes-kind-and-keyboard-actions' },
  async ({ page }) => {
    await page.goto('/?story=components--canvas-card--states&mode=preview');

    const alias = page.getByRole('article', { name: 'Opening, again' });
    await expect(alias.getByRole('img', { name: 'Alias' })).toBeVisible();
    await expect(alias.getByTestId('alias-marker')).toHaveText('Opening');

    const connect = page.getByRole('button', { name: 'Connect from Traversal' });
    await connect.focus();
    await expect(connect).toBeFocused();
    await expect(connect).toBeVisible();
  },
);
