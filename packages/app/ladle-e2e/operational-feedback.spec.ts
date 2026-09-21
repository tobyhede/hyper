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
  'starting story announces the wait once, under the product mark',
  { tag: '@parity:operational-feedback-startup-pending' },
  async ({ page }) => {
    await page.goto('/?story=components--operational-feedback--starting&mode=preview');

    const status = page.getByRole('status');
    await expect(status).toHaveText('Starting…');
    // One live region, and the mark inside it: decorative, so it carries an
    // empty `alt` and adds nothing to what the region announces.
    await expect(status).toHaveCount(1);
    const mark = status.locator('img');
    await expect(mark).toHaveAttribute('src', '/infinity-cube-logo.svg');
    await expect(mark).toHaveAttribute('alt', '');
    // The asset is really served, rather than a broken image drawn at the right
    // address: a failed load leaves `naturalWidth` at 0.
    await expect
      .poll(() =>
        mark.evaluate(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      )
      .toBe(true);
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
    await expect(detail).toContainText('Graph names an absent resource');
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
    await expect(alert).toContainText('No position for Resource A');
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
