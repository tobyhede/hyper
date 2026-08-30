import { expect, test, type Page } from '@playwright/test';

const openCloseStory = '/?story=components--card--open-and-close&mode=preview';
const markdownStory = '/?story=components--card--editing--markdown&mode=preview';
const resizeControlStory = '/?story=components--card--resize-control&mode=preview';

const open = async (page: Page, story: string): Promise<void> => {
  await page.goto(story);
  await expect(page.getByRole('article', { name: 'Strategies' }).first()).toBeVisible({
    timeout: 20_000,
  });
};

test(
  'Open and Close retain one Card and Title treatment',
  { tag: '@parity:markdown-card-opens-and-closes-in-place' },
  async ({ page }) => {
    await open(page, openCloseStory);
    const specimen = page.getByRole('region', { name: 'Interactive Card' });
    const card = specimen.getByRole('article', { name: 'Strategies' });
    const handles = specimen.locator('.rf-card-node__authoring-handle');
    await expect(handles).toHaveCount(8);
    const title = card.getByRole('heading', { name: 'Strategies' });
    const closedClass = await title.getAttribute('class');
    const titleStyle = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        paddingInline: style.paddingInline,
      };
    };
    const closedStyle = await title.evaluate(titleStyle);
    const titleLeftInset = async () => {
      const cardBox = await card.boundingBox();
      const titleBox = await title.boundingBox();
      if (cardBox === null || titleBox === null)
        throw new Error('Card title geometry is unavailable');
      return titleBox.x - cardBox.x;
    };
    const closedInset = await titleLeftInset();
    const titleBottomInset = async () => {
      const cardBox = await card.boundingBox();
      const titleBox = await title.boundingBox();
      if (cardBox === null || titleBox === null)
        throw new Error('Card title geometry is unavailable');
      return cardBox.y + cardBox.height - (titleBox.y + titleBox.height);
    };

    await card.hover();
    await expect(specimen.locator('.rf-card-node__authoring-handle--source').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await card.getByRole('button', { name: 'Open Card Strategies' }).click();
    await expect(card.getByRole('heading', { name: 'Placement is authored' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Close Card Strategies' })).toBeVisible();
    await expect(title).toHaveAttribute('class', closedClass ?? '');
    expect(await title.evaluate(titleStyle)).toEqual(closedStyle);
    expect(await titleLeftInset()).toBeCloseTo(closedInset, 0);
    const openContent = card.locator('.canvas-card__content');
    await expect(openContent).toHaveAttribute('data-presence', 'present');
    await expect(openContent).toHaveCSS('opacity', '1');
    const openBottomInset = await titleBottomInset();

    const transitionDuration = (element: Element, property: string) => {
      const style = getComputedStyle(element);
      const properties = style.transitionProperty.split(',').map((value) => value.trim());
      const durations = style.transitionDuration.split(',').map((value) => value.trim());
      const index = properties.indexOf(property);
      const duration = durations[index] ?? durations[0];
      if (duration === undefined) return null;
      return duration.endsWith('ms')
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1000;
    };
    const closingSnapshot = await card
      .getByRole('button', { name: 'Close Card Strategies' })
      .evaluate((button, duration) => {
        const startedAt = performance.now();
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        const element = button.closest<HTMLElement>('.canvas-card');
        if (element === null) throw new Error('Closing Card is unavailable');
        const content = element.querySelector<HTMLElement>('.canvas-card__content');
        const titleElement = element.querySelector<HTMLElement>('.canvas-card__title');
        if (content === null || titleElement === null)
          throw new Error('Closing Card content or Title is unavailable');
        return new Promise<{
          contentDuration: number | string | CSSNumericValue | null;
          contentInert: boolean;
          contentPresence: string | undefined;
          contentTransitionRunning: boolean;
          expanded: string | undefined;
          titleBottomInsets: number[];
        }>((resolve) => {
          const titleBottomInsets: number[] = [];
          let firstFrame:
            | {
                contentDuration: number | string | CSSNumericValue | null;
                contentInert: boolean;
                contentPresence: string | undefined;
                contentTransitionRunning: boolean;
                expanded: string | undefined;
              }
            | undefined;
          const sample = (now: number) => {
            const cardBox = element.getBoundingClientRect();
            const titleBox = titleElement.getBoundingClientRect();
            titleBottomInsets.push(cardBox.bottom - titleBox.bottom);
            if (firstFrame === undefined) {
              const opacityTransition = content.getAnimations().find((animation) => {
                if (!(animation.effect instanceof KeyframeEffect)) return false;
                return animation.effect
                  .getKeyframes()
                  .some((frame) => frame['opacity'] !== undefined);
              });
              firstFrame = {
                contentDuration: opacityTransition?.effect?.getTiming().duration ?? null,
                contentInert: content.hasAttribute('inert'),
                contentPresence: content.dataset['presence'],
                contentTransitionRunning: opacityTransition?.playState === 'running',
                expanded: element.dataset['expanded'],
              };
            }
            if (now - startedAt < duration) requestAnimationFrame(sample);
            else resolve({ ...firstFrame, titleBottomInsets });
          };
          requestAnimationFrame(sample);
        });
      }, 220);
    expect(closingSnapshot.contentDuration).toBeCloseTo(80, 5);
    expect(closingSnapshot.contentInert).toBe(true);
    expect(closingSnapshot.contentPresence).toBe('leaving');
    expect(closingSnapshot.contentTransitionRunning).toBe(true);
    expect(closingSnapshot.expanded).toBe('false');
    for (const inset of closingSnapshot.titleBottomInsets) {
      expect(inset).toBeCloseTo(openBottomInset, 0);
    }

    await page.mouse.move(0, 0);
    const sourceHandle = specimen.locator('.rf-card-node__authoring-handle--source').first();
    await expect(sourceHandle).toHaveCSS('opacity', '0');
    expect(await sourceHandle.evaluate(transitionDuration, 'opacity')).toBe(120);
    expect(await card.locator('.card-rail').evaluate(transitionDuration, 'background-color')).toBe(
      120,
    );

    const leavingContent = card.locator('.canvas-card__content');
    await expect(leavingContent).toHaveCount(0);
    await expect(card).toHaveAttribute('data-expanded', 'false');
    await expect(card.getByRole('button', { name: 'Open Card Strategies' })).toBeVisible();
    const longCard = page.getByRole('region', { name: 'Long Markdown Card' });
    await expect(longCard).toBeVisible();
    await longCard.getByRole('article', { name: 'Long Markdown' }).hover();
    await longCard.getByRole('button', { name: 'Close Card Long Markdown' }).click();
    await expect(longCard.getByRole('heading', { name: 'Placement is authored' })).toHaveCount(0);
    await expect(longCard.getByRole('button', { name: 'Open Card Long Markdown' })).toBeVisible();
  },
);

test(
  'the Card fills a React Flow node whose rect differs from the collapsed default',
  { tag: '@parity:canvas-card-fills-authored-node-rect' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Card', exact: true });
    const node = openRegion.locator('.react-flow__node');
    const card = node.getByRole('article', { name: 'Strategies' });
    await expect(card).toBeVisible({ timeout: 20_000 });

    const boxes = await node.evaluate((element) => {
      const cardElement = element.querySelector('.canvas-card');
      if (cardElement === null) throw new Error('The React Flow node contains no CanvasCard');
      const nodeBox = element.getBoundingClientRect();
      const cardBox = cardElement.getBoundingClientRect();
      return {
        node: { width: nodeBox.width, height: nodeBox.height },
        card: { width: cardBox.width, height: cardBox.height },
      };
    });
    expect(boxes.node.width).not.toBeCloseTo(260, 0);
    expect(boxes.node.height).not.toBeCloseTo(146, 0);
    expect(boxes.card).toEqual(boxes.node);
  },
);

test(
  'every Open Card exposes one bottom-right resize control, revealed by hover, Selection or focus; a Closed Card exposes none',
  { tag: '@parity:open-card-offers-one-resize-control' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Card', exact: true });
    const closedRegion = page.getByRole('region', { name: 'Closed Card', exact: true });
    await expect(openRegion.getByRole('article', { name: 'Strategies' })).toBeVisible({
      timeout: 20_000,
    });

    const openControl = openRegion.locator('.react-flow__resize-control');
    await expect(openControl).toHaveCount(1);
    await expect(openControl).toHaveClass(/\bbottom\b/);
    await expect(openControl).toHaveClass(/\bright\b/);
    await expect(closedRegion.locator('.react-flow__resize-control')).toHaveCount(0);

    // Three independent reveals, each asserted rather than assumed from the
    // one that is easiest to drive (ADR 0066). Hover is pointer discovery;
    // Selection holds the control for touch, which has no hover to give; and
    // Card focus offers the keyboard the same authoring affordance.
    await page.mouse.move(0, 0);
    await expect(openControl).toHaveCSS('opacity', '0');

    await openRegion.getByRole('article', { name: 'Strategies' }).hover();
    await expect(openControl).toHaveCSS('opacity', '1');

    const selectedRegion = page.getByRole('region', { name: 'Selected Card' });
    const selectedControl = selectedRegion.locator('.react-flow__resize-control');
    await page.mouse.move(0, 0);
    await expect(selectedControl).toHaveCSS('opacity', '1');

    await page.mouse.move(0, 0);
    await expect(openControl).toHaveCSS('opacity', '0');
    await openRegion.locator('.react-flow__node').focus();
    await expect(openControl).toHaveCSS('opacity', '1');

    await openRegion.getByRole('article', { name: 'Strategies' }).hover();

    const node = openRegion.locator('.react-flow__node');
    const before = await node.boundingBox();
    if (before === null) throw new Error('The Open Card node has no box.');
    const box = await openControl.boundingBox();
    if (box === null) throw new Error('The Open resize control has no box.');

    // The hit target, asserted as a size rather than left to the drag below.
    // React Flow's own `.react-flow__resize-control.handle` declares a 5px box
    // and outranks a rule naming one class, so this passed while the control
    // was too small for a pointer to find — Playwright hits 5px exactly and a
    // hand does not. The mark stays smaller than the target it sits in.
    expect(box.width).toBe(48);
    expect(box.height).toBe(48);
    const markLocator = openRegion.locator('.rf-card-node__resize-mark');
    const mark = await markLocator.boundingBox();
    if (mark === null) throw new Error('The Open resize control draws no mark.');
    expect(mark.width).toBe(20);
    expect(mark.height).toBe(20);
    expect(mark.x - box.x).toBe(33);
    expect(mark.y - box.y).toBe(33);
    expect(mark.x + mark.width - (before.x + before.width)).toBe(5);
    expect(mark.y + mark.height - (before.y + before.height)).toBe(5);
    await expect(markLocator).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    // The interactive control stays inside the Card so its invisible state
    // cannot receive an unannounced touch over the pane. Only its inert mark
    // straddles the bottom-right edge by 5px on each axis.
    expect(box.x).toBeGreaterThanOrEqual(before.x);
    expect(box.y).toBeGreaterThanOrEqual(before.y);
    expect(box.x + box.width).toBeLessThanOrEqual(before.x + before.width + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(before.y + before.height + 0.5);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
    // The node's own CSS transitions width/height/transform (`.rf-card-node`),
    // so the released rect is reached only once that settles.
    await node.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    const after = await node.boundingBox();
    if (after === null) throw new Error('The Open Card node has no box after resizing.');
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBeGreaterThan(before.height);
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  },
);

test(
  'a resize proposal inside the complete Close range previews the exact Closed rect while the gesture remains active',
  { tag: '@parity:resize-preview-snaps-to-closed-rect' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Card', exact: true });
    const node = openRegion.locator('.react-flow__node');
    const control = openRegion.locator('.react-flow__resize-control');
    await expect(openRegion.getByRole('article', { name: 'Strategies' })).toBeVisible({
      timeout: 20_000,
    });
    await openRegion.getByRole('article', { name: 'Strategies' }).hover();

    const before = await node.evaluate((element) => ({
      width: Number.parseFloat(getComputedStyle(element).width),
      height: Number.parseFloat(getComputedStyle(element).height),
    }));
    const zoom = await node.evaluate((element) => {
      const viewport = element
        .closest('.react-flow')
        ?.querySelector<HTMLElement>('.react-flow__viewport');
      return Number(/scale\(([\d.]+)\)/.exec(viewport?.style.transform ?? '')?.[1] ?? 1);
    });
    const box = await control.boundingBox();
    if (box === null) throw new Error('The Open resize control has no box.');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + (280 - before.width) * zoom,
      box.y + box.height / 2 + (166 - before.height) * zoom,
      { steps: 6 },
    );

    await expect
      .poll(async () =>
        node.evaluate((element) => ({
          width: Number.parseFloat(getComputedStyle(element).width),
          height: Number.parseFloat(getComputedStyle(element).height),
        })),
      )
      .toEqual({ width: 260, height: 146 });
    await expect(node.locator('.rf-card-node__inner')).toHaveAttribute('data-expanded', 'true');
    await page.mouse.up();
  },
);

test(
  'an active Card resize does not animate its dimensions behind the pointer',
  { tag: '@parity:active-card-resize-tracks-pointer-without-dimension-animation' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Card', exact: true });
    const card = openRegion.getByRole('article', { name: 'Strategies' });
    const node = openRegion.locator('.react-flow__node');
    const control = openRegion.locator('.react-flow__resize-control');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.hover();

    const box = await control.boundingBox();
    if (box === null) throw new Error('The Open resize control has no box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 35, {
      steps: 2,
    });
    await expect(node.locator('.rf-card-node__inner')).toHaveAttribute('data-resizing', 'true');

    const dimensionAnimationRunning = await node.evaluate((element) =>
      element.getAnimations().some((animation) => {
        if (!(animation instanceof CSSTransition) || animation.playState !== 'running') {
          return false;
        }
        return (
          animation.transitionProperty === 'width' || animation.transitionProperty === 'height'
        );
      }),
    );
    expect(dimensionAnimationRunning).toBe(false);
    await page.mouse.up();
  },
);

test('the open Card rail offers its edit action before Close', async ({ page }) => {
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

test('hover reveals only the rail Edit and Close actions', async ({ page }) => {
  await open(page, markdownStory);
  const card = page.getByRole('article', { name: 'Strategies' });
  await card.hover();

  const labels = await card
    .getByTestId('canvas-card-actions')
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(labels).toEqual(['Edit Card Strategies', 'Close Card Strategies']);
  const bodyTarget = card.getByTestId('markdown-card-body-edit-target');
  await expect(bodyTarget).toHaveCSS('opacity', '0');
  await expect(bodyTarget.locator('svg')).toHaveCount(0);
  await bodyTarget.click();
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

test('the rail is one toolbar: one tab stop, and its commands under the arrows', async ({
  page,
}) => {
  await open(page, markdownStory);
  const card = page.getByRole('article', { name: 'Strategies' });
  const toolbar = card.getByRole('toolbar', { name: 'Card Strategies' });
  await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');

  // One tab stop for the whole rail, whatever it carries. A canvas draws many
  // Cards and each rail carries several commands, so a stop apiece would put
  // the Cards themselves behind their own actions (ADR 0073).
  await card.hover();
  const edit = card.getByRole('button', { name: 'Edit Card Strategies' });
  const close = card.getByRole('button', { name: 'Close Card Strategies' });
  expect(
    await toolbar
      .getByRole('button')
      .evaluateAll((buttons) => buttons.filter((button) => button.tabIndex === 0).length),
  ).toBe(1);

  await edit.focus();
  await edit.press('ArrowRight');
  await expect(close).toBeFocused();
  await close.press('ArrowLeft');
  await expect(edit).toBeFocused();
});

test('an unavailable rail command keeps its place under the arrows', async ({ page }) => {
  await open(page, markdownStory);
  const card = page.getByRole('article', { name: 'Strategies' });
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();

  const save = card.getByRole('button', { name: 'Save Card Strategies' });
  const cancel = card.getByRole('button', { name: 'Cancel editing Card Strategies' });
  const close = card.getByRole('button', { name: 'Close Card Strategies' });

  // Unavailable through `aria-disabled`, so it is still there to arrow to. The
  // native property drew the control and took it off the keyboard, which made
  // ADR 0064's "keeps its slot" a promise to the eye only.
  await expect(close).toHaveAttribute('aria-disabled', 'true');
  await save.focus();
  await save.press('ArrowRight');
  await expect(cancel).toBeFocused();
  await cancel.press('ArrowRight');
  await expect(close).toBeFocused();

  // Reachable is not runnable: the Card must not collapse out from under the
  // caret and the draft it is holding.
  await close.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeVisible();
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

test(
  'the two ends are the only way out, and a press on one keeps the caret',
  {
    tag: '@parity:open-markdown-card-owns-its-editing-lifecycle',
  },
  async ({ page }) => {
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
    await expect(card.getByRole('button', { name: 'Edit Card Strategies' })).toBeFocused();

    await card.getByRole('button', { name: 'Edit Card Strategies' }).click();
    await editor.pressSequentially('Kept. ');
    await card.getByRole('button', { name: 'Save Card Strategies' }).click();
    await expect(editor).toHaveCount(0);
    await expect(card).toContainText('Kept.');
    await expect(card.getByRole('button', { name: 'Edit Card Strategies' })).toBeFocused();

    await card.getByRole('button', { name: 'Edit Card Strategies' }).click();
    await editor.press('Escape');
    await expect(card.getByRole('button', { name: 'Edit Card Strategies' })).toBeFocused();

    await card.getByRole('button', { name: 'Edit Card Strategies' }).click();
    await editor.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(card.getByRole('button', { name: 'Edit Card Strategies' })).toBeFocused();
  },
);

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
