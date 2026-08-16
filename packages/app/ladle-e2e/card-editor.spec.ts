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

test('Alias editing dialog retargets through the production Card combobox', async ({ page }) => {
  await page.goto('/?story=components--card-editor--alias-editing-dialog&mode=preview');

  const alias = page.getByRole('article', { name: 'Strategy overview' });
  await alias.hover();
  await alias.getByRole('button', { name: 'Edit Card Strategy overview' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Strategy overview' });
  await expect(dialog.getByRole('textbox', { name: 'Markdown source' })).toHaveCount(0);
  await expect(dialog.locator('.card-editor__rail')).toHaveCSS(
    'background-color',
    'rgb(110, 168, 254)',
  );

  const target = dialog.getByRole('combobox', { name: 'Target Card' });
  await expect(target).toHaveValue('Strategies');
  await target.press('ArrowDown');
  const selectedOption = page.getByRole('option', { name: /Strategies/ });
  await selectedOption.hover();
  await expect(selectedOption.locator('[data-card-kind="markdown"]')).toHaveCSS(
    'color',
    'rgb(11, 13, 17)',
  );
  await expect(selectedOption.locator('.lucide-check')).toHaveCSS('color', 'rgb(11, 13, 17)');
  await target.fill('colour');
  await expect(dialog.getByRole('combobox')).toHaveCount(1);
  const fieldBox = await target.locator('..').boundingBox();
  const popupBox = await page.locator('[data-card-search-combobox]').boundingBox();
  expect(fieldBox).not.toBeNull();
  expect(popupBox).not.toBeNull();
  expect(popupBox?.x).toBeCloseTo(fieldBox?.x ?? 0, 0);
  expect(popupBox?.width).toBeCloseTo(fieldBox?.width ?? 0, 0);
  const option = page.getByRole('option', { name: /Colour tokens per graph/ });
  const optionKind = option.locator('[data-card-kind="markdown"]');
  await expect(optionKind).toBeVisible();
  await option.hover();
  await expect(optionKind).toHaveCSS('color', 'rgb(11, 13, 17)');
  await expect(option).toHaveCSS('color', 'rgb(11, 13, 17)');
  await option.click();

  await dialog.getByRole('textbox', { name: 'Title' }).fill('Updated overview');
  await dialog.getByRole('button', { name: 'Ok' }).click();
  await expect(dialog).toBeHidden();

  const renamed = page.getByRole('article', { name: 'Updated overview' });
  await renamed.hover();
  await renamed.getByRole('button', { name: 'Edit Card Updated overview' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Edit Updated overview' }).getByRole('combobox', {
      name: 'Target Card',
    }),
  ).toHaveValue('Colour tokens per graph');
});
