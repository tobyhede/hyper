import { expect, test } from '@playwright/test';
import { markdownSource, PRIMARY_MODIFIER } from '../e2e/markdown-source';

test(
  'Markdown Card story validates atomically and Escape cancels the whole draft',
  { tag: '@parity:markdown-pane-refusal-is-field-local' },
  async ({ page }) => {
    await page.goto('/?story=components--card-and-alias-panes--markdown&mode=preview');

    const dialog = page.getByRole('dialog', { name: 'Architecture notes' });
    const title = dialog.getByRole('textbox', { name: 'Title' });
    const body = dialog.getByRole('textbox', { name: 'Markdown source' });
    await expect(title).toBeFocused();
    await expect(body).toContainText('## Placement');

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
  'Markdown source keeps exact bytes while the pane owns Tab and Escape',
  { tag: '@parity:markdown-source-editor-preserves-pane-ownership' },
  async ({ page }) => {
    await page.goto('/?story=components--card-and-alias-panes--markdown&mode=preview');

    const dialog = page.getByRole('dialog', { name: 'Architecture notes' });
    const title = dialog.getByRole('textbox', { name: 'Title' });
    const source = dialog.getByRole('textbox', { name: 'Markdown source' });
    await expect(title).toBeFocused();
    await title.press('Enter');
    await expect(source).toBeFocused();
    await expect(dialog.locator('[data-slot="markdown-source-line-numbers"]')).toBeVisible();

    const exact = '# Exact\n\n  two spaces and `code`';
    await source.fill(exact);
    expect(await markdownSource(source)).toBe(exact);
    await source.press(`${PRIMARY_MODIFIER}+z`);
    await expect(source).toContainText('## Placement');
    await source.press(`${PRIMARY_MODIFIER}+Shift+z`);
    expect(await markdownSource(source)).toBe(exact);

    await source.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(source).toBeFocused();
    await source.press(`${PRIMARY_MODIFIER}+a`);
    await source.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(page.getByText('No edit completed.')).toBeVisible();
  },
);

/**
 * The same paper treatment `editing.spec.ts` pins in the application, pinned here
 * because the catalogue is a different bundle: `.ladle/components.tsx` loads
 * `styles.css` before `tailwind.css`, the reverse of `main.tsx`. The editor's own
 * stylesheet arrives through the component either way, but only a computed-style
 * assertion in both bundles proves it — a Tailwind or cascade divergence between
 * the two surfaces is precisely what looked correct in one and wrong in the other
 * when this treatment was last rewritten.
 *
 * Untagged on purpose: it guards the move, and is not a parity claim of its own.
 */
test('the Markdown story draws the flat paper treatment in the catalogue bundle', async ({
  page,
}) => {
  await page.goto('/?story=components--card-and-alias-panes--markdown&mode=preview');

  const panel = page.locator('.card-pane__panel--card-editor');
  await expect(panel).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await expect(panel).toHaveCSS('border-top-color', 'rgb(11, 13, 17)');
  await expect(panel).toHaveCSS('border-top-width', '4px');

  const body = page.locator('[data-slot="markdown-source-editor"]');
  await expect(body).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  await expect(body).toHaveCSS('color', 'rgb(43, 48, 59)');
});

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

test(
  'adding an Alias completes on the Target chosen, with no create action beside Cancel',
  { tag: '@parity:new-alias-completes-on-the-target-chosen' },
  async ({ page }) => {
    await page.goto('/?story=components--card-and-alias-panes--new-alias-pane&mode=preview');

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
  await page.goto('/?story=components--card-and-alias-panes--new-alias-pane&mode=preview');

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
