import { expect, test } from '@playwright/test';

test(
  'startup story announces the failure and its diagnostic detail',
  { tag: '@parity:operational-feedback-startup-failure' },
  async ({ page }) => {
    await page.goto('/?story=components--operational-feedback--startup&mode=preview');

    const alert = page.getByRole('alert');
    await expect(alert.getByText('Application could not start')).toBeVisible();
    await expect(alert).toContainText('Space document version 2 is not supported');
  },
);

test(
  'space app story announces the failure with its diagnostic detail reachable by keyboard',
  { tag: '@parity:operational-feedback-space-app-failure' },
  async ({ page }) => {
    await page.goto('/?story=components--operational-feedback--space-app&mode=preview');

    const alert = page.getByRole('alert');
    await expect(alert.getByText('Unable to open this space')).toBeVisible();
    const detail = page.getByRole('region', { name: 'Space app failure detail' });
    await expect(detail).toContainText('Graph names an absent card');
    await detail.focus();
    await expect(detail).toBeFocused();
  },
);

test(
  'placement story announces the failure without handing over the raw strategy message alone',
  { tag: '@parity:operational-feedback-placement-failure' },
  async ({ page }) => {
    await page.goto('/?story=components--operational-feedback--placement&mode=preview');

    const alert = page.getByRole('alert');
    await expect(alert.getByText('Unable to arrange this view')).toBeVisible();
    await expect(alert).toContainText('No position for Card A');
  },
);

test(
  'arranging story announces the busy state',
  { tag: '@parity:operational-feedback-placement-pending' },
  async ({ page }) => {
    await page.goto('/?story=components--operational-feedback--arranging&mode=preview');

    await expect(page.getByRole('status')).toHaveText('Arranging…');
  },
);
