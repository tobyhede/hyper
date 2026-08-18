import { expect, test } from '@playwright/test';

test('Persistence Indicator story renders the production save lifecycle', async ({ page }) => {
  await page.goto('/?story=components--persistence-indicator--lifecycle&mode=preview');

  await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changes saved' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changes saved' })).toBeHidden({ timeout: 4_000 });
});

/**
 * ADR 0053's first claim, proven on the rendered story: one exclusive list over
 * computed Views and authored Layouts, one pressed item, and a canvas header
 * that names it.
 */
test('Workspace Sidebar story renders one exclusive canvas choice', async ({ page }) => {
  await page.goto('/?story=components--workspace-sidebar--pending&mode=preview');

  const flow = page.getByRole('button', { name: 'Flow' });
  const grid = page.getByRole('button', { name: 'Grid' });
  const collection = page.getByRole('button', { name: 'Collection 1' });

  await expect(collection).toHaveAttribute('aria-pressed', 'true');
  await expect(flow).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
  await expect(page.getByTestId('selected-canvas-kind')).toHaveText('Authored layout');
  await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();
  await expect(page.getByText('None', { exact: true })).toHaveCount(0);

  await grid.click();

  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(collection).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('selected-canvas')).toContainText('Grid');
  await expect(page.getByTestId('selected-canvas-kind')).toHaveText('Computed view');
});

/**
 * The list's keyboard contract is a list of buttons', not a Select's or a
 * Menubar's: Tab reaches each row, Enter activates the row it is on, and no
 * popup opens, dismisses or has focus to return.
 */
test('Workspace Sidebar story defines the canvas renderer keyboard contract', async ({ page }) => {
  await page.goto('/?story=components--workspace-sidebar--pending&mode=preview');

  const flow = page.getByRole('button', { name: 'Flow' });
  const grid = page.getByRole('button', { name: 'Grid' });

  await flow.focus();
  await page.keyboard.press('Tab');
  await expect(grid).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  await expect(grid).toBeFocused();
  await expect(page.getByTestId('selected-canvas')).toContainText('Grid');
});

test('Workspace Sidebar story keeps the Add Card split control whole', async ({ page }) => {
  await page.goto('/?story=components--workspace-sidebar--pending&mode=preview');

  const moreKinds = page.getByRole('button', { name: 'More Card kinds' });
  await moreKinds.click();
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeHidden();
  await expect(moreKinds).toBeFocused();
});

/** A Space opens on a computed View owning no Layout and no Graph (ADR 0025, ADR 0018). */
test('Workspace Sidebar story says an unauthored Space has nothing yet', async ({ page }) => {
  await page.goto('/?story=components--workspace-sidebar--unauthored&mode=preview');

  await expect(page.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('no-authored-layouts')).toBeVisible();
  await expect(page.getByTestId('no-graphs')).toBeVisible();
  await expect(page.getByTestId('present-button')).toBeDisabled();
});

test('Workspace Sidebar stories render quiet, retryable, and presenting states', async ({
  page,
}) => {
  await page.goto('/?story=components--workspace-sidebar--settled&mode=preview');
  await expect(page.getByRole('button', { name: 'Collection 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Changes saved' })).toBeHidden();

  await page.goto('/?story=components--workspace-sidebar--failed&mode=preview');
  // Two surfaces for one condition: a red dot that leaves the sidebar footer's
  // geometry alone, and the notice pinned under the canvas header carrying
  // reason and action.
  await expect(page.getByRole('button', { name: 'Changes not saved' })).toBeVisible();
  const failure = page.getByTestId('persistence-failure');
  await expect(failure).toContainText('Network unavailable');
  const retry = failure.getByRole('button', { name: 'Retry' });
  await retry.click();
  await expect(failure).toBeHidden();
  await expect(page.getByRole('button', { name: 'Changes not saved' })).toBeHidden();
  await expect(page.getByTestId('persistence-status')).toHaveAttribute(
    'data-persistence-state',
    'settled',
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

  await page.goto('/?story=components--workspace-sidebar--presenting&mode=preview');
  await expect(page.getByTestId('exit-presenting-button')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Card' })).toBeDisabled();
});

test('Workspace Sidebar stories render production conflict and rejection recovery', async ({
  page,
}) => {
  await page.goto('/?story=components--workspace-sidebar--conflicted&mode=preview');

  await expect(page.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep local and retry' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect(page.getByTestId('persistence-remote-refused')).toContainText(
    'The remote space is invalid and was not accepted.',
  );

  await page.goto('/?story=components--workspace-sidebar--rejected&mode=preview');
  await expect(page.getByRole('alertdialog', { name: 'Changes couldn’t be saved' })).toBeVisible();
  await expect(page.getByText('Permission denied')).toBeVisible();
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await expect(page.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
});

/**
 * The Sidebar's desktop container is `fixed`, so every one of these stories is
 * framed — a modal's focus trap is only the loudest reason. Proven by clicking
 * real catalogue navigation while the story owns its own viewport.
 */
test('Workspace Sidebar stories are isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=components--workspace-sidebar--conflicted');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();

  const storySearch = page.getByLabel('Search stories');
  await storySearch.fill('Persistence Indicator');
  await expect(storySearch).toHaveValue('Persistence Indicator');
  await page.getByRole('link', { name: 'Lifecycle' }).click();
  await expect(page).toHaveURL(/story=components--persistence-indicator--lifecycle/);

  await page.goto('/?story=components--workspace-sidebar--settled');
  await expect(page.frameLocator('iframe').getByTestId('workspace-sidebar')).toBeVisible();
  await expect(page.getByLabel('Search stories')).toBeVisible();
});
