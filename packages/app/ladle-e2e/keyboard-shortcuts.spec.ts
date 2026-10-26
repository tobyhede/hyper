import { expect, test } from '@playwright/test';

const story = (name: string): string =>
  `/?story=components--keyboard-shortcuts--${name}&mode=preview`;

test(
  '? opens the authoring keys, each with its keys, and Escape closes the sheet',
  { tag: '@parity:shortcut-sheet-lists-the-authoring-keys' },
  async ({ page }) => {
    await page.goto(story('authoring'));
    await expect(page.getByText('Press ? to show the keyboard shortcuts.')).toBeVisible();

    await page.keyboard.press('Shift+?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('region', { name: 'On the canvas' })).toBeVisible();
    await expect(sheet.getByRole('region', { name: 'In Full View' })).toBeVisible();
    await expect(sheet.locator('kbd', { hasText: 'Shift' }).first()).toBeVisible();
    await expect(sheet).toContainText('Open the focused Resource and expand it to fit its content');
    await expect(sheet).toContainText('Show the keyboard shortcuts');

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  },
);

test(
  '? opens the presenting keys, and Escape closes the sheet',
  { tag: '@parity:shortcut-sheet-lists-the-presenting-keys' },
  async ({ page }) => {
    await page.goto(story('presenting'));
    await expect(page.getByText('Press ? to show the keyboard shortcuts.')).toBeVisible();

    await page.keyboard.press('Shift+?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet.getByRole('region', { name: 'While presenting' })).toBeVisible();
    await expect(sheet).toContainText('Go to the chosen next Resource');
    await expect(sheet).toContainText('PgDn');
    await expect(sheet.getByRole('region', { name: 'On the canvas' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  },
);
