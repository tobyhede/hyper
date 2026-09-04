import { expect, test } from '@playwright/test';

test(
  'Persistence Indicator story renders the production save lifecycle',
  { tag: '@parity:persistence-indicator-shows-save-lifecycle' },
  async ({ page }) => {
    await page.goto('/?story=components--persistence-indicator--lifecycle&mode=preview');

    await expect(page.getByRole('button', { name: 'Saving changes' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Changes saved' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Changes saved' })).toBeHidden({
      timeout: 4_000,
    });
  },
);

/**
 * ADR 0053's first claim, proven on the rendered story: one exclusive list over
 * authored Layouts, one pressed item, and a canvas header
 * that names it.
 */
test(
  'Space Sidebar story renders one exclusive canvas choice',
  {
    tag: '@parity:space-sidebar-marks-one-current-renderer',
  },
  async ({ page }) => {
    await page.goto('/?story=space--space--settled&mode=preview');

    const other = page.getByRole('button', { name: 'Collection 2', exact: true });
    const collection = page
      .getByTestId('space-sidebar')
      .getByRole('button', { name: 'Collection 1' });

    await expect(collection).toHaveAttribute('aria-pressed', 'true');
    await expect(other).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('selected-canvas')).toContainText('Collection 1');
    await expect(page.getByText('None', { exact: true })).toHaveCount(0);

    await other.click();

    await expect(other).toHaveAttribute('aria-pressed', 'true');
    await expect(collection).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');
  },
);

test(
  'Space Sidebar offers Add Layout as an ordinary command',
  { tag: '@parity:space-sidebar-adds-empty-layout' },
  async ({ page }) => {
    await page.goto('/?story=space--space--add-layout-ready&mode=preview');

    const create = page.getByRole('button', { name: 'Add Layout' });
    await expect(create).toBeEnabled();
    // Add Layout stands beside Add Card rather than in place of it: the new
    // Space already opens on an authored Layout, so both commands are live and
    // the evidence is that Add Layout dispatches its own (ADR 0080).
    await expect(page.getByRole('button', { name: 'Add Card' })).toBeEnabled();
    await create.click();
    await expect(page.locator('body')).toHaveAttribute('data-create-layout', 'requested');
  },
);

test(
  'narrow Space Sidebar offers Add Layout and dismisses the Sheet',
  { tag: '@parity:mobile-space-sidebar-adds-empty-layout' },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?story=space--space--add-layout-ready&mode=preview');
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();

    const create = page.getByRole('button', { name: 'Add Layout' });
    await expect(create).toBeEnabled();
    await create.click();
    await expect(page.locator('body')).toHaveAttribute('data-create-layout', 'requested');
    await expect(page.getByTestId('space-sidebar')).toHaveCount(0);
  },
);

/**
 * The list's keyboard contract is a list of buttons', not a Select's or a
 * Menubar's: Tab reaches each row, Enter activates the row it is on, and no
 * popup opens, dismisses or has focus to return.
 */
test('Space Sidebar story activates a Layout row from the keyboard', async ({ page }) => {
  await page.goto('/?story=space--space--settled&mode=preview');

  const other = page.getByRole('button', { name: 'Collection 2', exact: true });

  await other.focus();
  await page.keyboard.press('Enter');

  await expect(other).toHaveAttribute('aria-pressed', 'true');
  await expect(other).toBeFocused();
  await expect(page.getByTestId('selected-canvas')).toContainText('Collection 2');
});

test(
  'Space chrome shares Layout drafts and keeps blank refusals field-local',
  { tag: '@parity:space-chrome-edits-names' },
  async ({ page }) => {
    await page.goto('/?story=space--space--settled&mode=preview');
    await page.getByRole('button', { name: 'Collection 1', pressed: true }).click();
    const row = page.getByRole('textbox', { name: 'Layout name' });
    await row.fill('Workshop');
    await expect(page.getByTestId('selected-canvas')).toContainText('Workshop');
    await row.fill('');
    await row.press('Enter');
    await expect(page.getByText('A Layout title is required.')).toBeVisible();
    await row.press('Escape');
    await expect(row).toHaveCount(0);

    const storedRow = page.getByRole('button', { name: 'Collection 1', pressed: true });
    await storedRow.click();
    const accepted = page.getByRole('textbox', { name: 'Layout name' });
    await expect(accepted).toBeFocused();
    await expect
      .poll(() =>
        accepted.evaluate((input) =>
          input instanceof HTMLInputElement ? [input.selectionStart, input.selectionEnd] : null,
        ),
      )
      .toEqual([0, 'Collection 1'.length]);
    await accepted.fill('Workshop');
    await accepted.press('Enter');
    await expect(page.getByRole('button', { name: 'Workshop', pressed: true })).toBeVisible();
    await expect(page.getByTestId('selected-canvas')).toContainText('Workshop');
  },
);

test('Space chrome edits the active Graph name', async ({ page }) => {
  await page.goto('/?story=space--space--settled&mode=preview');
  await page.getByRole('button', { name: 'Long', pressed: true }).click();
  const graphName = page.getByRole('textbox', { name: 'Graph name' });
  await graphName.fill('');
  await graphName.press('Enter');
  await expect(page.getByText('A Graph title is required.')).toBeVisible();
  await graphName.fill('Journey');
  await page.getByText('Graphs', { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Journey', pressed: true })).toBeVisible();
});

test('Space Sidebar story keeps the Add Card split control whole', async ({ page }) => {
  await page.goto('/?story=space--space--settled&mode=preview');

  const moreKinds = page.getByRole('button', { name: 'More Card kinds' });
  await moreKinds.click();
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Add Alias' })).toBeHidden();
  await expect(moreKinds).toBeFocused();
});

test(
  'Space Sidebar story dispatches distinct Card and Graph copy commands',
  {
    tag: [
      '@parity:space-sidebar-copies-card-destinations',
      '@parity:space-sidebar-copies-graph-destinations',
    ],
  },
  async ({ page }) => {
    await page.goto('/?story=space--space--settled&mode=preview');

    await page.getByRole('button', { name: 'Copy link to Card 1' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-copy-command', 'card-canonical');
    await page.getByRole('button', { name: 'Copy link in this Layout' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-copy-command', 'card-contextual');
    await page.getByRole('button', { name: 'Copy link to Long', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-copy-command', 'graph-canonical');
    await page.getByRole('button', { name: 'Copy link to Long in this Layout' }).click();
    await expect(page.locator('body')).toHaveAttribute('data-copy-command', 'graph-contextual');
  },
);

/**
 * A newly created Space opens complete: one authored Layout, selected, owning
 * one empty Active Graph (ADR 0018, ADR 0080).
 *
 * The header names the Space itself, and the title is `newSpace()`'s own rather
 * than a word the harness supplies: this story draws the Space ADR 0018
 * describes, so "New space" is the evidence that it is really that Space and not
 * a hand-built stand-in wearing the catalogue's label. `Layout 1` and `Graph 1`
 * are read for the same reason — they are the titles `newSpace()` mints, not
 * ones the story chose.
 */
test(
  'Space Sidebar story shows the complete new-Space starting state',
  { tag: '@parity:space-sidebar-names-unauthored-state' },
  async ({ page }) => {
    await page.goto('/?story=space--space--new-space&mode=preview');

    await expect(
      page.getByTestId('space-sidebar').getByRole('button', { name: 'Layout 1' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('selected-canvas')).toContainText('Layout 1');
    await expect(page.getByTestId('space-title')).toHaveText('New space');
    await expect(page.getByTestId('graph-choice')).toContainText('Graph 1');
    await expect(page.getByTestId('present-button')).toBeDisabled();
  },
);

test(
  'Space Sidebar stories render quiet, retryable, and presenting states',
  {
    tag: [
      '@parity:space-sidebar-recovers-retryable-failure',
      '@parity:space-sidebar-withdraws-authoring-while-presenting',
    ],
  },
  async ({ page }) => {
    await page.goto('/?story=space--space--settled&mode=preview');
    await expect(
      page.getByTestId('space-sidebar').getByRole('button', { name: 'Collection 1' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Changes saved' })).toBeHidden();

    await page.goto('/?story=space--messaging--save-failed&mode=preview');
    // Two surfaces for one condition: a red dot beside the Space title, and the
    // notice pinned under the canvas header carrying
    // reason and action.
    await expect(page.getByRole('button', { name: 'Changes not saved' })).toBeVisible();
    const failure = page.getByTestId('persistence-failure');
    await expect(failure).toContainText('Network unavailable');
    // The claim this story owns: a failed save keeps the unsaved work on screen.
    // `Collection 3` is in the snapshot the session submitted and in no revision
    // the backend has stored, so a sidebar drawing anything but its own session's
    // working Space cannot show it.
    const unsaved = page.getByRole('button', { name: 'Collection 3' });
    await expect(unsaved).toBeVisible();
    const retry = failure.getByRole('button', { name: 'Retry' });
    await retry.click();
    await expect(failure).toBeHidden();
    await expect(page.getByRole('button', { name: 'Changes not saved' })).toBeHidden();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute(
      'data-persistence-state',
      'settled',
    );
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
    // And the retry saves that same work rather than replacing it.
    await expect(unsaved).toBeVisible();

    await page.goto('/?story=space--space--presenting&mode=preview');
    await expect(page.getByTestId('exit-presenting-button')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Card' })).toBeDisabled();
  },
);

/**
 * Application pairs:
 * - `canvas-projection.test.ts`: "draws every Graph a selected Layout owns"
 * - `navigation.test.ts`: "selects a renderer and its active Graph without changing the Space"
 * - `navigation.test.ts`: "activating a Graph ends the current Traversal history without changing the Space"
 * - `navigation.test.ts`: "leaves no Traversal history behind when presenting ends"
 */
test('Space Sidebar story draws and activates only the selected Layout graphs', async ({
  page,
}) => {
  await page.goto('/?story=space--space--settled&mode=preview');

  await expect(page.getByRole('button', { name: 'Long', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mid', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Short', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Echo', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mid', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mid', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Collection 2' }).click();

  await expect(page.getByRole('button', { name: 'Echo', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Long', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Present' }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('button', { name: 'Present' })).toBeVisible();
});

test(
  'Space Sidebar stories render production conflict and rejection recovery',
  {
    tag: [
      '@parity:space-sidebar-reports-permanent-rejection',
      '@parity:space-sidebar-resolves-conflict',
    ],
  },
  async ({ page }) => {
    await page.goto('/?story=space--messaging--save-conflict&mode=preview');

    await expect(page.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep local and retry' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByTestId('persistence-remote-refused')).toContainText(
      'The remote space is invalid and was not accepted.',
    );

    await page.goto('/?story=space--messaging--save-rejected&mode=preview');
    await expect(
      page.getByRole('alertdialog', { name: 'Changes couldn’t be saved' }),
    ).toBeVisible();
    await expect(page.getByText('Permission denied')).toBeVisible();
    await page.getByRole('button', { name: 'Continue editing' }).click();
    await expect(page.getByRole('button', { name: 'Persistence rejected' })).toBeVisible();
  },
);

/**
 * The Sidebar's desktop container is `fixed`, so every one of these stories is
 * framed — a modal's focus trap is only the loudest reason. Proven by clicking
 * real catalogue navigation while the story owns its own viewport.
 */
test('Space Sidebar stories are isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=space--messaging--save-conflict');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.getByRole('alertdialog', { name: 'Changes conflict' })).toBeVisible();

  const storySearch = page.getByLabel('Search stories');
  await storySearch.fill('Persistence Indicator');
  await expect(storySearch).toHaveValue('Persistence Indicator');
  await page.getByRole('link', { name: 'Lifecycle' }).click();
  await expect(page).toHaveURL(/story=components--persistence-indicator--lifecycle/);

  await page.goto('/?story=space--space--settled');
  await expect(page.frameLocator('iframe').getByTestId('space-sidebar')).toBeVisible();
  await expect(page.getByLabel('Search stories')).toBeVisible();
});
