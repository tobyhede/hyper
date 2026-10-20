import { expect, test } from '@playwright/test';

const story = (name: string): string =>
  `/?story=components--github-location-form--${name}&mode=preview`;

test(
  'a location that does not read is refused beside the field with its reason',
  { tag: '@parity:github-location-form-refuses-a-location-that-does-not-read' },
  async ({ page }) => {
    await page.goto(story('asking'));
    const location = page.getByRole('textbox', { name: 'GitHub location' });
    await expect(location).toHaveAttribute('aria-invalid', 'false');

    await location.fill('tobyhede/talk');
    await page.getByRole('button', { name: 'Open' }).click();

    await expect(page.getByText('a GitHub location begins with github:')).toBeVisible();
    await expect(location).toHaveAttribute('aria-invalid', 'true');
    await expect(location).toHaveValue('tobyhede/talk');

    await location.fill('github:tobyhede/talk@main/slides');
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByText('a GitHub location begins with github:')).toHaveCount(0);
    await expect(location).toHaveAttribute('aria-invalid', 'false');
  },
);
