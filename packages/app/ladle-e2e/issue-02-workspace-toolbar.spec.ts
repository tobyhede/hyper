import { expect, test } from '@playwright/test';

test('Persistence Indicator story renders the production save lifecycle', async ({ page }) => {
  await page.goto('/?story=components--persistence-indicator--lifecycle&mode=preview');

  await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changes saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changes saved' })).toBeHidden({ timeout: 4_000 });
});

test('Workspace Toolbar story renders production Menubar behavior', async ({ page }) => {
  await page.goto('/?story=components--workspace-toolbar--pending&mode=preview');

  await expect(page.getByRole('menubar', { name: 'Workspace commands' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();
  await expect(page.getByTestId('layout-live-indicator')).toBeVisible();

  await page.getByTestId('view-selector').click();
  await page.getByRole('menuitemradio', { name: 'Grid', exact: true }).click();
  await expect(page.getByTestId('layout-live-indicator')).toBeHidden();

  const moreKinds = page.getByRole('button', { name: 'More Card kinds' });
  await moreKinds.click();
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeHidden();
  await expect(moreKinds).toBeFocused();
});

test('Workspace Toolbar story defines the Menubar keyboard contract', async ({ page }) => {
  await page.goto('/?story=components--workspace-toolbar--pending&mode=preview');

  const view = page.getByTestId('view-selector');
  const layout = page.getByTestId('layout-selector');

  await view.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitemradio', { name: 'Flow', exact: true })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(view).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(layout).toBeFocused();
  await page.keyboard.press('Enter');
  const collection = page.getByRole('menuitemradio', { name: 'Collection 1', exact: true });
  await expect(collection).toBeVisible();
  await collection.press('Enter');
  await expect(page.getByTestId('layout-live-indicator')).toBeVisible();
  await expect(collection).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(collection).toBeHidden();
  await expect(layout).toBeFocused();
});

test('Workspace Toolbar stories render quiet, retryable, and presenting states', async ({
  page,
}) => {
  await page.goto('/?story=components--workspace-toolbar--settled&mode=preview');
  await expect(page.getByRole('menubar', { name: 'Workspace commands' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changes saved' })).toBeHidden();

  await page.goto('/?story=components--workspace-toolbar--failed&mode=preview');
  const retry = page.getByRole('button', { name: 'Retry persistence' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toBeHidden();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-persistence-state',
    'settled',
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

  await page.goto('/?story=components--workspace-toolbar--presenting&mode=preview');
  await expect(page.getByRole('button', { name: 'Return to overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Card' })).toBeDisabled();
});

test('Workspace Toolbar stories render production conflict and rejection recovery', async ({
  page,
}) => {
  await page.goto('/?story=components--workspace-toolbar--conflicted&mode=preview');

  await expect(page.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByTestId('persistence-remote-refused')).toContainText(
    'The remote space is invalid and was not accepted.',
  );

  await page.goto('/?story=components--workspace-toolbar--rejected&mode=preview');
  await expect(page.getByRole('alertdialog', { name: 'Changes couldn’t be saved' })).toBeVisible();
  await expect(page.getByText('Permission denied')).toBeVisible();
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await expect(page.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
});
