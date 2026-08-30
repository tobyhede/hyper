import { expect, test } from '@playwright/test';

test(
  'saving story exposes the pending persistence state',
  { tag: '@parity:space-sidebar-shows-pending-persistence' },
  async ({ page }) => {
    await page.goto('/?story=space--messaging--saving&mode=preview');
    await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();
  },
);

test(
  'startup story announces the failure and its diagnostic detail',
  { tag: '@parity:operational-feedback-startup-failure' },
  async ({ page }) => {
    await page.goto('/?story=space--messaging--startup&mode=preview');

    const alert = page.getByRole('alert');
    await expect(alert.getByText('Application could not start')).toBeVisible();
    await expect(alert).toContainText('Space document version 2 is not supported');
  },
);

test(
  'space app story announces the failure with its diagnostic detail reachable by keyboard',
  { tag: '@parity:operational-feedback-space-app-failure' },
  async ({ page }) => {
    await page.goto('/?story=space--messaging--space-app&mode=preview');

    const alert = page.getByRole('alert');
    await expect(alert.getByText('Unable to open this space')).toBeVisible();
    const detail = page.getByRole('region', { name: 'Space app failure detail' });
    await detail.focus();
    await expect(detail).toBeFocused();
  },
);

test(
  'placement story announces the failure without handing over the raw strategy message alone',
  { tag: '@parity:operational-feedback-placement-failure' },
  async ({ page }) => {
    await page.goto('/?story=space--messaging--placement&mode=preview');

    const alert = page.getByRole('alert');
    await expect(alert.getByText('Unable to arrange this view')).toBeVisible();
    await expect(alert).toContainText('No position for Card A');
  },
);

test(
  'arranging story announces the busy state',
  { tag: '@parity:operational-feedback-placement-pending' },
  async ({ page }) => {
    await page.goto('/?story=space--messaging--arranging&mode=preview');

    await expect(page.getByRole('status')).toHaveText('Arranging…');
  },
);
