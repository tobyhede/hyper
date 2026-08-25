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
  const titleInset = async (card: typeof compact, title: typeof compactTitle) => {
    const cardBox = await card.getByRole('article', { name: 'Strategies' }).boundingBox();
    const titleBox = await title.boundingBox();
    if (cardBox === null || titleBox === null)
      throw new Error('Card title geometry is unavailable');
    return {
      left: titleBox.x - cardBox.x,
      bottom: cardBox.y + cardBox.height - (titleBox.y + titleBox.height),
    };
  };
  expect(await titleInset(expanded, expandedTitle)).toEqual(
    await titleInset(compact, compactTitle),
  );
  await expect(
    expanded.getByRole('heading', { name: 'Placement is authored' }).first(),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Long Expanded Card' })).toBeVisible();
});

test('the Expanded Card rail offers its edit action before Close', async ({ page }) => {
  await open(page, markdownStory);
  const card = page.getByRole('article', { name: 'Strategies' });
  const edit = card.getByRole('button', { name: 'Edit Card Strategies' });

  await card.hover();
  await expect(edit).toBeVisible();
  const labels = await card
    .getByTestId('canvas-card-actions')
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(labels[0]).toBe('Edit Card Strategies');
  await edit.focus();
  await edit.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
});

test('the Markdown panel remains an icon-free click-to-edit target', async ({ page }) => {
  await open(page, markdownStory);
  const panel = page.getByRole('button', { name: 'Edit Markdown source of Strategies' });

  await expect(panel.locator('svg')).toHaveCount(0);
  await panel.click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
});

test('the rail replaces its Edit action with the two ends of a running edit', async ({ page }) => {
  await open(page, markdownStory);
  const card = page.getByRole('article', { name: 'Strategies' });
  const actions = card.getByTestId('canvas-card-actions');
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();

  expect(
    await actions
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(['Save Card Strategies', 'Cancel editing Card Strategies', 'Close Card Strategies']);
  await expect(card.getByRole('button', { name: 'Edit Card Strategies' })).toHaveCount(0);
  // Closing mid-edit would drop the Card's box out from under a live caret, so
  // the control keeps its slot and says it is unavailable.
  await expect(card.getByRole('button', { name: 'Close Card Strategies' })).toBeDisabled();
  // Three controls, one treatment: a commit control with its own box or its own
  // type would read as a different kind of thing to the Close button beside it.
  const boxes = await actions.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const style = getComputedStyle(button);
      return { width: style.width, height: style.height, border: style.borderTopWidth };
    }),
  );
  expect(boxes[0]).toEqual(boxes[2]);
  expect(boxes[1]).toEqual(boxes[2]);
  // The rail hides its actions at rest and reveals them with the Card. A running
  // edit is not a hover, so the way out has to be up without one.
  await expect(actions).toHaveCSS('opacity', '1');
});

test('a Card running an edit is not drawn at rest, however it is left', async ({ page }) => {
  await open(page, markdownStory);
  const card = page.getByRole('article', { name: 'Strategies' });
  const rail = card.locator('.card-rail');
  const quiet = 'rgba(0, 0, 0, 0)';

  await page.mouse.move(0, 0);
  await expect(rail).toHaveCSS('background-color', quiet);

  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
  // Nothing is hovering the Card, the caret is in its body rather than on its
  // rail, and a blur ends nothing — so without this the band and the kind glyph
  // would quiet down and leave Save, Cancel and Close lit on top of nothing.
  await page.mouse.move(0, 0);
  await expect(rail).not.toHaveCSS('background-color', quiet);
  await expect(card.getByTestId('canvas-card-actions')).toHaveCSS('opacity', '1');

  await card.getByRole('button', { name: 'Cancel editing Card Strategies' }).click();
  await page.mouse.move(0, 0);
  await expect(rail).toHaveCSS('background-color', quiet);
});

test('the two ends are the only way out, and a press on one keeps the caret', async ({ page }) => {
  await open(page, markdownStory);
  const card = page.getByRole('article', { name: 'Strategies' });
  const editor = page.getByRole('textbox', { name: 'Markdown source of Strategies' });

  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await editor.pressSequentially('Abandoned. ');
  // Clicking away is not an exit: the draft is still there and the editor is
  // still up. Four exits and no more — two keys and the two controls.
  await page.getByRole('heading', { name: 'Strategies', exact: true }).click();
  await expect(editor).toHaveCount(1);
  await expect(editor).toContainText('Abandoned.');

  await card.getByRole('button', { name: 'Cancel editing Card Strategies' }).click();
  await expect(editor).toHaveCount(0);
  await expect(card).not.toContainText('Abandoned.');

  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await editor.pressSequentially('Kept. ');
  await card.getByRole('button', { name: 'Save Card Strategies' }).click();
  await expect(editor).toHaveCount(0);
  await expect(card).toContainText('Kept.');
});

test('the body editor shows its shortcut hint only with actual focus', async ({ page }) => {
  await open(page, markdownStory);
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown source of Strategies' });
  // Located by its own element, not its copy: the keys are drawn by the shared
  // `Kbd` primitive, so the hint is several nodes and the text between them is
  // the design system's to change.
  const hint = page.locator('.markdown-card-body__shortcut-hint');
  const pairs = hint.locator('.markdown-card-body__shortcut');
  await expect(pairs).toHaveCount(2);
  await expect(pairs.first()).toContainText('Save');
  await expect(pairs.last()).toContainText('Cancel');
  await expect(editor).toBeFocused();
  await expect(hint).toHaveCSS('opacity', '1');
  const caps = hint.locator('[data-slot="kbd"]');
  await expect(caps).toHaveCount(3);
  // A cap is an object, not set-back type: it is outlined, and outlined only —
  // no fill on the cap and no panel behind the line, both of which read as grey
  // boxes floated over the document rather than as keys named beside it.
  const drawn = await hint.evaluate((element) => {
    const cap = element.querySelector('[data-slot="kbd"]');
    if (cap === null) throw new Error('missing key cap');
    return {
      capBorder: getComputedStyle(cap).borderTopWidth,
      capFill: getComputedStyle(cap).backgroundColor,
      panel: getComputedStyle(element).backgroundColor,
    };
  });
  expect(Number.parseFloat(drawn.capBorder)).toBeGreaterThan(0);
  expect(drawn.capFill).toBe('rgba(0, 0, 0, 0)');
  expect(drawn.panel).toBe('rgba(0, 0, 0, 0)');

  // Each key is drawn as a cap — its own bordered, filled box — rather than as
  // glyphs set into the muted line, which is what made this legible. And the
  // grouping is a gap rule: a cap sits close to its own word, the two pairs
  // further apart, so the line reads as two things rather than one run.
  const gaps = await hint.evaluate((element) => {
    const pair = element.querySelector('.markdown-card-body__shortcut');
    if (pair === null) throw new Error('missing shortcut pair');
    return {
      betweenPairs: getComputedStyle(element).columnGap,
      withinPair: getComputedStyle(pair).columnGap,
    };
  });
  expect(Number.parseFloat(gaps.betweenPairs)).toBeGreaterThan(Number.parseFloat(gaps.withinPair));

  await editor.press('Escape');
  await expect(page.getByRole('heading', { name: 'Placement is authored' })).toBeVisible();
  const unfocused = page.getByRole('button', { name: 'Unfocused edit' });
  await unfocused.click();
  await expect(unfocused).toBeFocused();
  await expect(hint).toHaveCSS('opacity', '0');
});

test('rendered and source modes keep one content column', async ({ page }) => {
  await open(page, markdownStory);
  const renderedBox = await page
    .getByRole('heading', { name: 'Placement is authored' })
    .boundingBox();
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  const firstLine = page.locator('.cm-line').first();
  await expect(firstLine).toBeVisible();
  const sourceBox = await firstLine.boundingBox();
  expect(sourceBox?.x).toBeCloseTo(renderedBox?.x ?? 0, 0);
  expect(sourceBox?.y).toBeCloseTo(renderedBox?.y ?? 0, 0);
});
