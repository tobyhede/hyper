import { expect, test } from '@playwright/test';

test('Open Spaces switches without closing or resetting a Space Sidebar', async ({ page }) => {
  await page.goto('/?story=space--multiple-spaces--sidebars&mode=preview');

  const openSpaces = page.getByRole('tablist', { name: 'Open Spaces' });
  const authored = page.getByRole('tab', { name: 'Space' });
  const walkthrough = page.getByRole('tab', { name: /Walkthrough Save failed/ });

  await expect(openSpaces).toHaveAttribute('aria-orientation', 'vertical');
  await expect(walkthrough).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('tabpanel').getByTestId('space-title').filter({ hasText: 'Walkthrough' }),
  ).toHaveText('Walkthrough');

  await authored.click();
  await expect(authored).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel').getByTestId('space-title')).toHaveText('Space');

  await walkthrough.click();
  await expect(walkthrough).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('tabpanel').getByRole('heading', { name: 'Walkthrough', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('space-sidebar')).toHaveCount(3);
});

test('Open Spaces uses one tab stop and vertical keyboard navigation', async ({ page }) => {
  await page.goto('/?story=space--multiple-spaces--sidebars&mode=preview');

  const entries = page.getByRole('tab');
  await expect(entries).toHaveCount(3);
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);

  const walkthrough = page.getByRole('tab', { name: /Walkthrough Save failed/ });
  const deepDive = page.getByRole('tab', { name: 'Deep dive' });
  await walkthrough.focus();
  await page.keyboard.press('ArrowDown');
  await expect(deepDive).toBeFocused();
  await expect(walkthrough).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(deepDive).toHaveAttribute('aria-selected', 'true');
});
