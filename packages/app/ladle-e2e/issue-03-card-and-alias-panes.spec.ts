import { expect, test } from '@playwright/test';

test(
  'Markdown Card story validates atomically and Escape cancels the whole draft',
  { tag: '@parity:markdown-pane-refusal-is-field-local' },
  async ({ page }) => {
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
  },
);

test(
  'Alias Card story is present in the production catalogue',
  { tag: '@parity:alias-pane-authors-metadata' },
  async ({ page }) => {
    await page.goto('/?story=components--card-and-alias-panes--alias&mode=preview');

    const dialog = page.getByRole('dialog', { name: 'Placement recap' });
    await expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('Placement recap');
    await expect(dialog.getByRole('combobox', { name: 'Target' })).toHaveValue(
      'Architecture notes',
    );
    await expect(dialog.getByRole('textbox', { name: 'Markdown source' })).toHaveCount(0);

    await dialog.getByRole('textbox', { name: 'Title' }).fill('Revised placement recap');
    await dialog.getByRole('button', { name: 'Done' }).click();

    await expect(page.getByText('Completed Revised placement recap.')).toBeVisible();
  },
);

test('review Alias empty state explains that no Target is eligible', async ({ page }) => {
  await page.goto('/?story=review--alias-pane-unreachable-states--empty&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'Placement recap' });
  const target = dialog.getByRole('combobox', { name: 'Target' });
  await expect(target).toHaveAccessibleDescription(
    'This Space holds no other Card that owns its content.',
  );
  await target.press('ArrowDown');
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('review stale Alias Target refusal stays field-local', async ({ page }) => {
  await page.goto('/?story=review--alias-pane-unreachable-states--target-refused&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'Placement recap' });
  const target = dialog.getByRole('combobox', { name: 'Target' });
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('That Target is no longer part of the Space.');
  await expect(target).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();
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
