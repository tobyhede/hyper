import { expect, test } from '@playwright/test';

const STORY = '/?story=surfaces--things-popover--available-things&mode=preview';
const story = (name: string) => `/?story=surfaces--things-popover--${name}&mode=preview`;

test(
  'Things list draws a row per Thing and narrows the available Things',
  { tag: '@parity:things-popover-adds-existing-diagram-members' },
  async ({ page }) => {
    await page.goto(STORY);

    await page.getByRole('button', { name: 'Things' }).click();
    await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();

    await expect(page.getByRole('button', { name: /^Add .* to Diagram$/ })).toHaveCount(5);
    await expect(page.locator('.react-flow__handle')).toHaveCount(0);

    // Every kind starts shown, so narrowing to Aliases means pressing the
    // other three off rather than choosing one. Each names the count it is
    // contributing, which is what the glyph alone could not say.
    for (const name of [
      /^Markdown Things, \d+$/,
      /^Space Things in this Space, \d+$/,
      /^Spaces in this Meta Space, \d+$/,
    ]) {
      const toggle = page.getByRole('button', { name });
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await toggle.click();
    }
    await expect(page.getByRole('button', { name: 'Add Constraints to Diagram' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Architecture to Diagram' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Search things' }).fill('missing');
    await expect(page.getByText('No matching Things.')).toBeVisible();
  },
);

test(
  'Things list offers the Meta Space’s Spaces beside the Things, and the toggle takes them away',
  { tag: '@parity:things-popover-offers-the-meta-spaces-beside-the-things' },
  async ({ page }) => {
    await page.goto(story('meta-spaces'));
    await page.getByRole('button', { name: 'Things' }).click();

    // Interleaved by name rather than sectioned by source: the reader is
    // looking for a name, and the glyph on each row says which it is.
    await expect(page.getByRole('button', { name: /^Add .* to Diagram$/ })).toHaveCount(7);
    const spaceRow = page.getByRole('button', { name: 'Add Blueprint to Diagram' });
    await expect(spaceRow).toHaveAttribute('data-space-id', /.+/);

    await spaceRow.click();
    await expect(page.getByText('Added: Blueprint')).toBeVisible();

    await page.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }).click();
    await expect(page.getByRole('button', { name: 'Add Yardstick to Diagram' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Architecture to Diagram' })).toBeVisible();
  },
);

test(
  'the filter counts what each switch contributes under the current search',
  { tag: '@parity:things-popover-counts-what-each-filter-contributes' },
  async ({ page }) => {
    await page.goto(STORY);
    await page.getByRole('button', { name: 'Things' }).click();

    await expect(page.getByRole('button', { name: 'Markdown Things, 3' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Search things' }).fill('arch');

    // The count answers the search, not the Space. A number beside a name that
    // disagrees with the rows under it is worse than no number.
    await expect(page.getByRole('button', { name: 'Markdown Things, 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aliases, 0' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add .* to Diagram$/ })).toHaveCount(1);
  },
);

test(
  'Things list names an empty Diagram',
  { tag: '@parity:things-popover-distinguishes-an-empty-diagram' },
  async ({ page }) => {
    await page.goto(story('empty'));
    await page.getByRole('button', { name: 'Things' }).click();
    await expect(page.getByText('All Things are in this Diagram.')).toBeVisible();
  },
);

test(
  'Things list keeps a long list searchable and scrollable on a narrow screen',
  { tag: '@parity:things-popover-scrolls-a-long-list-on-a-narrow-screen' },
  async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 360 });
    await page.goto(story('long-list'));
    await page.getByRole('button', { name: 'Things' }).click();

    await expect(page.getByRole('textbox', { name: 'Search things' })).toBeVisible();
    const list = page.locator('.things-popover__list');
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
  },
);

test(
  'Things list trigger is disabled while authoring is unavailable',
  { tag: '@parity:things-popover-withdraws-while-authoring-is-unavailable' },
  async ({ page }) => {
    await page.goto(story('disabled'));
    await expect(page.getByRole('button', { name: 'Things' })).toBeDisabled();
  },
);

test(
  'a keyboard Add keeps the reader in the list, on the filter',
  { tag: '@parity:things-popover-keeps-the-reader-in-the-list-after-a-keyboard-add' },
  async ({ page }) => {
    await page.goto(STORY);
    await page.getByRole('button', { name: 'Things' }).click();

    const row = page.getByRole('button', { name: 'Add Architecture to Diagram' });
    await row.focus();
    await row.press('Enter');

    // Activating a row unmounts it, and a popover has no roving list to hand
    // the caret on to — so the surface puts it back in the filter, which is
    // where a reader adding several Things is going next. The row going is
    // asserted first: it is the premise the focus claim rests on, and a
    // fixture where the row stayed would pass the second line while proving
    // nothing about the first.
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Search things' })).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Things' })).toBeVisible();
  },
);

test(
  'Things list keeps an Add refusal on its own surface',
  { tag: '@parity:things-popover-keeps-an-add-refusal-on-its-surface' },
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
  'Things list remains available beside a retryable persistence failure',
  { tag: '@parity:things-popover-coexists-with-persistence-failure' },
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
  'Things list opens, dismisses on Escape, and leaves the surface behind it live',
  { tag: '@parity:things-popover-opens-and-dismisses-without-locking-the-canvas' },
  async ({ page }) => {
    await page.goto(STORY);

    const trigger = page.getByRole('button', { name: 'Things' });
    const behind = page.getByRole('button', { name: 'The canvas behind it' });
    const list = page.getByRole('dialog', { name: 'Things' });

    await expect(list).toHaveCount(0);
    await trigger.click();
    await expect(list).toBeVisible();

    // Escape from inside the list hands focus back to the control that opened
    // it, rather than dropping it on the document.
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // The viewport spans the screen so the popup can sit against the edge. A
    // press on the canvas must reach the canvas, not the viewport, and must not
    // dismiss the list — dropping a Thing is exactly that press, and declining
    // that dismissal is the comparison's own reason for this surface.
    await trigger.click();
    await expect(list).toBeVisible();
    await behind.click();
    await expect(page.getByText('Added: canvas')).toBeVisible();
    await expect(list).toBeVisible();
  },
);
