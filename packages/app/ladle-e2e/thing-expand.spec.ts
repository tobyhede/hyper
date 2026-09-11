import { expect, test, type Page } from '@playwright/test';

const openCloseStory = '/?story=components--thing--open-and-close&mode=preview';
const markdownStory = '/?story=components--thing--editing--markdown&mode=preview';
const resizeControlStory = '/?story=components--thing--resize-control&mode=preview';
const openAliasStory = '/?story=components--thing--open-alias&mode=preview';

const open = async (page: Page, story: string): Promise<void> => {
  await page.goto(story);
  await expect(page.getByRole('article', { name: 'Strategies' }).first()).toBeVisible({
    timeout: 20_000,
  });
};

test(
  'Open Alias story renders Target Markdown read-only under the Alias Title',
  { tag: '@parity:open-alias-shows-target-markdown-read-only' },
  async ({ page }) => {
    await page.goto(openAliasStory);
    const alias = page.getByRole('article', { name: 'Strategy overview' });
    await expect(alias.getByRole('heading', { name: 'Strategy overview' })).toBeVisible();
    // Exact, both of them. The Target's source has to reach the renderer as real
    // Markdown: a body carrying literal escapes draws one run-on heading that a
    // substring match still finds, which is the claim passing on the wrong page.
    await expect(alias.getByRole('heading', { name: 'Strategies', exact: true })).toBeVisible();
    await expect(alias.getByText('No strategy is privileged.', { exact: true })).toBeVisible();
    await expect(alias.getByRole('textbox')).toHaveCount(0);
    await expect(alias.getByRole('button', { name: /Edit Thing/ })).toHaveCount(0);
    await expect(
      alias.getByRole('button', { name: 'Close Thing Strategy overview' }),
    ).toBeVisible();
    // The Target's content is the Open Thing's top passenger and the Alias Title
    // its bottom one, the same treatment an Open Markdown Thing draws (ADR 0070).
    const contentBox = await alias.locator('.canvas-thing__content').boundingBox();
    const titleBox = await alias.locator('.canvas-thing__body').boundingBox();
    if (contentBox === null || titleBox === null) throw new Error('Open Alias drew no content');
    expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(titleBox.y + 1);
  },
);

test(
  'Open and Close retain one Thing and Title treatment',
  { tag: '@parity:markdown-thing-opens-and-closes-in-place' },
  async ({ page }) => {
    await open(page, openCloseStory);
    const specimen = page.getByRole('region', { name: 'Interactive Thing' });
    const thing = specimen.getByRole('article', { name: 'Strategies' });
    const handles = specimen.locator('.rf-thing-node__authoring-handle');
    await expect(handles).toHaveCount(8);
    const title = thing.getByRole('heading', { name: 'Strategies' });
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
      const thingBox = await thing.boundingBox();
      const titleBox = await title.boundingBox();
      if (thingBox === null || titleBox === null)
        throw new Error('Thing title geometry is unavailable');
      return titleBox.x - thingBox.x;
    };
    const closedInset = await titleLeftInset();
    const titleBottomInset = async () => {
      const thingBox = await thing.boundingBox();
      const titleBox = await title.boundingBox();
      if (thingBox === null || titleBox === null)
        throw new Error('Thing title geometry is unavailable');
      return thingBox.y + thingBox.height - (titleBox.y + titleBox.height);
    };

    await thing.hover();
    await expect(specimen.locator('.rf-thing-node__authoring-handle--source').first()).toHaveCSS(
      'opacity',
      '1',
    );
    await thing.getByRole('button', { name: 'Open Thing Strategies' }).click();
    await expect(thing.getByRole('heading', { name: 'Placement is authored' })).toBeVisible();
    await expect(thing.getByRole('button', { name: 'Close Thing Strategies' })).toBeVisible();
    await expect(title).toHaveAttribute('class', closedClass ?? '');
    expect(await title.evaluate(titleStyle)).toEqual(closedStyle);
    expect(await titleLeftInset()).toBeCloseTo(closedInset, 0);
    const openContent = thing.locator('.canvas-thing__content');
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
    const closingSnapshot = await thing
      .getByRole('button', { name: 'Close Thing Strategies' })
      .evaluate((button, duration) => {
        const startedAt = performance.now();
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        const element = button.closest<HTMLElement>('.canvas-thing');
        if (element === null) throw new Error('Closing Thing is unavailable');
        const content = element.querySelector<HTMLElement>('.canvas-thing__content');
        const titleElement = element.querySelector<HTMLElement>('.canvas-thing__title');
        if (content === null || titleElement === null)
          throw new Error('Closing Thing content or Title is unavailable');
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
            const thingBox = element.getBoundingClientRect();
            const titleBox = titleElement.getBoundingClientRect();
            titleBottomInsets.push(thingBox.bottom - titleBox.bottom);
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
    const sourceHandle = specimen.locator('.rf-thing-node__authoring-handle--source').first();
    await expect(sourceHandle).toHaveCSS('opacity', '0');
    expect(await sourceHandle.evaluate(transitionDuration, 'opacity')).toBe(120);
    // The rail carries no colour to fade now, so the quieting is the two things
    // that do: the commands and the kind glyph
    // (`.scratch/command-dock/issues/12`).
    expect(
      await thing.getByTestId('canvas-thing-actions').evaluate(transitionDuration, 'opacity'),
    ).toBe(120);
    expect(await thing.locator('.thing-rail__kind').evaluate(transitionDuration, 'opacity')).toBe(
      120,
    );

    const leavingContent = thing.locator('.canvas-thing__content');
    await expect(leavingContent).toHaveCount(0);
    await expect(thing).toHaveAttribute('data-expanded', 'false');
    await expect(thing.getByRole('button', { name: 'Open Thing Strategies' })).toBeVisible();
    const longThing = page.getByRole('region', { name: 'Long Markdown Thing' });
    await expect(longThing).toBeVisible();
    await longThing.getByRole('article', { name: 'Long Markdown' }).hover();
    await longThing.getByRole('button', { name: 'Close Thing Long Markdown' }).click();
    await expect(longThing.getByRole('heading', { name: 'Placement is authored' })).toHaveCount(0);
    await expect(longThing.getByRole('button', { name: 'Open Thing Long Markdown' })).toBeVisible();
  },
);

test(
  'the Thing fills a React Flow node whose rect differs from the collapsed default',
  { tag: '@parity:canvas-thing-fills-authored-node-rect' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Thing', exact: true });
    const node = openRegion.locator('.react-flow__node');
    const thing = node.getByRole('article', { name: 'Strategies' });
    await expect(thing).toBeVisible({ timeout: 20_000 });

    const boxes = await node.evaluate((element) => {
      const thingElement = element.querySelector('.canvas-thing');
      if (thingElement === null) throw new Error('The React Flow node contains no CanvasThing');
      const nodeBox = element.getBoundingClientRect();
      const thingBox = thingElement.getBoundingClientRect();
      return {
        node: { width: nodeBox.width, height: nodeBox.height },
        thing: { width: thingBox.width, height: thingBox.height },
      };
    });
    expect(boxes.node.width).not.toBeCloseTo(260, 0);
    expect(boxes.node.height).not.toBeCloseTo(146, 0);
    expect(boxes.thing).toEqual(boxes.node);
  },
);

test(
  'every Open Thing exposes one bottom-right resize control, revealed by hover, Selection or focus; a Closed Thing exposes none',
  { tag: '@parity:open-thing-offers-one-resize-control' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Thing', exact: true });
    const closedRegion = page.getByRole('region', { name: 'Closed Thing', exact: true });
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
    // Thing focus offers the keyboard the same authoring affordance.
    await page.mouse.move(0, 0);
    await expect(openControl).toHaveCSS('opacity', '0');

    await openRegion.getByRole('article', { name: 'Strategies' }).hover();
    await expect(openControl).toHaveCSS('opacity', '1');

    const selectedRegion = page.getByRole('region', { name: 'Selected Thing' });
    const selectedControl = selectedRegion.locator('.react-flow__resize-control');
    await page.mouse.move(0, 0);
    await expect(selectedControl).toHaveCSS('opacity', '1');

    await page.mouse.move(0, 0);
    await expect(openControl).toHaveCSS('opacity', '0');
    await page.keyboard.press('Tab');
    await openRegion.locator('.react-flow__node').focus();
    await expect(openControl).toHaveCSS('opacity', '1');

    await openRegion.getByRole('article', { name: 'Strategies' }).hover();

    const node = openRegion.locator('.react-flow__node');
    const before = await node.boundingBox();
    if (before === null) throw new Error('The Open Thing node has no box.');
    const box = await openControl.boundingBox();
    if (box === null) throw new Error('The Open resize control has no box.');

    // The hit target, asserted as a size rather than left to the drag below.
    // React Flow's own `.react-flow__resize-control.handle` declares a 5px box
    // and outranks a rule naming one class, so this passed while the control
    // was too small for a pointer to find — Playwright hits 5px exactly and a
    // hand does not. The mark stays smaller than the target it sits in.
    expect(box.width).toBe(48);
    expect(box.height).toBe(48);
    const markLocator = openRegion.locator('.rf-thing-node__resize-mark');
    const mark = await markLocator.boundingBox();
    if (mark === null) throw new Error('The Open resize control draws no mark.');
    expect(mark.width).toBe(20);
    expect(mark.height).toBe(20);
    expect(mark.x - box.x).toBe(33);
    expect(mark.y - box.y).toBe(33);
    expect(mark.x + mark.width - (before.x + before.width)).toBe(5);
    expect(mark.y + mark.height - (before.y + before.height)).toBe(5);
    await expect(markLocator).toHaveCSS('background-color', 'rgb(0, 0, 0)');

    // The interactive control stays inside the Thing so its invisible state
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
    // The node's own CSS transitions width/height/transform (`.rf-thing-node`),
    // so the released rect is reached only once that settles.
    await node.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    const after = await node.boundingBox();
    if (after === null) throw new Error('The Open Thing node has no box after resizing.');
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
    const openRegion = page.getByRole('region', { name: 'Open Thing', exact: true });
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
    await expect(node.locator('.rf-thing-node__inner')).toHaveAttribute('data-expanded', 'true');
    await page.mouse.up();
  },
);

test(
  'an active Thing resize does not animate its dimensions behind the pointer',
  { tag: '@parity:active-thing-resize-tracks-pointer-without-dimension-animation' },
  async ({ page }) => {
    await page.goto(resizeControlStory);
    const openRegion = page.getByRole('region', { name: 'Open Thing', exact: true });
    const thing = openRegion.getByRole('article', { name: 'Strategies' });
    const node = openRegion.locator('.react-flow__node');
    const control = openRegion.locator('.react-flow__resize-control');
    await expect(thing).toBeVisible({ timeout: 20_000 });
    await thing.hover();

    const box = await control.boundingBox();
    if (box === null) throw new Error('The Open resize control has no box.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 35, {
      steps: 2,
    });
    await expect(node.locator('.rf-thing-node__inner')).toHaveAttribute('data-resizing', 'true');

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

test('the open Thing rail offers its edit action before Close', async ({ page }) => {
  await open(page, markdownStory);
  const thing = page.getByRole('article', { name: 'Strategies' });
  const edit = thing.getByRole('button', { name: 'Edit Thing Strategies' });

  await thing.hover();
  await expect(edit).toBeVisible();
  const labels = await thing
    .getByTestId('canvas-thing-actions')
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(labels[0]).toBe('Edit Thing Strategies');
  await edit.focus();
  await edit.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
});

test('hover reveals only the rail Edit and Close actions', async ({ page }) => {
  await open(page, markdownStory);
  const thing = page.getByRole('article', { name: 'Strategies' });
  await thing.hover();

  const labels = await thing
    .getByTestId('canvas-thing-actions')
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
  expect(labels).toEqual(['Edit Thing Strategies', 'Close Thing Strategies']);
  const bodyTarget = thing.getByTestId('markdown-thing-body-edit-target');
  await expect(bodyTarget).toHaveCSS('opacity', '0');
  await expect(bodyTarget.locator('svg')).toHaveCount(0);
  await bodyTarget.click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
});

test('the rail replaces its Edit action with the two ends of a running edit', async ({ page }) => {
  await open(page, markdownStory);
  const thing = page.getByRole('article', { name: 'Strategies' });
  const actions = thing.getByTestId('canvas-thing-actions');
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();

  expect(
    await actions
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual(['Save Thing Strategies', 'Cancel editing Thing Strategies', 'Close Thing Strategies']);
  await expect(thing.getByRole('button', { name: 'Edit Thing Strategies' })).toHaveCount(0);
  // Closing mid-edit would drop the Thing's box out from under a live caret, so
  // the control keeps its slot and says it is unavailable.
  await expect(thing.getByRole('button', { name: 'Close Thing Strategies' })).toBeDisabled();
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
  // The rail hides its actions at rest and reveals them with the Thing. A running
  // edit is not a hover, so the way out has to be up without one.
  await expect(actions).toHaveCSS('opacity', '1');
});

test('the rail is one toolbar: one tab stop, and its commands under the arrows', async ({
  page,
}) => {
  await open(page, markdownStory);
  const thing = page.getByRole('article', { name: 'Strategies' });
  const toolbar = thing.getByRole('toolbar', { name: 'Thing Strategies' });
  await expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');

  // One tab stop for the whole rail, whatever it carries. A canvas draws many
  // Things and each rail carries several commands, so a stop apiece would put
  // the Things themselves behind their own actions (ADR 0073).
  await thing.hover();
  const edit = thing.getByRole('button', { name: 'Edit Thing Strategies' });
  const close = thing.getByRole('button', { name: 'Close Thing Strategies' });
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
  const thing = page.getByRole('article', { name: 'Strategies' });
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();

  const save = thing.getByRole('button', { name: 'Save Thing Strategies' });
  const cancel = thing.getByRole('button', { name: 'Cancel editing Thing Strategies' });
  const close = thing.getByRole('button', { name: 'Close Thing Strategies' });

  // Unavailable through `aria-disabled`, so it is still there to arrow to. The
  // native property drew the control and took it off the keyboard, which made
  // ADR 0064's "keeps its slot" a promise to the eye only.
  await expect(close).toHaveAttribute('aria-disabled', 'true');

  // **And it says so, which is the half an attribute assertion cannot make.**
  // `disabled:` utilities never match a toolbar item, so an unavailable command
  // was drawn at full ink and still took the hover fill — operable to the eye and
  // inert to the press. Both are read here: quieter than the command beside it,
  // and unmoved by a pointer that cannot use it (`Button.tsx`).
  const ink = (locator: typeof close) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, background: style.backgroundColor, cursor: style.cursor };
    });
  const unavailable = await ink(close);
  expect(Number(unavailable.opacity)).toBeLessThan(Number((await ink(cancel)).opacity));
  expect(unavailable.cursor).toBe('not-allowed');
  await close.hover();
  expect((await ink(close)).background).toBe(unavailable.background);
  await save.focus();
  await save.press('ArrowRight');
  await expect(cancel).toBeFocused();
  await cancel.press('ArrowRight');
  await expect(close).toBeFocused();

  // Reachable is not runnable: the Thing must not collapse out from under the
  // caret and the draft it is holding.
  await close.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeVisible();
});

/**
 * The rail used to say "this Thing is awake" with the Active Graph's band behind
 * its commands, and the band is gone (`.scratch/command-dock/issues/12`). What
 * is left saying it is the kind glyph, which a resting Thing draws quietly, and
 * the commands themselves — so those are what this reads.
 */
test('a Thing running an edit is not drawn at rest, however it is left', async ({ page }) => {
  await open(page, markdownStory);
  const thing = page.getByRole('article', { name: 'Strategies' });
  const kind = thing.locator('.thing-rail__kind');
  const commands = thing.getByTestId('canvas-thing-actions');

  await page.mouse.move(0, 0);
  await expect(kind).toHaveCSS('opacity', '0.28');
  await expect(commands).toHaveCSS('opacity', '0');

  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source of Strategies' })).toBeFocused();
  // Nothing is hovering the Thing, the caret is in its body rather than on its
  // rail, and a blur ends nothing — so without this the kind glyph would quiet
  // down and leave Save, Cancel and Close lit on a Thing that looks asleep.
  await page.mouse.move(0, 0);
  await expect(kind).toHaveCSS('opacity', '1');
  await expect(commands).toHaveCSS('opacity', '1');

  await thing.getByRole('button', { name: 'Cancel editing Thing Strategies' }).click();
  await page.mouse.move(0, 0);
  await expect(kind).toHaveCSS('opacity', '0.28');
  await expect(commands).toHaveCSS('opacity', '0');
});

test(
  'the two ends are the only way out, and a press on one keeps the caret',
  {
    tag: '@parity:open-markdown-thing-owns-its-editing-lifecycle',
  },
  async ({ page }) => {
    await open(page, markdownStory);
    const thing = page.getByRole('article', { name: 'Strategies' });
    const editor = page.getByRole('textbox', { name: 'Markdown source of Strategies' });

    await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
    await editor.pressSequentially('Abandoned. ');
    // Clicking away is not an exit: the draft is still there and the editor is
    // still up. Four exits and no more — two keys and the two controls.
    await page.getByRole('heading', { name: 'Strategies', exact: true }).click();
    await expect(editor).toHaveCount(1);
    await expect(editor).toContainText('Abandoned.');

    await thing.getByRole('button', { name: 'Cancel editing Thing Strategies' }).click();
    await expect(editor).toHaveCount(0);
    await expect(thing).not.toContainText('Abandoned.');
    await expect(thing.getByRole('button', { name: 'Edit Thing Strategies' })).toBeFocused();

    await thing.getByRole('button', { name: 'Edit Thing Strategies' }).click();
    await editor.pressSequentially('Kept. ');
    await thing.getByRole('button', { name: 'Save Thing Strategies' }).click();
    await expect(editor).toHaveCount(0);
    await expect(thing).toContainText('Kept.');
    await expect(thing.getByRole('button', { name: 'Edit Thing Strategies' })).toBeFocused();

    await thing.getByRole('button', { name: 'Edit Thing Strategies' }).click();
    await editor.press('Escape');
    await expect(thing.getByRole('button', { name: 'Edit Thing Strategies' })).toBeFocused();

    await thing.getByRole('button', { name: 'Edit Thing Strategies' }).click();
    await editor.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await expect(thing.getByRole('button', { name: 'Edit Thing Strategies' })).toBeFocused();
  },
);

test('the body editor shows its shortcut hint only with actual focus', async ({ page }) => {
  await open(page, markdownStory);
  await page.getByRole('button', { name: 'Focused edit', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown source of Strategies' });
  // Located by its own element, not its copy: the keys are drawn by the shared
  // `Kbd` primitive, so the hint is several nodes and the text between them is
  // the design system's to change.
  const hint = page.locator('.markdown-thing-body__shortcut-hint');
  const pairs = hint.locator('.markdown-thing-body__shortcut');
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
    const pair = element.querySelector('.markdown-thing-body__shortcut');
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

test(
  'Open and Close release pointer-revealed controls while preserving keyboard access',
  { tag: '@parity:thing-rail-reveal-distinguishes-pointer-and-keyboard' },
  async ({ page }) => {
    await open(page, openCloseStory);
    const thing = page
      .getByRole('region', { name: 'Interactive Thing' })
      .locator('.react-flow__node');
    const actions = thing.getByRole('toolbar', { name: 'Thing Strategies', exact: true });
    for (const operation of ['Open', 'Close']) {
      await thing.hover();
      await thing
        .getByRole('button', { name: `${operation} Thing Strategies`, exact: true })
        .click();
      await page.mouse.move(1, 1);
      await expect(actions).toHaveCSS('opacity', '0');
      await expect(actions).toHaveCSS('pointer-events', 'none');
    }
    // Switch to keyboard modality, then reach and operate the same toolbar.
    await page.keyboard.press('Tab');
    const openControl = thing.getByRole('button', { name: 'Open Thing Strategies', exact: true });
    await openControl.focus();
    await expect(actions).toHaveCSS('opacity', '1');
    await openControl.press('Enter');
    const close = thing.getByRole('button', { name: 'Close Thing Strategies', exact: true });
    await expect(close).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
    await close.press('Enter');
    await expect(openControl).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
  },
);
