import { expect, test } from '@playwright/test';

const STORY = '/?story=surfaces--things-drawer--available-things&mode=preview';
const story = (name: string) => `/?story=surfaces--things-drawer--${name}&mode=preview`;

test(
  'Things drawer uses production Thing fronts and narrows the available Things',
  { tag: '@parity:things-drawer-adds-existing-diagram-members' },
  async ({ page }) => {
    await page.goto(STORY);

    await page.getByRole('button', { name: 'Things' }).click();
    await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();

    await expect(page.getByRole('button', { name: /^Add .* to Diagram$/ })).toHaveCount(5);
    await expect(page.locator('.react-flow__handle')).toHaveCount(0);

    await page.getByRole('button', { name: 'Filter things by kind' }).click();
    await page.getByRole('menuitemradio', { name: 'Alias' }).click();
    await expect(page.getByRole('button', { name: 'Add Constraints to Diagram' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Architecture to Diagram' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Search things' }).fill('missing');
    await expect(page.getByText('No matching Things.')).toBeVisible();
  },
);

test(
  'Things drawer names an empty Diagram',
  { tag: '@parity:things-drawer-distinguishes-an-empty-diagram' },
  async ({ page }) => {
    await page.goto(story('empty'));
    await page.getByRole('button', { name: 'Things' }).click();
    await expect(page.getByText('All Things are in this Diagram.')).toBeVisible();
  },
);

test(
  'Things drawer keeps a long list searchable and scrollable on a narrow screen',
  { tag: '@parity:things-drawer-scrolls-a-long-list-on-a-narrow-screen' },
  async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 360 });
    await page.goto(story('long-list'));
    await page.getByRole('button', { name: 'Things' }).click();

    await expect(page.getByRole('textbox', { name: 'Search things' })).toBeVisible();
    const list = page.locator('[data-base-ui-swipe-ignore]');
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
  },
);

test(
  'Things drawer trigger is disabled while authoring is unavailable',
  { tag: '@parity:things-drawer-withdraws-while-authoring-is-unavailable' },
  async ({ page }) => {
    await page.goto(story('disabled'));
    await expect(page.getByRole('button', { name: 'Things' })).toBeDisabled();
  },
);

test(
  'Things drawer keeps an Add refusal on its own surface',
  { tag: '@parity:things-drawer-keeps-an-add-refusal-on-its-surface' },
  async ({ page }) => {
    await page.goto(story('refused'));
    await page.getByRole('button', { name: 'Things' }).click();
    await page.getByRole('button', { name: 'Add Thing 3 to Diagram' }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await expect(page.getByRole('alert')).toContainText('This Thing is already in this Diagram.');
  },
);

test(
  'Things drawer remains available beside a retryable persistence failure',
  { tag: '@parity:things-drawer-coexists-with-persistence-failure' },
  async ({ page }) => {
    await page.goto(story('persistence-failure'));
    const notice = page.getByTestId('persistence-failure');
    await expect(notice).toContainText('Your device could not reach the server.');
    await expect(notice).not.toContainText('Failed to fetch');
    await page.getByRole('button', { name: 'Things' }).click();
    await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();
  },
);

test(
  'Things drawer opens, dismisses on Escape, and leaves the surface behind it live',
  { tag: '@parity:things-drawer-opens-and-dismisses-without-locking-the-canvas' },
  async ({ page }) => {
    await page.goto(STORY);

    const trigger = page.getByRole('button', { name: 'Things' });
    const behind = page.getByRole('button', { name: 'The canvas behind it' });
    const drawer = page.getByRole('dialog', { name: 'Things' });

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
    // dismiss the drawer — dropping a Thing is exactly that press.
    await trigger.click();
    await expect(drawer).toBeVisible();
    await behind.click();
    await expect(page.getByText('Added: canvas')).toBeVisible();
    await expect(drawer).toBeVisible();
  },
);
