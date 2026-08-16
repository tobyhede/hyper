import { expect, test } from '@playwright/test';

test('Card editing dialog uses the production paper editor composition', async ({ page }) => {
  await page.goto('/?story=components--card-editor--editing-dialog&mode=preview');

  const card = page.getByRole('article', { name: 'Strategies' });
  await card.hover();
  await card.getByRole('button', { name: 'Edit Card Strategies' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Strategies' });
  await expect(dialog).toBeVisible();

  const title = dialog.getByRole('textbox', { name: 'Title' });
  await expect(title).toHaveValue('Strategies');
  await expect(title).toHaveCSS('box-shadow', /rgb\(244, 239, 228\).*0px -1px.*inset/);
  await title.focus();
  await expect(title).toHaveCSS('box-shadow', /rgb\(255, 255, 255\).*0px -3px.*inset/);

  await expect(dialog.getByRole('textbox', { name: 'Markdown source' })).toHaveValue(
    '# Strategies',
  );
  await expect(dialog.getByRole('textbox', { name: 'Description' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Ok' })).toHaveCSS('color', 'rgb(11, 13, 17)');
  await expect(dialog).toHaveCSS('border-top-width', '4px');
  await expect(dialog).toHaveCSS('border-radius', '0px');
  await expect(dialog).toHaveCSS('box-shadow', 'none');
  await expect(dialog.locator('.card-editor__rail')).toHaveCSS(
    'background-color',
    'rgb(110, 168, 254)',
  );
});
