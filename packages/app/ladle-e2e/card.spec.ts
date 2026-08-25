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
    await expect(alias.getByTestId('alias-marker')).toHaveText('Opening');

    const longTitle = specimen(page, 'markdown · long title').getByRole('heading');
    await expect(longTitle).toBeVisible();
    // Clamped to three lines (~60px at this type size) rather than growing
    // the card to fit a title that overruns it.
    const box = await longTitle.boundingBox();
    expect(box?.height ?? 0).toBeLessThan(80);
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

test(
  'production Canvas Cards expose Alias identity and keyboard-focusable actions',
  { tag: '@parity:canvas-card-exposes-kind-and-keyboard-actions' },
  async ({ page }) => {
    await page.goto('/?story=components--card--actions&mode=preview');

    const alias = page.getByRole('article', { name: 'Opening, again' });
    await expect(alias.getByRole('img', { name: 'Alias' })).toBeVisible();
    await expect(alias.getByTestId('alias-marker')).toHaveText('Opening');

    const markdown = page.getByRole('article', { name: 'Strategies' });
    const actions = markdown.getByTestId('canvas-card-actions');
    const open = page.getByRole('button', { name: 'Open Card Strategies' });
    // Hidden at rest and revealed on pointer hover, the same rule the actions
    // rail draws by everywhere it appears.
    await expect(actions).toHaveCSS('opacity', '0');
    await markdown.hover();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(open).toBeVisible();

    // Reachable and activatable from the keyboard alone, independent of hover.
    await open.focus();
    await expect(open).toBeFocused();
    await open.press('Enter');
    await expect(page.getByText('Strategies is open.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close Card Strategies' })).toBeVisible();
  },
);

test(
  "the Card's Title control begins editing by pointer or keyboard, stays field-local on a refusal, and completes or cancels from the keyboard",
  { tag: '@parity:canvas-card-owns-title-editing-and-refusal' },
  async ({ page }) => {
    await page.goto('/?story=components--card--editing--title&mode=preview');

    const group = page.getByTestId('card-group');
    const control = group.getByRole('button', { name: 'Edit Title Draft entry' });
    const heading = group.getByRole('heading', { name: 'Draft entry' });
    await expect(heading).toContainText('Draft entry', {
      timeout: 20_000,
    });
    await control.hover();
    // The pointer is on the control, but the treatment is the Title's:
    // `canvas-card.css` draws it on `.canvas-card__title:has(…__title-control:hover)`
    // so the tint and rule span the whole heading rather than the text's own box.
    await expect
      .poll(() => heading.evaluate((element) => getComputedStyle(element).boxShadow))
      .not.toBe('none');
    await expect
      .poll(() => heading.evaluate((element) => getComputedStyle(element).backgroundColor))
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
  },
);
