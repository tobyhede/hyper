import { expect, test } from '@playwright/test';

test('Workspace Toolbar story renders the production composition and menu behavior', async ({
  page,
}) => {
  await page.goto('/?story=components--workspace-toolbar--pending&mode=preview');

  await expect(page.getByRole('combobox', { name: 'Choose view' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Choose layout' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Graph controls' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Card' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();

  await expect(page.getByTestId('layout-live-indicator')).toBeVisible();
  await page.getByTestId('view-selector').click();
  await page.getByRole('option', { name: 'Grid', exact: true }).click();
  await expect(page.getByTestId('layout-live-indicator')).toBeHidden();

  const moreKinds = page.getByRole('button', { name: 'More Card kinds' });
  await moreKinds.click();
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeHidden();
  await expect(moreKinds).toBeFocused();
});
