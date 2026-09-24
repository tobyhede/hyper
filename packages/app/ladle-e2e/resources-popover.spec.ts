import { expect, test } from '@playwright/test';

const STORY = '/?story=surfaces--resources-popover--available-resources&mode=preview';
const story = (name: string) => `/?story=surfaces--resources-popover--${name}&mode=preview`;

test(
  'Resources list draws a row per Resource and narrows the available Resources',
  { tag: '@parity:resources-popover-adds-existing-map-members' },
  async ({ page }) => {
    await page.goto(STORY);

    await page.getByRole('button', { name: 'Resources' }).click();
    await expect(page.getByRole('dialog', { name: 'Resources' })).toBeVisible();

    await expect(page.getByRole('button', { name: /^Add .* to Map$/ })).toHaveCount(5);
    await expect(page.locator('.react-flow__handle')).toHaveCount(0);

    // Every kind starts shown, so narrowing to Reference Resources means pressing the
    // other three off rather than choosing one. Each names the count it is
    // contributing, which is what the glyph alone could not say.
    for (const name of [
      /^Markdown Resources, \d+$/,
      /^Space Resources in this Space, \d+$/,
      /^Spaces in this Meta Space, \d+$/,
    ]) {
      const toggle = page.getByRole('button', { name });
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await toggle.click();
    }
    await expect(page.getByRole('button', { name: 'Add Constraints to Map' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Architecture to Map' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Search resources' }).fill('missing');
    await expect(page.getByText('No matching Resources.')).toBeVisible();
  },
);

test(
  'Resources list offers the Meta Space’s Spaces beside the Resources, and the toggle takes them away',
  { tag: '@parity:resources-popover-offers-the-meta-spaces-beside-the-resources' },
  async ({ page }) => {
    await page.goto(story('meta-spaces'));
    await page.getByRole('button', { name: 'Resources' }).click();

    // Interleaved by name rather than sectioned by source: the reader is
    // looking for a name, and the glyph on each row says which it is.
    await expect(page.getByRole('button', { name: /^Add .* to Map$/ })).toHaveCount(7);
    const spaceRow = page.getByRole('button', { name: 'Add Blueprint to Map' });
    await expect(spaceRow).toHaveAttribute('data-space-id', /.+/);

    await expect(spaceRow.locator('[data-icon="space"]')).toBeVisible();
    await expect(
      page
        .getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ })
        .locator('[data-icon="parent"]'),
    ).toBeVisible();
    await expect(
      page
        .getByRole('button', { name: /^Space Resources in this Space, \d+$/ })
        .locator('[data-icon="space"]'),
    ).toBeVisible();

    await spaceRow.click();
    await expect(page.getByText('Added: Blueprint')).toBeVisible();

    await page.getByRole('button', { name: /^Spaces in this Meta Space, \d+$/ }).click();
    await expect(page.getByRole('button', { name: 'Add Yardstick to Map' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Architecture to Map' })).toBeVisible();
  },
);

test(
  'a Space row drags onto the canvas as a Resource row does, and the list stays open',
  { tag: '@parity:resources-popover-drags-a-space-onto-the-canvas' },
  async ({ page }) => {
    await page.goto(story('meta-spaces'));
    await page.getByRole('button', { name: 'Resources' }).click();

    const spaceRow = page.getByRole('button', { name: 'Add Blueprint to Map' });
    await expect(spaceRow).toHaveAttribute('draggable', 'true');
    await expect(spaceRow.locator('.resources-popover__row-grip')).toBeAttached();
    await expect(spaceRow).toHaveAttribute('title', /or drag it onto the canvas$/);

    await spaceRow.dragTo(page.getByRole('button', { name: 'The canvas behind it' }));

    await expect(page.getByText('Added: Blueprint')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Resources' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  },
);

test(
  'the filter counts what each switch contributes under the current search',
  { tag: '@parity:resources-popover-counts-what-each-filter-contributes' },
  async ({ page }) => {
    await page.goto(STORY);
    await page.getByRole('button', { name: 'Resources' }).click();

    await expect(page.getByRole('button', { name: 'Markdown Resources, 3' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Search resources' }).fill('arch');

    // The count answers the search, not the Space. A number beside a name that
    // disagrees with the rows under it is worse than no number.
    await expect(page.getByRole('button', { name: 'Markdown Resources, 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reference Resources, 0' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Add .* to Map$/ })).toHaveCount(1);
  },
);

test(
  'Resources list names an empty Map',
  { tag: '@parity:resources-popover-distinguishes-an-empty-map' },
  async ({ page }) => {
    await page.goto(story('empty'));
    await page.getByRole('button', { name: 'Resources' }).click();
    await expect(page.getByText('All Resources are in this Map.')).toBeVisible();
  },
);

test(
  'Resources list keeps a long list searchable and scrollable on a narrow screen',
  { tag: '@parity:resources-popover-scrolls-a-long-list-on-a-narrow-screen' },
  async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 360 });
    await page.goto(story('long-list'));
    await page.getByRole('button', { name: 'Resources' }).click();

    await expect(page.getByRole('textbox', { name: 'Search resources' })).toBeVisible();
    const list = page.locator('.resources-popover__list');
    expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
  },
);

test(
  'Resources list trigger is disabled while authoring is unavailable',
  { tag: '@parity:resources-popover-withdraws-while-authoring-is-unavailable' },
  async ({ page }) => {
    await page.goto(story('disabled'));
    await expect(page.getByRole('button', { name: 'Resources' })).toBeDisabled();
  },
);

test(
  'a keyboard Add keeps the reader in the list, on the filter',
  { tag: '@parity:resources-popover-keeps-the-reader-in-the-list-after-a-keyboard-add' },
  async ({ page }) => {
    await page.goto(STORY);
    await page.getByRole('button', { name: 'Resources' }).click();

    const row = page.getByRole('button', { name: 'Add Architecture to Map' });
    await row.focus();
    await row.press('Enter');

    // Activating a row unmounts it, and a popover has no roving list to hand
    // the caret on to — so the surface puts it back in the filter, which is
    // where a reader adding several Resources is going next. The row going is
    // asserted first: it is the premise the focus claim rests on, and a
    // fixture where the row stayed would pass the second line while proving
    // nothing about the first.
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Search resources' })).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Resources' })).toBeVisible();
  },
);

test(
  'Resources list keeps an Add refusal on its own surface',
  { tag: '@parity:resources-popover-keeps-an-add-refusal-on-its-surface' },
  async ({ page }) => {
    await page.goto(story('refused'));
    await page.getByRole('button', { name: 'Resources' }).click();
    await page.getByRole('button', { name: 'Add Resource 3 to Map' }).evaluate((button) => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await expect(page.getByRole('alert')).toContainText('This Resource is already in this Map.');
  },
);

test(
  'Resources list remains available beside a retryable persistence failure',
  { tag: '@parity:resources-popover-coexists-with-persistence-failure' },
  async ({ page }) => {
    await page.goto(story('persistence-failure'));
    const notice = page.getByTestId('persistence-failure');
    await expect(notice).toContainText('Your device could not reach the server.');
    await page.getByRole('button', { name: 'Resources' }).click();
    await expect(page.getByRole('dialog', { name: 'Resources' })).toBeVisible();
  },
);

test(
  'Resources list opens, dismisses on Escape, and leaves the surface behind it live',
  { tag: '@parity:resources-popover-opens-and-dismisses-without-locking-the-canvas' },
  async ({ page }) => {
    await page.goto(STORY);

    const trigger = page.getByRole('button', { name: 'Resources' });
    const behind = page.getByRole('button', { name: 'The canvas behind it' });
    const list = page.getByRole('dialog', { name: 'Resources' });

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
    // dismiss the list — dropping a Resource is exactly that press, and declining
    // that dismissal is the comparison's own reason for this surface.
    await trigger.click();
    await expect(list).toBeVisible();
    await behind.click();
    await expect(page.getByText('Added: canvas')).toBeVisible();
    await expect(list).toBeVisible();
  },
);
