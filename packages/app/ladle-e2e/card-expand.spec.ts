import { expect, test, type Page } from '@playwright/test';

const expandStory = '/?story=review--card--expand&mode=preview';
const markdownStory = '/?story=review--card--editing--markdown&mode=preview';

const open = async (page: Page, story: string): Promise<void> => {
  await page.goto(story);
  await expect(page.getByRole('article', { name: 'Strategies' }).first()).toBeVisible({
    timeout: 20_000,
  });
};

test('compact and Expanded Cards retain one Title treatment', async ({ page }) => {
  await open(page, expandStory);
  const compact = page.getByRole('region', { name: 'Compact Card' });
  const expanded = page.getByRole('region', { name: 'Expanded Card' });
  const compactTitle = compact.getByRole('heading', { name: 'Strategies' });
  const expandedTitle = expanded.getByRole('heading', { name: 'Strategies' });

  await expect(expandedTitle).toHaveAttribute(
    'class',
    (await compactTitle.getAttribute('class')) ?? '',
  );
  const titleStyle = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    return {
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      paddingInline: style.paddingInline,
    };
  };
  expect(await expandedTitle.evaluate(titleStyle)).toEqual(await compactTitle.evaluate(titleStyle));
  await expect(
    expanded.getByRole('heading', { name: 'Placement is authored' }).first(),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Long Expanded Card' })).toBeVisible();
});

test('the rendered Markdown surface discloses one edit target to pointer and keyboard', async ({
  page,
}) => {
  await open(page, markdownStory);
  const edit = page.getByRole('button', { name: 'Edit Markdown source of Strategies' });
  const pencil = edit.locator('svg');

  await expect(pencil).toHaveCSS('opacity', '0');
  await edit.hover();
  await expect(pencil).not.toHaveCSS('opacity', '0');
  await edit.focus();
  await expect(pencil).not.toHaveCSS('opacity', '0');
  await edit.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
});

test('the body editor shows its shortcut hint only with actual focus', async ({ page }) => {
  await open(page, markdownStory);
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown source of Strategies' });
  // Located by its own element, not its copy: the keys are drawn by the shared
  // `Kbd` primitive, so the hint is several nodes and the text between them is
  // the design system's to change.
  const hint = page.locator('.markdown-card-body__shortcut-hint');
  await expect(hint).toContainText('Save');
  await expect(hint).toContainText('Cancel');
  await expect(editor).toBeFocused();
  await expect(hint).not.toHaveCSS('opacity', '0');

  await editor.press('Escape');
  await expect(page.getByRole('heading', { name: 'Placement is authored' })).toBeVisible();
  const unfocused = page.getByRole('button', { name: 'Unfocused edit' });
  await unfocused.click();
  await expect(unfocused).toBeFocused();
  await expect(hint).toHaveCSS('opacity', '0');
});

test('rendered and source modes keep one content column', async ({ page }) => {
  await open(page, markdownStory);
  const renderedLeft = (
    await page.getByRole('heading', { name: 'Placement is authored' }).boundingBox()
  )?.x;
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  const firstLine = page.locator('.cm-line').first();
  await expect(firstLine).toBeVisible();
  expect((await firstLine.boundingBox())?.x).toBeCloseTo(renderedLeft ?? 0, 0);
});
