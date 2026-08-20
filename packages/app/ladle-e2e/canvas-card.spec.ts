import { expect, test } from '@playwright/test';

test(
  'Canvas Card exposes Alias identity and keyboard-focusable actions',
  { tag: '@parity:canvas-card-exposes-kind-and-keyboard-actions' },
  async ({ page }) => {
    await page.goto('/?story=components--canvas-card--states&mode=preview');

    const alias = page.getByRole('article', { name: 'Opening, again' });
    await expect(alias.getByRole('img', { name: 'Alias' })).toBeVisible();
    await expect(alias.getByTestId('alias-marker')).toHaveText('Opening');

    const rest = page.getByRole('article', { name: 'Strategies' });
    await expect(rest).toHaveCSS('background-color', 'rgb(244, 239, 228)');
    await expect(rest).toHaveCSS('border-color', 'rgb(11, 13, 17)');
    await expect(rest.locator('.canvas-card__title')).toHaveCSS('color', 'rgb(18, 22, 28)');
    await expect(rest.locator('.canvas-card__kind')).toHaveCSS('color', 'rgb(11, 13, 17)');

    const restingConnect = page.getByRole('button', { name: 'Connect from Strategies' });
    await expect(restingConnect).toHaveCSS('opacity', '1');
    await expect(rest.locator('.canvas-card__actions')).toHaveCSS('opacity', '0');
    await restingConnect.focus();
    await expect(restingConnect).toBeFocused();
    await expect(rest.locator('.canvas-card__actions')).toHaveCSS('opacity', '1');

    const connect = page.getByRole('button', { name: 'Connect from Traversal' });
    await connect.focus();
    await expect(connect).toBeFocused();
    await expect(connect).toBeVisible();
    await expect(connect).toHaveCSS('border-color', 'rgb(11, 13, 17)');
    await expect(connect).toHaveCSS('background-color', 'rgb(244, 239, 228)');

    const hoveredConnect = page.getByRole('button', { name: 'Connect from Opening, again' });
    await expect(alias).toHaveAttribute('data-state', 'selected-hover');
    await expect(alias.locator('.canvas-card__rail')).toHaveCSS(
      'background-color',
      'rgb(53, 214, 195)',
    );
    await expect(hoveredConnect).toBeVisible();
    await hoveredConnect.hover();
    await expect(hoveredConnect).toHaveCSS('background-color', 'rgb(11, 13, 17)');
    await expect(hoveredConnect).toHaveCSS('color', 'rgb(53, 214, 195)');
  },
);
