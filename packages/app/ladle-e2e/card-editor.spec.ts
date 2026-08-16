import { expect, test } from '@playwright/test';

test('Card editor opens from its single production Card', async ({ page }) => {
  await page.goto('/?story=components--card-editor--card&mode=preview');

  const card = page.getByRole('article', { name: 'Strategies' });
  await expect(page.getByRole('article')).toHaveCount(1);
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
    '# Strategies\n\nNo strategy is privileged.',
  );
  await expect(dialog.getByRole('textbox', { name: 'Description' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Ok' })).toHaveCSS('color', 'rgb(11, 13, 17)');
  await expect(dialog).toHaveCSS('border-top-width', '4px');
  await expect(dialog).toHaveCSS('border-radius', '0px');
  await expect(dialog).toHaveCSS('box-shadow', 'none');
  await expect(dialog.locator('.card-editor__rail')).toHaveCSS(
    'background-color',
    'rgb(52, 211, 153)',
  );
});

test('open Card dialog story renders the production dialog without a prerequisite interaction', async ({
  page,
}) => {
  await page.goto('/?story=components--card-editor--open-dialog&mode=preview');

  await expect(page.getByRole('dialog', { name: 'Edit Strategies' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('open dialog references are isolated from Ladle navigation', async ({ page }) => {
  await page.goto('/?story=components--card-editor--open-dialog');

  await expect(
    page.locator('iframe[title="Story components--card-editor--open-dialog"]'),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
});

test('Alias Card editor opens from its single production Alias', async ({ page }) => {
  await page.goto('/?story=components--alias-card-editor--alias-card&mode=preview');

  const alias = page.getByRole('article', { name: 'Strategy overview' });
  await expect(page.getByRole('article')).toHaveCount(1);
  await alias.hover();
  await alias.getByRole('button', { name: 'Edit Card Strategy overview' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit Strategy overview' });
  await expect(dialog.getByRole('textbox', { name: 'Markdown source' })).toHaveCount(0);
  await expect(dialog.locator('.card-editor__rail')).toHaveCSS(
    'background-color',
    'rgb(52, 211, 153)',
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

  await dialog.getByRole('button', { name: 'Ok' }).click();
  await expect(dialog).toBeHidden();
});

test('open Alias dialog story exposes example Card titles immediately', async ({ page }) => {
  await page.goto('/?story=components--alias-card-editor--open-dialog&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'Edit Strategy overview' });
  await expect(dialog).toBeVisible();
  const target = dialog.getByRole('combobox', { name: 'Target Card' });
  await target.press('ArrowDown');
  await expect(page.getByRole('option', { name: /Strategies/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Graphs as colour-coded flows/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Colour tokens per graph/ })).toBeVisible();
});
