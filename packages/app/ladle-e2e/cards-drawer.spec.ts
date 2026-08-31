import { expect, test } from '@playwright/test';

const STORY = '/?story=surfaces--cards-drawer--available-cards&mode=preview';

test(
  'Cards drawer uses production Card fronts and narrows the available Cards',
  { tag: '@parity:cards-drawer-adds-existing-layout-members' },
  async ({ page }) => {
    await page.goto(STORY);

    await page.getByRole('button', { name: 'Cards' }).click();
    await expect(page.getByRole('dialog', { name: 'Cards' })).toBeVisible();

    await expect(page.getByRole('button', { name: /^Add .* to Layout$/ })).toHaveCount(5);
    await expect(page.locator('.react-flow__handle')).toHaveCount(0);

    await page.getByRole('button', { name: 'Filter cards by kind' }).click();
    await page.getByRole('menuitemradio', { name: 'Alias' }).click();
    await expect(page.getByRole('button', { name: 'Add Constraints to Layout' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Architecture to Layout' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Search cards' }).fill('missing');
    await expect(page.getByText('No matching Cards.')).toBeVisible();
  },
);

test(
  'Cards drawer opens, dismisses on Escape, and leaves the surface behind it live',
  { tag: '@parity:cards-drawer-opens-and-dismisses-without-locking-the-canvas' },
  async ({ page }) => {
    await page.goto(STORY);

    const trigger = page.getByRole('button', { name: 'Cards' });
    const behind = page.getByRole('button', { name: 'The canvas behind it' });
    const drawer = page.getByRole('dialog', { name: 'Cards' });

    await expect(drawer).toHaveCount(0);
    await trigger.click();
    await expect(drawer).toBeVisible();

    // Escape from inside the drawer hands focus back to the control that opened
    // it, rather than dropping it on the document.
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // The viewport spans the screen so the popup can sit against the edge. A
    // press on the canvas must reach the canvas, not the viewport, and must not
    // dismiss the drawer — dropping a Card is exactly that press.
    await trigger.click();
    await expect(drawer).toBeVisible();
    await behind.click();
    await expect(page.getByText('Added: canvas')).toBeVisible();
    await expect(drawer).toBeVisible();
  },
);
