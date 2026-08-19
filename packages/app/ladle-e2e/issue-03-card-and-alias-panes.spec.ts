import { expect, test } from '@playwright/test';

test('Markdown Card story validates atomically and Escape cancels the whole draft', async ({
  page,
}) => {
  await page.goto('/?story=components--card-and-alias-panes--markdown&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'Architecture notes' });
  const title = dialog.getByRole('textbox', { name: 'Title' });
  const body = dialog.getByRole('textbox', { name: 'Markdown source' });
  await expect(title).toBeFocused();
  await expect(body).toHaveValue(/## Placement/);

  await title.fill('   ');
  await body.fill('A pending replacement');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('A Card title is required.');
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();

  await body.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByText('No edit completed.')).toBeVisible();
});

test('Card Editor error story keeps the draft pending', async ({ page }) => {
  await page.goto('/?story=components--card-and-alias-panes--error&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'Architecture notes' });
  const title = dialog.getByRole('textbox', { name: 'Title' });
  await expect(title).toBeFocused();
  await title.fill('Retitled notes');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(dialog.getByRole('alert')).toContainText('Couldn’t save changes');
  await expect(dialog.getByRole('alert')).toContainText(
    'This Card could not be completed. Try again.',
  );
  await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('Retitled notes');
  await expect(dialog).toBeVisible();
});

test('opened Alias empty story explains that no Target is eligible', async ({ page }) => {
  await page.goto('/?story=components--card-and-alias-panes--alias-empty&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'Placement recap' });
  await expect(dialog.getByRole('combobox', { name: 'Target' })).toHaveAccessibleDescription(
    'This Space holds no other Card that owns its content.',
  );
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('Card pane stories are isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=components--card-and-alias-panes--markdown');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.getByRole('dialog', { name: 'Architecture notes' })).toBeVisible();

  const storySearch = page.getByLabel('Search stories');
  await storySearch.fill('Persistence Indicator');
  await expect(storySearch).toHaveValue('Persistence Indicator');
  await page.getByRole('link', { name: 'Lifecycle' }).click();
  await expect(page).toHaveURL(/story=components--persistence-indicator--lifecycle/);
});
