import { expect, test, type Locator, type Page } from '@playwright/test';
import { resourceToolbar, selectResource } from '../e2e/graph';

const specimen = (page: Page, label: string): Locator =>
  page.locator('.inv-specimen', {
    has: page.locator('.inv-specimen__label', { hasText: new RegExp(`^${label}$`) }),
  });

test(
  'rest, selected and dragging draw visually distinct treatments, for both fronts',
  { tag: '@parity:canvas-resource-shows-rest-selected-and-dragging-states' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--states&mode=preview');

    const rest = specimen(page, 'resource · rest').getByRole('article');
    const selected = specimen(page, 'resource · selected').getByRole('article');
    const dragging = specimen(page, 'resource · dragging').getByRole('article');

    await expect(rest).toHaveAttribute('data-state', 'rest');
    await expect(selected).toHaveAttribute('data-state', 'selected');
    await expect(dragging).toHaveAttribute('data-state', 'dragging');

    // Rest draws no shadow; selected rings it; dragging offsets and rotates it.
    expect(await rest.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
    expect(await selected.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
    expect(await dragging.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');

    // A Reference Resource's dotted border solidifies once it leaves rest, same as a Resource's shadow.
    await expect(specimen(page, 'reference · rest').getByRole('article')).toHaveCSS(
      'border-style',
      'dotted',
    );
    await expect(specimen(page, 'reference · selected').getByRole('article')).toHaveCSS(
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
  { label: 'markdown', kind: 'markdown', glyph: 'Markdown Resource', border: 'solid' },
  { label: 'reference', kind: 'reference', glyph: 'Reference Resource', border: 'dotted' },
  { label: 'space', kind: 'space', glyph: 'Space Resource', border: 'solid' },
  // The creation ghost is not a Resource and takes the Markdown treatment, which is
  // why it is checked against the Markdown kind and glyph rather than its own.
  { label: 'creation ghost', kind: 'markdown', glyph: 'Markdown Resource', border: 'solid' },
] as const;

const ONE_LINE = ['Strategies'];
const THREE_LINES = ['Strategies', 'no strategy is privileged', 'grid is one member of a set'];

/** The roles of a Resource's drawn Title Lines, in the order they are drawn. */
const rolesOf = (lines: Locator): Promise<readonly (string | null)[]> =>
  lines.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-role')));

/** The resolved font size of each drawn Title Line, in pixels. */
const sizesOf = (lines: Locator): Promise<readonly number[]> =>
  lines.evaluateAll((elements) =>
    elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  );

/**
 * The whole of what a Resource front draws, and the whole of what it does not.
 *
 * This is the one place that states it. Every other Resource story is a slice —
 * states, kinds, hover, colours, opening, resizing — and two undecided elements
 * lived on the front for months because the slice that drew them was not the
 * slice anyone reviewed. So the assertions below are deliberately exhaustive
 * over the Resource's own box: the border, one element per Title Line at the
 * role the domain gave it, its kind glyph, and **nothing beneath the Title** — no
 * second line the application writes on the author's behalf, and no text on the
 * Resource that is not one of the Title Lines the author typed.
 */
test(
  'every Resource front draws its kind, its border and its Title Lines, and nothing beneath them',
  { tag: '@parity:canvas-resource-front-draws-only-its-title-lines' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--front&mode=preview');

    for (const front of FRONTS) {
      for (const [suffix, expected] of [
        ['one line', ONE_LINE],
        ['three lines', THREE_LINES],
      ] as const) {
        const resource = specimen(page, `${front.label} · ${suffix}`).getByRole('article');
        await expect(resource).toHaveAttribute('data-kind', front.kind);
        await expect(resource).toHaveAttribute('data-state', 'rest');
        await expect(resource).toHaveAttribute('data-expanded', 'false');
        await expect(resource.getByRole('img', { name: front.glyph })).toBeVisible();
        await expect(resource.getByTestId('canvas-resource-actions')).toHaveCount(0);
        await expect(resource).toHaveCSS('border-style', front.border);

        // One block element per Title Line, carrying the role `titleLines` gave
        // it — and exactly as many as the author typed.
        const lines = resource.locator('.canvas-resource__title-line');
        await expect(lines).toHaveCount(expected.length);
        expect(await lines.allInnerTexts()).toEqual([...expected]);
        expect(await rolesOf(lines)).toEqual(
          expected.length === 1 ? ['title'] : ['title', 'subtitle', 'caption'],
        );

        // Nothing beneath the Title. The heading is the only element in the body,
        // no content surface is mounted on a closed Resource, and the Resource's own
        // text is the Title Lines and nothing else — which is what the two
        // undecided reference lines would fail.
        await expect(resource.locator('.canvas-resource__body > *')).toHaveCount(1);
        await expect(
          resource.locator('.canvas-resource__body > .canvas-resource__title'),
        ).toHaveCount(1);
        await expect(resource.locator('.canvas-resource__content')).toHaveCount(0);
        const text = (await resource.innerText())
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
    const rungs = await sizesOf(ladder.locator('.canvas-resource__title-line'));
    expect(rungs[0]! > rungs[1]!).toBe(true);
    expect(rungs[1]! > rungs[2]!).toBe(true);
  },
);

/**
 * The distinction ADR 0083 says a future reader is most likely to get wrong,
 * drawn side by side: a break the **author** typed starts a rung and a break the
 * **box** chose does not.
 */
// Untagged: the parity claim `canvas-resource-front-draws-only-its-title-lines`
// above already owns this story's evidence, and one claim takes exactly one
// Ladle test. This is the same story's second reading and needs no second claim.
test('a wrapped single-line Title stays one rung while an authored three-line Title draws three', async ({
  page,
}) => {
  await page.goto('/?story=components--resource--front&mode=preview');

  const wrapped = specimen(page, 'one Title Line, wrapped')
    .getByRole('article')
    .locator('.canvas-resource__title-line');
  const authored = specimen(page, 'three Title Lines, authored')
    .getByRole('article')
    .locator('.canvas-resource__title-line');

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
  "a Reference Resource front's dotted border and a long Markdown title's three-line clamp are the kind's own presentation",
  { tag: '@parity:canvas-resource-shows-kind-treatment' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--kinds&mode=preview');

    await expect(specimen(page, 'markdown').getByRole('article')).toHaveCSS(
      'border-style',
      'solid',
    );

    const reference = specimen(page, 'reference').getByRole('article');
    await expect(reference).toHaveCSS('border-style', 'dotted');

    const longTitle = specimen(page, 'markdown · long title').getByRole('heading');
    await expect(longTitle).toBeVisible();
    // Clamped to three lines (~60px at this type size) rather than growing
    // the resource to fit a title that overruns it.
    const box = await longTitle.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(80);

    // And the wrapping is *within* one Title Line, not a ladder (ADR 0083). A
    // break the box chose is not a break the author typed, so a long Title with
    // no newline in it stays a single `title`-role element however many visual
    // lines it takes — this is the specimen where the two can be told apart,
    // jsdom having no line boxes to wrap.
    const lines = longTitle.locator('.canvas-resource__title-line');
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

/**
 * **The inverse of the claim this story used to carry, across the same palette.**
 *
 * It proved the rail painted the exact colour its label advertised. The rail is
 * neutral now and the commands on it are the Command Dock's own surface
 * (`.scratch/command-dock/issues/12`), so what has to hold at every colour is
 * that the strip does *not* move — and that the colour is still on the Resource,
 * which is the half a "the band is gone" assertion on its own would not say.
 *
 * Every specimen is the real `ResourceNode`, drawn selected, so the commands and the
 * authoring handles are both up without a pointer.
 */
test(
  "a Resource's commands stay neutral across the full palette while its handles carry the colour",
  { tag: '@parity:canvas-resource-toolbar-is-neutral-and-graph-colour-stays-on-connections' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--colours&mode=preview');

    const specimens = page.locator('.inv-specimen');
    await expect(specimens.first()).toBeVisible();
    const count = await specimens.count();
    expect(count).toBeGreaterThan(1);

    const surfaces = new Set<string>();
    for (let index = 0; index < count; index += 1) {
      const item = specimens.nth(index);
      const label = (await item.locator('.inv-specimen__label').innerText()).trim();
      // Resolve the label's own hex text through the browser's colour parser
      // rather than hand-computing rgb(), so this compares against exactly the
      // colour the label advertises.
      const expectedColor = await page.evaluate((hex) => {
        const probe = document.createElement('div');
        probe.style.color = hex;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      }, label);

      // The band behind the commands paints nothing at all.
      await expect(item.locator('.canvas-resource__rail')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
      const commands = item.getByTestId('canvas-resource-actions');
      await expect(commands).toHaveCSS('opacity', '1');
      const surface = await commands.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(surface).not.toBe(expectedColor);
      surfaces.add(surface);

      // And the colour is where it identifies a Graph: the points an Edge of it
      // leaves the Resource from.
      const handle = item.locator('.rf-resource-node__authoring-handle--source').first();
      await expect(handle).toHaveCSS('opacity', '1');
      await expect(handle).toHaveCSS('background-color', expectedColor);
    }
    // One surface, not six that each happen not to be their own Graph's colour.
    expect([...surfaces]).toHaveLength(1);
  },
);

test(
  "hovering the real React Flow node reveals the adapter's Edge handles and none of CanvasResource's commands; selecting it draws them",
  { tag: '@parity:canvas-resource-hover-reveals-handles-and-selection-draws-commands' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--hover&mode=preview');

    const hovered = specimen(page, 'hover to show Edge handles, select to show commands');
    const node = hovered.locator('.react-flow__node');
    // Scoped to this specimen's canvas: the specimens beside it draw the same
    // placement, selected, and `NodeToolbar` portals into its own renderer.
    const toolbar = hovered.locator('[data-resource-rail-for]');
    const handle = node.locator('.rf-resource-node__authoring-handle--source').first();

    await page.mouse.move(0, 0);
    await expect(toolbar).toHaveCount(0);
    await expect(handle).toHaveCSS('opacity', '0');

    await node.hover({ position: { x: 10, y: 10 } });
    await expect(handle).toHaveCSS('opacity', '1');
    await expect(toolbar).toHaveCount(0);
    await expect(node.getByTestId('canvas-resource-actions')).toHaveCount(0);

    await selectResource(node);
    // Drawn by `NodeToolbar`, portalled out of the node into React Flow's renderer.
    await expect(toolbar.getByTestId('canvas-resource-actions')).toBeVisible();
    await expect(node.getByTestId('canvas-resource-actions')).toHaveCount(0);
    expect(
      await toolbar.evaluate((element) => element.closest('.react-flow__renderer') !== null),
    ).toBe(true);
  },
);

/**
 * The withdrawal is asserted mid-gesture, with the pointer still down, because
 * that is the only moment it is about: released, the Resource is hovered and
 * Selected and every affordance is owed again. The two reads after `mouse.up`
 * are that other half — the same pointer, on the same Resource, revealing what the
 * drag withheld.
 */
test(
  'a Resource being moved returns its chrome to rest, and release reveals it again',
  { tag: '@parity:dragged-resource-returns-its-chrome-to-rest' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--drag&mode=preview');

    const node = specimen(page, 'drag to return the chrome to rest').locator('.react-flow__node');
    const inner = node.locator('.rf-resource-node__inner');
    const actions = (await resourceToolbar(page, node)).getByTestId('canvas-resource-actions');
    const handle = node.locator('.rf-resource-node__authoring-handle--source').first();

    const box = await node.boundingBox();
    if (box === null) throw new Error('The draggable Resource was not drawn');
    // The Title band rather than the middle: a press on the body is still a
    // drag, and grabbing where an author grabs keeps the pointer clear of the
    // handles the assertions are about.
    const from = { x: box.x + box.width / 2, y: box.y + 12 };
    await page.mouse.move(from.x, from.y);
    await expect(handle).toHaveCSS('opacity', '1');
    await page.mouse.down();
    // React Flow begins the drag on the first move past `nodeDragThreshold`, so
    // the travel is stepped rather than jumped — a single move can be swallowed
    // and would leave every assertion below reading a Resource at rest.
    await page.mouse.move(from.x + 20, from.y + 16, { steps: 4 });
    await page.mouse.move(from.x + 40, from.y + 32, { steps: 4 });

    // Being moved, hovered and Selected all at once — and drawn as dragging.
    await expect(inner).toHaveAttribute('data-dragging', 'true');
    await expect(inner).toHaveAttribute('data-selected', 'true');
    await expect(node.getByRole('article')).toHaveAttribute('data-state', 'dragging');
    await expect(handle).toHaveCSS('opacity', '0');
    // `ResourceNode` does not draw its toolbar while the Resource is dragged, so
    // the commands are absent rather than hidden.
    await expect(actions).toHaveCount(0);
    // The anchors are not the rail's case. They stay mounted throughout, because
    // React Flow measures a handle and one that is not there reports nothing to
    // attach an Edge to.
    await expect(node.locator('.rf-resource-node__authoring-handle')).toHaveCount(8);
    await expect(handle).not.toHaveCSS('display', 'none');

    await page.mouse.up();

    await expect(inner).toHaveAttribute('data-dragging', 'false');
    // The drag Selected the Resource, so its toolbar is drawn again on release.
    await expect(node).toHaveClass(/\bselected\b/);
    await expect(actions).toBeVisible();
    await expect(handle).toHaveCSS('opacity', '1');
    await page.mouse.move(0, 0);
    await node.hover({ position: { x: 10, y: 10 } });
    await expect(handle).toHaveCSS('opacity', '1');
  },
);

test('a read-only Resource owns the absence of authoring affordances', async ({ page }) => {
  await page.goto('/?story=components--resource--hover&mode=preview');

  const node = specimen(page, 'read-only · no authoring affordances').locator('.react-flow__node');
  await node.hover();

  await expect(node.getByTestId('canvas-resource-actions')).toHaveCount(0);
  await expect(node.getByRole('button', { name: /^Edit Title / })).toHaveCount(0);
  // The four sides stay, because they are anchors before they are affordances
  // and an Edge attaches to one (ADR 0087). What read-only withholds is the
  // reveal: unlabelled, `opacity: 0` under the pointer, and nothing a drag can
  // take hold of.
  await expect(node.locator('.rf-resource-node__authoring-handle')).toHaveCount(8);
  await expect(node.getByRole('button', { name: /^Connect (from|to) / })).toHaveCount(0);
  await expect(node.locator('.rf-resource-node__authoring-handle').first()).toHaveCSS(
    'opacity',
    '0',
  );
});

test(
  'production Canvas Resources expose Reference Resource identity and keyboard-focusable actions',
  { tag: '@parity:canvas-resource-exposes-kind-and-keyboard-actions' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--actions&mode=preview');

    const reference = page.getByRole('article', { name: 'Opening, again' });
    await expect(reference.getByRole('img', { name: 'Reference Resource' })).toBeVisible();

    const markdown = page.getByRole('article', { name: 'Strategies' });
    const actions = markdown.getByTestId('canvas-resource-actions');
    const open = page.getByRole('button', { name: 'Open Resource Strategies' });
    // Mounted without React Flow, the component draws its toolbar inline in the
    // rail band, and the pointer reveals nothing: it is drawn at rest.
    await page.mouse.move(0, 0);
    await expect(actions).toBeVisible();
    await expect(open).toBeVisible();

    const title = markdown.getByRole('heading', { name: 'Strategies' });
    const titleTreatment = async () => {
      const titleBox = await title.boundingBox();
      const resourceBox = await markdown.boundingBox();
      if (titleBox === null || resourceBox === null)
        throw new Error('Resource title geometry unavailable');
      return {
        left: titleBox.x - resourceBox.x,
        bottom: resourceBox.y + resourceBox.height - (titleBox.y + titleBox.height),
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
    await expect(page.getByRole('button', { name: 'Close Resource Strategies' })).toBeVisible();
    await expect.poll(() => titleTreatment()).toEqual(closedTitleTreatment);
  },
);

test('reduced motion removes Resource content transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?story=components--resource--open-and-close&mode=preview');

  const resource = page
    .getByRole('region', { name: 'Long Markdown Resource' })
    .getByRole('article');
  const content = resource.locator('.canvas-resource__content');

  await expect(content).toHaveCSS('transition-duration', '0s');
  await expect(content).toHaveCSS('transition-delay', '0s');
});

test(
  "the Resource's Title control begins editing by pointer or keyboard, stays field-local on a refusal, and completes or cancels from the keyboard",
  { tag: '@parity:canvas-resource-owns-title-editing-and-refusal' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--editing--title&mode=preview');

    const closedSpecimen = page.getByRole('region', { name: 'Closed Resource title editing' });
    const group = closedSpecimen.getByTestId('resource-group');
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
    //
    // On the **laddered** specimen, because a single-line Title cannot tell the
    // arrangements apart: `Edit Title <name>` and the heading's own name are
    // then the same string, and an implementation that drew the name and
    // dropped every line after it reads as correct — which is exactly the
    // regression ADR 0083's sentence about the Resource front's own heading exists
    // to prevent. The separator is one space per line because each Title Line
    // is its own block box, which is the name computation's rule and not this
    // test's.
    const ladderGroup = page
      .getByRole('region', { name: 'Laddered Resource title editing' })
      .getByTestId('resource-group');
    const ladderControl = ladderGroup.getByRole('button', { name: 'Edit Title Auth' });
    const ladderHeading = ladderGroup.getByRole('heading');
    await expect(ladderControl).toHaveAccessibleName('Edit Title Auth');
    await expect(ladderHeading).toHaveAccessibleName('Auth how tokens are minted draft, 2026');
    expect(await ladderHeading.evaluate((element) => element.closest('button') !== null)).toBe(
      true,
    );

    // And the same control on the single-line Title, where the two names
    // coincide — the arrangement is one rule and does not change with the
    // number of lines.
    await expect(control).toHaveAccessibleName('Edit Title Draft entry');
    await expect(heading).toHaveAccessibleName('Draft entry');
    expect(await heading.evaluate((element) => element.closest('button') !== null)).toBe(true);

    await control.hover();
    // The pointer is on the control, but the treatment is the Title's box:
    // `canvas-resource.css` draws it on `.canvas-resource__title:has(…__title-control:hover)`
    // so the tint and rule span the whole Title rather than the text's own box.
    const titleBand = group.locator('.canvas-resource__title');
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

    const input = page.getByRole('textbox', { name: 'Resource title' });
    await expect(input).toBeFocused();
    const inputBox = await input.boundingBox();
    expect(inputBox?.x).toBeCloseTo(titleBox?.x ?? 0, 0);
    expect(inputBox?.y).toBeCloseTo(titleBox?.y ?? 0, 0);
    await expect(input).toHaveJSProperty('selectionStart', 0);
    await expect(input).toHaveJSProperty('selectionEnd', 'Draft entry'.length);

    // A refused draft keeps the editor open and the error attached to the field.
    await input.fill('');
    await input.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('A Resource title is required.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toBeFocused();

    // A valid Enter completes the draft and hands focus back to the Resource.
    await input.fill('Named entry');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: 'Named entry' })).toBeVisible();
    await expect(group).toBeFocused();

    // Enter on the displayed Title is native button activation.
    const renamedControl = page.getByRole('button', { name: 'Edit Title Named entry' });
    await renamedControl.focus();
    await renamedControl.press('Enter');
    const reopened = page.getByRole('textbox', { name: 'Resource title' });
    await reopened.fill('Abandoned');
    await reopened.press('Escape');
    await expect(page.getByRole('heading', { name: 'Named entry' })).toBeVisible();
    await expect(group).toBeFocused();

    // Space is the equivalent native activation and Escape still cancels.
    const spaceControl = page.getByRole('button', { name: 'Edit Title Named entry' });
    await spaceControl.focus();
    await spaceControl.press('Space');
    await page.getByRole('textbox', { name: 'Resource title' }).press('Escape');
    await expect(group).toBeFocused();

    // The dedicated Title story also proves that opening a Resource does not
    // introduce a second title editor or hide the Resource body while it runs.
    const openSpecimen = page.getByRole('region', { name: 'Open Resource title editing' });
    const openGroup = openSpecimen.getByTestId('resource-group');
    await expect(openGroup.getByRole('heading', { name: 'Open Resource body' })).toBeVisible();
    await openGroup.getByRole('button', { name: 'Edit Title Draft entry' }).click();
    await expect(openGroup.getByRole('textbox', { name: 'Resource title' })).toBeFocused();
    await expect(openGroup.getByRole('heading', { name: 'Open Resource body' })).toBeVisible();
  },
);

/**
 * A Title is clamped to the room available and never accommodated (ADR 0014,
 * ADR 0083), and the field an author types it into is not exempt from that.
 *
 * The field grows with its content, which is the whole point of it, inside a
 * Resource whose height is authored. Uncapped, the fifth line took the Resource's own
 * rail with it: the body is bottom-pinned, so it grows *upward*, and the rail
 * above it was pushed out of the top of the Resource and clipped away by the Resource's
 * `overflow: hidden` — the kind glyph, the Actions menu and Open all gone while
 * the author was still typing the name.
 *
 * A browser test and not a stylesheet one, because what is being asserted is
 * where the boxes end up rather than which declaration put them there; the
 * declarations themselves are held by
 * `packages/ui/test/canvas-resource-title-ladder.test.ts`.
 */
test('a Title being written on more lines than fit does not push the rail out of its Resource', async ({
  page,
}) => {
  await page.goto('/?story=components--resource--editing--title&mode=preview');

  const group = page
    .getByRole('region', { name: 'Laddered Resource title editing' })
    .getByTestId('resource-group');
  const resource = group.locator('.canvas-resource');
  const rail = group.locator('.resource-rail');
  await group.getByRole('button', { name: 'Edit Title Auth' }).click();

  const field = page.getByRole('textbox', { name: 'Resource title' });
  await expect(field).toBeFocused();

  /** The field's drawn height, and whether the rail is still inside the Resource. */
  const geometry = async () => {
    const resourceBox = await resource.boundingBox();
    const railBox = await rail.boundingBox();
    const fieldBox = await field.boundingBox();
    if (resourceBox === null || railBox === null || fieldBox === null) {
      throw new Error('Resource geometry unavailable');
    }
    return {
      fieldHeight: Math.round(fieldBox.height),
      // The border, which the rail sits inside of. A rail pushed above it is
      // not merely misplaced, it is clipped.
      railAboveResource: railBox.y < resourceBox.y,
    };
  };

  // Four lines is the ladder's ceiling, and the field draws all four.
  await field.fill('Auth\nhow tokens are minted\ndraft, 2026\nand a fourth');
  const atCeiling = await geometry();
  expect(atCeiling.railAboveResource).toBe(false);

  // The sixth line is where the field used to take the rail with it. It stops
  // at the same height instead, and the lines past the ceiling are reachable by
  // scrolling rather than lost.
  await field.fill(
    'Auth\nhow tokens are minted\ndraft, 2026\nand a fourth\nand a fifth\nand a sixth',
  );
  const pastCeiling = await geometry();
  expect(pastCeiling.railAboveResource).toBe(false);
  expect(pastCeiling.fieldHeight).toBe(atCeiling.fieldHeight);
  expect(await field.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
});

test(
  'a Space Resource offers Enter in its entity menu',
  { tag: '@parity:space-resource-offers-enter' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--enter-space&mode=preview');

    await page.getByRole('button', { name: 'Actions for Resource Architecture' }).click();
    const enter = page.getByRole('menuitem', { name: 'Enter', exact: true });
    await expect(enter).toBeVisible();
    await expect(page.getByTestId('enter-report')).toHaveText('Not entered.');
    await enter.click();
    await expect(page.getByTestId('enter-report')).toHaveText('Entered Architecture.');
  },
);

test(
  'a Space Resource offers the target Space’s own address and opens it independently',
  { tag: '@parity:space-resource-opens-independently' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--open-independently&mode=preview');

    await page.getByRole('button', { name: 'Actions for Resource Architecture' }).click();
    await expect(page.getByRole('menuitem', { name: /^Copy link to Space/ })).toBeVisible();
    await expect(page.getByTestId('independent-open-report')).toHaveText('Not sent.');
    await page.getByRole('menuitem', { name: /^Open in New Tab/ }).click();
    await expect(page.getByTestId('independent-open-report')).toHaveText(
      'Sent space 00000000-0000-4000-8000-000000000020 to a new tab.',
    );
  },
);
