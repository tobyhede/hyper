import { expect, test } from '@playwright/test';

const story = '/?story=components--palette-colour-picker--default&mode=preview';

test(
  'choosing a swatch updates the selection and closes the popover',
  { tag: '@parity:palette-color-picker-chooses-a-closed-palette-colour' },
  async ({ page }) => {
    await page.goto(story);

    await page.getByRole('button', { name: /^Colour: / }).click({ delay: 120 });
    const group = page.getByRole('radiogroup', { name: 'Graph colour' });
    await expect(group).toBeVisible();

    await group.getByRole('radio', { name: 'Orange', exact: true }).click();

    await expect(group).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Colour: Orange' })).toBeVisible();
  },
);
