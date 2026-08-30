import { expect, test } from '@playwright/test';

test(
  'saving story exposes the pending persistence state',
  { tag: '@parity:space-sidebar-shows-pending-persistence' },
  async ({ page }) => {
    await page.goto('/?story=space--messaging--saving&mode=preview');
    await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();
  },
);
