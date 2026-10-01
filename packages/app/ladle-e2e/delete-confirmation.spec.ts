import { expect, test, type Locator, type Page } from '@playwright/test';

const story = (name: string): string =>
  `/?story=components--delete-confirmation--${name}&mode=preview`;

/**
 * The question the story asks as it opens, answered with Cancel, then asked
 * again from its command and cancelled with the caret back on that command.
 */
const cancelsAndAsksAgain = async (
  page: Page,
  question: Locator,
  command: string,
): Promise<void> => {
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).toHaveCount(0);

  const asks = page.getByRole('button', { name: command, exact: true });
  await asks.click();
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Cancel' }).click();
  await expect(question).toHaveCount(0);
  await expect(asks).toBeFocused();
};

test(
  'Delete Map asks what the Map takes with it and what stays',
  { tag: '@parity:delete-confirmation-asks-before-deleting-a-map' },
  async ({ page }) => {
    await page.goto(story('map'));
    const question = page.getByRole('alertdialog', { name: 'Delete Collection 1 From Space?' });
    await expect(question).toBeVisible();
    await expect(question).toContainText(
      'Permanently deletes the Map, and all Graphs from the Space.\nResources are not deleted.',
    );
    await cancelsAndAsksAgain(page, question, 'Delete Collection 1');
  },
);

test(
  'Delete Graph asks by the Graph and the Map it is deleted from',
  { tag: '@parity:delete-confirmation-asks-before-deleting-a-graph' },
  async ({ page }) => {
    await page.goto(story('graph'));
    const question = page.getByRole('alertdialog', { name: 'Delete Long From Collection 1?' });
    await expect(question).toBeVisible();
    await expect(question).toContainText(
      'Permanently deletes the Graph and all Edges from the Map.',
    );
    await cancelsAndAsksAgain(page, question, 'Delete Long');
  },
);

test(
  'Delete Edge asks by the Edge’s two ends when it has no Title',
  { tag: '@parity:delete-confirmation-asks-before-deleting-an-edge' },
  async ({ page }) => {
    await page.goto(story('edge'));
    const question = page.getByRole('alertdialog', { name: /^Delete Edge Opening → Why .+\?$/ });
    await expect(question).toBeVisible();
    await expect(question).toContainText('Permanently deletes the Edge from the Graph.');
    await cancelsAndAsksAgain(page, question, 'Delete Edge');
  },
);

test(
  'Delete from Space lists the Maps and Graphs a Resource’s deletion reaches',
  { tag: '@parity:delete-confirmation-lists-what-a-resource-deletion-reaches' },
  async ({ page }) => {
    await page.goto(story('resource'));
    const question = page.getByRole('alertdialog', { name: 'Delete Opening From Space?' });
    await expect(question).toContainText(
      'Permanently deletes the Resource from the Space and all Maps and Graphs.',
    );
    const reach = question.getByRole('list', { name: 'Maps and Graphs' });
    await expect(reach.locator(':scope > li')).toHaveCount(2);
    await expect(
      reach.getByRole('list', { name: 'Collection 1' }).getByRole('listitem'),
    ).toHaveText(['Long', 'Mid', 'Short']);
    await expect(
      reach.getByRole('list', { name: 'Collection 2' }).getByRole('listitem'),
    ).toHaveText(['Echo']);
    await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await cancelsAndAsksAgain(page, question, 'Delete Opening from Space');
  },
);

test(
  'Delete from Space warns that a Space Resource can take its Space with it',
  { tag: '@parity:delete-confirmation-warns-a-space-resource-reaches-its-space' },
  async ({ page }) => {
    await page.goto(story('space-resource'));
    const question = page.getByRole('alertdialog', { name: 'Delete Design system From Space?' });
    await expect(question).toContainText(
      'If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.',
    );
    await cancelsAndAsksAgain(page, question, 'Delete Design system from Space');
  },
);

test('a reach taller than the viewport scrolls inside the question, which keeps its answers in view', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 320 });
  await page.goto(story('resource'));
  const question = page.getByRole('alertdialog', { name: 'Delete Opening From Space?' });
  await expect(question.getByRole('button', { name: 'Delete', exact: true })).toBeInViewport();
  await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();

  const reach = question.getByRole('region', { name: 'What the deletion reaches' });
  expect(await reach.evaluate((region) => region.scrollHeight > region.clientHeight)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(reach).toBeFocused();
  await page.keyboard.press('End');
  await expect.poll(() => reach.evaluate((region) => region.scrollTop)).toBeGreaterThan(0);
  await expect(reach.getByRole('list', { name: 'Collection 2' })).toBeInViewport();
});
