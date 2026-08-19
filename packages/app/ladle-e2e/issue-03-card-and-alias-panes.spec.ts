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

test('opened Alias story keeps a refused metadata edit pending', async ({ page }) => {
  await page.goto('/?story=components--card-and-alias-panes--alias-refusal&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'Placement recap' });
  const title = dialog.getByRole('textbox', { name: 'Title' });
  await expect(title).toBeFocused();
  await title.fill('Retitled recap');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('This Alias could not be completed.');
  await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('Retitled recap');
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

test('new Alias empty story focuses Target and explains the missing choices', async ({ page }) => {
  await page.goto('/?story=components--card-and-alias-panes--new-alias-empty&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'New Alias' });
  const target = dialog.getByRole('combobox', { name: 'Target' });
  await expect(target).toBeFocused();
  await expect(target).toHaveAccessibleDescription(
    'An Alias needs a Card that owns its content, and this Space has none yet.',
  );
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('new Alias refusal stays open and becomes stale when a field changes', async ({ page }) => {
  await page.goto('/?story=components--card-and-alias-panes--new-alias-refusal&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'New Alias' });
  await expect(dialog.getByRole('alert')).toHaveText(
    'The Alias could not be placed in this Layout.',
  );
  await expect(dialog).toBeVisible();

  await dialog.getByTestId('new-alias-title').fill('A different attempt');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
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
