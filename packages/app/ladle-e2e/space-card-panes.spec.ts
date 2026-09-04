import { expect, test } from '@playwright/test';

test(
  'adding a Space Card offers a new or existing Space and completes on a labelled Create',
  { tag: '@parity:new-space-card-completes-on-a-labelled-create' },
  async ({ page }) => {
    await page.goto('/?story=components--space-card-panes--new-space-card-pane&mode=preview');

    const dialog = page.getByRole('dialog', { name: 'New Space Card' });
    const title = dialog.getByRole('textbox', { name: 'Title' });
    await expect(title).toBeFocused();

    const create = dialog.getByRole('button', { name: 'Create' });
    // The whole difference from the Alias pane beside it: a Space Card always
    // has a valid target available, so the completion waits on the title.
    await expect(create).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    const target = dialog.getByRole('combobox', { name: 'Space' });
    await expect(target).toHaveText('A new Space');
    await target.click();
    await expect(page.getByRole('option', { name: 'A new Space' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Architecture' })).toBeVisible();
    await page.getByRole('option', { name: 'Architecture' }).click();

    await title.fill('Architecture overview');
    await expect(create).toBeEnabled();
    await create.click();

    // The chosen Space's own id, so the story reports the target it was handed
    // rather than only that something completed.
    await expect(
      page.getByText(
        'Created Architecture overview referencing 00000000-0000-4000-8000-000000000201.',
      ),
    ).toBeVisible();
  },
);

test(
  'a refused Space Card creation keeps the pane open with the reason on its Space field',
  { tag: '@parity:new-space-card-keeps-a-refused-attempt-on-its-target-field' },
  async ({ page }) => {
    await page.goto(
      '/?story=components--space-card-panes--new-space-card-pane-refused&mode=preview',
    );

    const dialog = page.getByRole('dialog', { name: 'New Space Card' });
    await expect(dialog).toBeVisible();

    const target = dialog.getByRole('combobox', { name: 'Space' });
    await expect(target).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByText('A space card would make a space contain itself.')).toBeVisible();

    // The advice on how to finish is withdrawn while a refusal stands, so the
    // field-local corrective message is the sentence describing the next action.
    await expect(dialog.getByText('A new Space begins with one Markdown Card.')).toHaveCount(0);
  },
);

test('Space Card pane stories are isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=components--space-card-panes--new-space-card-pane');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.getByRole('dialog', { name: 'New Space Card' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'New Space Card' })).toHaveCount(0);
});
