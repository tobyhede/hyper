import { expect, test } from '@playwright/test';

const STORY = '/?story=surfaces--cards-drawer--available-cards&mode=preview';
const story = (name: string) => `/?story=surfaces--cards-drawer--${name}&mode=preview`;

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
  'Cards drawer names an empty Layout',
  { tag: '@parity:cards-drawer-distinguishes-an-empty-layout' },
  async ({ page }) => {
    await page.goto(story('empty'));
    await page.getByRole('button', { name: 'Cards' }).click();
    await expect(page.getByText('All Cards are in this Layout.')).toBeVisible();
  },
);

test(
  'Cards drawer keeps a long list searchable and scrollable on a narrow screen',
  { tag: '@parity:cards-drawer-scrolls-a-long-list-on-a-narrow-screen' },
  async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 360 });
    await page.goto(story('long-list'));
    await page.getByRole('button', { name: 'Cards' }).click();

    await expect(page.getByRole('textbox', { name: 'Search cards' })).toBeVisible();
    const list = page.locator('[data-base-ui-swipe-ignore]');
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
  },
);

test(
  'Cards drawer trigger is disabled while authoring is unavailable',
  { tag: '@parity:cards-drawer-withdraws-while-authoring-is-unavailable' },
  async ({ page }) => {
    await page.goto(story('disabled'));
    await expect(page.getByRole('button', { name: 'Cards' })).toBeDisabled();
  },
);

test(
  'Cards drawer keeps an Add refusal on its own surface',
  { tag: '@parity:cards-drawer-keeps-an-add-refusal-on-its-surface' },
  async ({ page }) => {
    await page.goto(story('refused'));
    await page.getByRole('button', { name: 'Cards' }).click();
    await page.getByRole('button', { name: 'Add API boundaries to Layout' }).click();

    await expect(page.getByRole('alert')).toContainText(
      'This Card is no longer available in this Layout.',
    );
  },
);

test(
  'Cards drawer remains available beside a retryable persistence failure',
  { tag: '@parity:cards-drawer-coexists-with-persistence-failure' },
  async ({ page }) => {
    await page.goto(story('persistence-failure'));
    await expect(page.getByTestId('persistence-failure')).toContainText(
      'The Card is local but has not been saved.',
    );
    await page.getByRole('button', { name: 'Cards' }).click();
    await expect(page.getByRole('dialog', { name: 'Cards' })).toBeVisible();
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
