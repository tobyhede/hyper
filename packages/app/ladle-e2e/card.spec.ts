import { expect, test, type Locator, type Page } from '@playwright/test';

const specimen = (page: Page, label: string): Locator =>
  page.locator('.inv-specimen', {
    has: page.locator('.inv-specimen__label', { hasText: new RegExp(`^${label}$`) }),
  });

test(
  'rest, selected and dragging draw visually distinct treatments, for both fronts',
  { tag: '@parity:canvas-card-shows-rest-selected-and-dragging-states' },
  async ({ page }) => {
    await page.goto('/?story=components--card--states&mode=preview');

    const rest = specimen(page, 'card · rest').getByRole('article');
    const selected = specimen(page, 'card · selected').getByRole('article');
    const dragging = specimen(page, 'card · dragging').getByRole('article');

    await expect(rest).toHaveAttribute('data-state', 'rest');
    await expect(selected).toHaveAttribute('data-state', 'selected');
    await expect(dragging).toHaveAttribute('data-state', 'dragging');

    // Rest draws no shadow; selected rings it; dragging offsets and rotates it.
    expect(await rest.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
    expect(await selected.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    expect(await dragging.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');

    // An Alias's dotted border solidifies once it leaves rest, same as a Card's shadow.
    await expect(specimen(page, 'alias · rest').getByRole('article')).toHaveCSS(
      'border-style',
      'dotted',
    );
    await expect(specimen(page, 'alias · selected').getByRole('article')).toHaveCSS(
      'border-style',
      'solid',
    );
  },
);

/**
 * What every front draws, kind by kind, and what none of them draws.
 *
 * The table is the point: one loop over every front the component declares, so
 * a new kind cannot be added with its own story slice and reviewed on its own.
 */
const FRONTS = [
  { label: 'markdown', kind: 'markdown', glyph: 'Markdown Card', border: 'solid' },
  { label: 'alias', kind: 'alias', glyph: 'Alias', border: 'dotted' },
  { label: 'space', kind: 'space', glyph: 'Space Card', border: 'solid' },
  // The creation ghost is not a Card and takes the Markdown treatment, which is
  // why it is checked against the Markdown kind and glyph rather than its own.
  { label: 'creation ghost', kind: 'markdown', glyph: 'Markdown Card', border: 'solid' },
] as const;

const ONE_LINE = ['Strategies'];
const THREE_LINES = ['Strategies', 'no strategy is privileged', 'elkjs is one member of a set'];

/** The roles of a Card's drawn Title Lines, in the order they are drawn. */
const rolesOf = (lines: Locator): Promise<readonly (string | null)[]> =>
  lines.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-role')));

/** The resolved font size of each drawn Title Line, in pixels. */
const sizesOf = (lines: Locator): Promise<readonly number[]> =>
  lines.evaluateAll((elements) =>
    elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  );

/**
 * The whole of what a Card front draws, and the whole of what it does not.
 *
 * This is the one place that states it. Every other Card story is a slice —
 * states, kinds, hover, colours, opening, resizing — and two undecided elements
 * lived on the front for months because the slice that drew them was not the
 * slice anyone reviewed. So the assertions below are deliberately exhaustive
 * over the Card's own box: the kind glyph, the border, one element per Title
 * Line at the role the domain gave it, and **nothing beneath the Title** — no
 * second line the application writes on the author's behalf, and no text on the
 * Card that is not one of the Title Lines the author typed.
 */
test(
  'every Card front draws its kind, its border and its Title Lines, and nothing beneath them',
  { tag: '@parity:canvas-card-front-draws-only-its-title-lines' },
  async ({ page }) => {
    await page.goto('/?story=components--card--front&mode=preview');

    for (const front of FRONTS) {
      for (const [suffix, expected] of [
        ['one line', ONE_LINE],
        ['three lines', THREE_LINES],
      ] as const) {
        const card = specimen(page, `${front.label} · ${suffix}`).getByRole('article');
        await expect(card).toHaveAttribute('data-kind', front.kind);
        await expect(card).toHaveAttribute('data-state', 'rest');
        await expect(card).toHaveAttribute('data-expanded', 'false');
        await expect(card.getByRole('img', { name: front.glyph })).toBeVisible();
        await expect(card).toHaveCSS('border-style', front.border);

        // One block element per Title Line, carrying the role `titleLines` gave
        // it — and exactly as many as the author typed.
        const lines = card.locator('.canvas-card__title-line');
        await expect(lines).toHaveCount(expected.length);
        expect(await lines.allInnerTexts()).toEqual([...expected]);
        expect(await rolesOf(lines)).toEqual(
          expected.length === 1 ? ['title'] : ['title', 'subtitle', 'caption'],
        );

        // Nothing beneath the Title. The heading is the only thing in the body,
        // no content surface is mounted on a closed Card, and the Card's own
        // text is the Title Lines and nothing else — which is what the two
        // undecided reference lines would fail.
        await expect(card.locator('.canvas-card__body > *')).toHaveCount(1);
        await expect(card.locator('.canvas-card__body > .canvas-card__title')).toHaveCount(1);
        await expect(card.locator('.canvas-card__content')).toHaveCount(0);
        const text = (await card.innerText())
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== '');
        expect(text).toEqual([...expected]);
      }
    }

    // The rungs descend, which is the register this feature adds. Read as
    // resolved sizes rather than trusted to the eye: three independent
    // declarations would draw the same picture and drift.
    const ladder = specimen(page, 'markdown · three lines').getByRole('article');
    const rungs = await sizesOf(ladder.locator('.canvas-card__title-line'));
    expect(rungs[0]! > rungs[1]!).toBe(true);
    expect(rungs[1]! > rungs[2]!).toBe(true);
  },
);

/**
 * The distinction ADR 0083 says a future reader is most likely to get wrong,
 * drawn side by side: a break the **author** typed starts a rung and a break the
 * **box** chose does not.
 */
// Untagged: the parity claim `canvas-card-front-draws-only-its-title-lines`
// above already owns this story's evidence, and one claim takes exactly one
// Ladle test. This is the same story's second reading and needs no second claim.
test('a wrapped single-line Title stays one rung while an authored three-line Title draws three', async ({
  page,
}) => {
  await page.goto('/?story=components--card--front&mode=preview');

  const wrapped = specimen(page, 'one Title Line, wrapped')
    .getByRole('article')
    .locator('.canvas-card__title-line');
  const authored = specimen(page, 'three Title Lines, authored')
    .getByRole('article')
    .locator('.canvas-card__title-line');

  // One element, one role — however many visual lines the box took.
  await expect(wrapped).toHaveCount(1);
  expect(await rolesOf(wrapped)).toEqual(['title']);
  const wrappedSizes = await sizesOf(wrapped);
  const wrappedHeight = await wrapped.evaluate((element) => element.getBoundingClientRect().height);
  // Taller than one line at its own size, which is what makes this a wrapped
  // Title rather than a short one that would prove nothing.
  expect(wrappedHeight).toBeGreaterThan(wrappedSizes[0]! * 2);

  // Three elements, three roles, three sizes — and the top rung is the same
  // size the wrapped Title draws every one of its visual lines at.
  await expect(authored).toHaveCount(3);
  expect(await rolesOf(authored)).toEqual(['title', 'subtitle', 'caption']);
  const authoredSizes = await sizesOf(authored);
  expect(authoredSizes[0]).toBeCloseTo(wrappedSizes[0]!, 2);
  expect(new Set(authoredSizes).size).toBe(3);
});

test(
  "an Alias front's dotted border and a long Markdown title's three-line clamp are the kind's own presentation",
  { tag: '@parity:canvas-card-shows-kind-treatment' },
  async ({ page }) => {
    await page.goto('/?story=components--card--kinds&mode=preview');

    await expect(specimen(page, 'markdown').getByRole('article')).toHaveCSS(
      'border-style',
      'solid',
    );

    const alias = specimen(page, 'alias').getByRole('article');
    await expect(alias).toHaveCSS('border-style', 'dotted');

    const longTitle = specimen(page, 'markdown · long title').getByRole('heading');
    await expect(longTitle).toBeVisible();
    // Clamped to three lines (~60px at this type size) rather than growing
    // the card to fit a title that overruns it.
    const box = await longTitle.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(80);

    // And the wrapping is *within* one Title Line, not a ladder (ADR 0083). A
    // break the box chose is not a break the author typed, so a long Title with
    // no newline in it stays a single `title`-role element however many visual
    // lines it takes — this is the specimen where the two can be told apart,
    // jsdom having no line boxes to wrap.
    const lines = longTitle.locator('.canvas-card__title-line');
    await expect(lines).toHaveCount(1);
    await expect(lines).toHaveAttribute('data-role', 'title');
    const drawn = await lines.evaluate((line) => {
      const style = getComputedStyle(line);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: style.fontWeight,
        lineHeight: Number.parseFloat(style.lineHeight),
        letterSpacing: Number.parseFloat(style.letterSpacing),
        // Its own box is taller than one line, which is what makes this a
        // wrapped Title rather than a short one that proves nothing.
        height: line.getBoundingClientRect().height,
      };
    });
    // The Title Hyper has always drawn: 18px, weight 600, leading 1.12 and
    // tracking -0.02em, resolved against its own size.
    expect(drawn.fontSize).toBeCloseTo(18, 2);
    expect(drawn.fontWeight).toBe('600');
    expect(drawn.lineHeight).toBeCloseTo(18 * 1.12, 2);
    expect(drawn.letterSpacing).toBeCloseTo(18 * -0.02, 2);
    expect(drawn.height).toBeGreaterThan(40);
  },
);

test(
  "a selected Card's rail carries the exact colour supplied to it, across the full palette",
  { tag: '@parity:canvas-card-shows-active-graph-colour' },
  async ({ page }) => {
    await page.goto('/?story=components--card--colours&mode=preview');

    const specimens = page.locator('.inv-specimen');
    await expect(specimens.first()).toBeVisible();
    const count = await specimens.count();
    expect(count).toBeGreaterThan(1);

    for (let index = 0; index < count; index += 1) {
      const item = specimens.nth(index);
      const label = (await item.locator('.inv-specimen__label').innerText()).trim();
      const railColor = await item
        .locator('.canvas-card__rail')
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      // Resolve the label's own hex text through the browser's colour parser
      // rather than hand-computing rgb(), so this proves the rail paints
      // exactly the colour the label advertises.
      const expectedColor = await page.evaluate((hex) => {
        const probe = document.createElement('div');
        probe.style.color = hex;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      }, label);
      expect(railColor).toBe(expectedColor);
    }
  },
);

test(
  "hovering the real React Flow node reveals CanvasCard's rail actions and the adapter's Edge handles together",
  { tag: '@parity:canvas-card-hover-reveals-actions-and-handles-together' },
  async ({ page }) => {
    await page.goto('/?story=components--card--hover&mode=preview');

    const node = specimen(page, 'hover to show actions and Edge handles').locator(
      '.react-flow__node',
    );
    const actions = node.getByTestId('canvas-card-actions');
    const handle = node.locator('.rf-card-node__authoring-handle--source').first();

    await expect(actions).toHaveCSS('opacity', '0');
    await expect(handle).toHaveCSS('opacity', '0');

    await node.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(handle).toHaveCSS('opacity', '1');
  },
);

test('a read-only Card owns the absence of authoring controls and handles', async ({ page }) => {
  await page.goto('/?story=components--card--hover&mode=preview');

  const node = specimen(page, 'read-only · no authoring affordances').locator('.react-flow__node');
  await node.hover();

  await expect(node.getByTestId('canvas-card-actions')).toHaveCount(0);
  await expect(node.locator('.rf-card-node__authoring-handle')).toHaveCount(0);
  await expect(node.getByRole('button', { name: /^Edit Title / })).toHaveCount(0);
});

test(
  'production Canvas Cards expose Alias identity and keyboard-focusable actions',
  { tag: '@parity:canvas-card-exposes-kind-and-keyboard-actions' },
  async ({ page }) => {
    await page.goto('/?story=components--card--actions&mode=preview');

    const alias = page.getByRole('article', { name: 'Opening, again' });
    await expect(alias.getByRole('img', { name: 'Alias' })).toBeVisible();

    const markdown = page.getByRole('article', { name: 'Strategies' });
    const actions = markdown.getByTestId('canvas-card-actions');
    const open = page.getByRole('button', { name: 'Open Card Strategies' });
    // Hidden at rest and revealed on pointer hover, the same rule the actions
    // rail draws by everywhere it appears.
    await expect(actions).toHaveCSS('opacity', '0');
    await markdown.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(open).toBeVisible();

    const title = markdown.getByRole('heading', { name: 'Strategies' });
    const titleTreatment = async () => {
      const titleBox = await title.boundingBox();
      const cardBox = await markdown.boundingBox();
      if (titleBox === null || cardBox === null) throw new Error('Card title geometry unavailable');
      return {
        left: titleBox.x - cardBox.x,
        bottom: cardBox.y + cardBox.height - (titleBox.y + titleBox.height),
        bodyPadding: await title
          .locator('..')
          .evaluate((element) => getComputedStyle(element).padding),
      };
    };
    const closedTitleTreatment = await titleTreatment();

    // Reachable and activatable from the keyboard alone, independent of hover.
    await open.focus();
    await expect(open).toBeFocused();
    await open.press('Enter');
    await expect(page.getByText('Strategies is open.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close Card Strategies' })).toBeVisible();
    await expect.poll(() => titleTreatment()).toEqual(closedTitleTreatment);
  },
);

test('reduced motion removes Card content and rail-action transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?story=components--card--open-and-close&mode=preview');

  const card = page.getByRole('region', { name: 'Long Markdown Card' }).getByRole('article');
  const content = card.locator('.canvas-card__content');
  const action = card.getByRole('button', { name: 'Close Card Long Markdown' });

  await expect(content).toHaveCSS('transition-duration', '0s');
  await expect(content).toHaveCSS('transition-delay', '0s');
  await expect(action).toHaveCSS('transition-duration', '0s');
  await expect(action).toHaveCSS('transition-delay', '0s');
});

test(
  "the Card's Title control begins editing by pointer or keyboard, stays field-local on a refusal, and completes or cancels from the keyboard",
  { tag: '@parity:canvas-card-owns-title-editing-and-refusal' },
  async ({ page }) => {
    await page.goto('/?story=components--card--editing--title&mode=preview');

    const closedSpecimen = page.getByRole('region', { name: 'Closed Card title editing' });
    const group = closedSpecimen.getByTestId('card-group');
    const control = group.getByRole('button', { name: 'Edit Title Draft entry' });
    const heading = group.getByRole('heading', { name: 'Draft entry' });
    await expect(heading).toContainText('Draft entry', {
      timeout: 20_000,
    });

    // The nesting, proved where accessible names are real (ADR 0065, ADR 0083).
    // The control wraps the heading, so the control keeps the short action name
    // and the heading is named by the Title Lines it draws. With the heading
    // outside, its name became the control's and the Title Lines were reachable
    // through nothing. jsdom computes this differently from a browser, so this
    // is the assertion that holds it.
    await expect(control).toHaveAccessibleName('Edit Title Draft entry');
    await expect(heading).toHaveAccessibleName('Draft entry');
    expect(await heading.evaluate((element) => element.closest('button') !== null)).toBe(true);

    await control.hover();
    // The pointer is on the control, but the treatment is the Title's box:
    // `canvas-card.css` draws it on `.canvas-card__title:has(…__title-control:hover)`
    // so the tint and rule span the whole Title rather than the text's own box.
    const titleBand = group.locator('.canvas-card__title');
    await expect
      .poll(() => titleBand.evaluate((element) => getComputedStyle(element).boxShadow))
      .not.toBe('none');
    await expect
      .poll(() => titleBand.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe('rgba(0, 0, 0, 0)');
    await control.focus();
    await expect(control).toHaveCSS('outline-style', 'solid');
    const titleBox = await control.boundingBox();
    await control.click();

    const input = page.getByRole('textbox', { name: 'Card title' });
    await expect(input).toBeFocused();
    const inputBox = await input.boundingBox();
    expect(inputBox?.x).toBeCloseTo(titleBox?.x ?? 0, 0);
    expect(inputBox?.y).toBeCloseTo(titleBox?.y ?? 0, 0);
    await expect(input).toHaveJSProperty('selectionStart', 0);
    await expect(input).toHaveJSProperty('selectionEnd', 'Draft entry'.length);

    // A refused draft keeps the editor open and the error attached to the field.
    await input.fill('');
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('A Card title is required.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();

    // A valid Enter completes the draft and hands focus back to the Card.
    await input.fill('Named entry');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: 'Named entry' })).toBeVisible();
    await expect(group).toBeFocused();

    // Enter on the displayed Title is native button activation.
    const renamedControl = page.getByRole('button', { name: 'Edit Title Named entry' });
    await renamedControl.focus();
    await renamedControl.press('Enter');
    const reopened = page.getByRole('textbox', { name: 'Card title' });
    await reopened.fill('Abandoned');
    await reopened.press('Escape');
    await expect(page.getByRole('heading', { name: 'Named entry' })).toBeVisible();
    await expect(group).toBeFocused();

    // Space is the equivalent native activation and Escape still cancels.
    const spaceControl = page.getByRole('button', { name: 'Edit Title Named entry' });
    await spaceControl.focus();
    await spaceControl.press('Space');
    await page.getByRole('textbox', { name: 'Card title' }).press('Escape');
    await expect(group).toBeFocused();

    // The dedicated Title story also proves that opening a Card does not
    // introduce a second title editor or hide the Card body while it runs.
    const openSpecimen = page.getByRole('region', { name: 'Open Card title editing' });
    const openGroup = openSpecimen.getByTestId('card-group');
    await expect(openGroup.getByRole('heading', { name: 'Open Card body' })).toBeVisible();
    await openGroup.getByRole('button', { name: 'Edit Title Draft entry' }).click();
    await expect(openGroup.getByRole('textbox', { name: 'Card title' })).toBeFocused();
    await expect(openGroup.getByRole('heading', { name: 'Open Card body' })).toBeVisible();
  },
);
