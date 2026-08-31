import { expect, test } from '@playwright/test';

test(
  'adding an Alias completes on the Target chosen, with no create action beside Cancel',
  { tag: '@parity:new-alias-completes-on-the-target-chosen' },
  async ({ page }) => {
    await page.goto('/?story=components--alias-panes--new-alias-pane&mode=preview');

    const dialog = page.getByRole('dialog', { name: 'New Alias' });
    const target = dialog.getByRole('combobox', { name: 'Target' });
    await expect(target).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /create|add|done|save/i })).toHaveCount(0);

    await dialog.getByRole('textbox', { name: 'Title' }).fill('Placement recap');
    await target.fill('Architecture');
    await page.getByRole('option', { name: 'Architecture notes' }).click();

    await expect(dialog).toBeHidden();
    // The Markdown Card's own id, so the story reports the Target it was handed
    // rather than only that something completed.
    await expect(
      page.getByText('Created Placement recap on 00000000-0000-4000-8000-000000000101.'),
    ).toBeVisible();
  },
);

/**
 * The Card-choice popup's paper theme, pinned for the same reason as the editor's
 * above: it now survives only on the side-effect `import './card-search-combobox.css'`
 * in `CardSearchCombobox`, and every behavioural assertion in both suites passes
 * against the stock dark `bg-popover` treatment. This popup is portalled out of the
 * pane, so it is reached from the page rather than the dialog.
 *
 * Untagged: it guards the stylesheet, and is not a parity claim.
 */
test('the Card-choice popup draws its paper theme from the component that owns it', async ({
  page,
}) => {
  await page.goto('/?story=components--alias-panes--new-alias-pane&mode=preview');

  const dialog = page.getByRole('dialog', { name: 'New Alias' });
  await dialog.getByRole('combobox', { name: 'Target' }).fill('Architecture');

  const popup = page.locator('[data-card-search-combobox]');
  await expect(popup).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await expect(popup).toHaveCSS('border-top-color', 'rgb(11, 13, 17)');
  await expect(popup).toHaveCSS('border-top-width', '3px');
  await expect(page.getByRole('option', { name: 'Architecture notes' })).toHaveCSS(
    'border-bottom-color',
    'rgb(222, 214, 199)',
  );
});

test('Alias pane stories are isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=components--alias-panes--new-alias-pane');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.getByRole('dialog', { name: 'New Alias' })).toBeVisible();

  const storySearch = page.getByLabel('Search stories');
  await storySearch.fill('Persistence Indicator');
  await expect(storySearch).toHaveValue('Persistence Indicator');
  await page.getByRole('link', { name: 'Lifecycle' }).click();
  await expect(page).toHaveURL(/story=components--persistence-indicator--lifecycle/);
});
