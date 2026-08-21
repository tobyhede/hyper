import { expect, test } from '@playwright/test';

/**
 * The selected Edge's controls and the canvas HUD, on the rendered stories.
 *
 * Ladle proves the control semantics: what the two buttons do, that Edit and
 * nothing else opens the editor, that a refused Card keeps its place disabled,
 * and that each refusal lands on the channel ADR 0057 assigns it. The spatial
 * half — these controls over the real routed Edge, gated on selection and the
 * Active Graph — is the application suite's, in `editing.spec.ts`.
 */

const story = (name: string): string => `/?story=${name}&mode=preview`;

test(
  'the selected Edge controls offer Edit and Delete, and open nothing on their own',
  { tag: '@parity:selected-edge-controls-offer-edit-and-delete' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--closed'));

    const edit = page.getByRole('button', { name: 'Edit this Edge' });
    await expect(edit).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();
    await expect(edit).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('edge-editor')).toHaveCount(0);

    // Reachable and operable from the keyboard alone, in the order they read.
    await edit.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeFocused();

    await edit.click();

    await expect(page.getByTestId('edge-editor')).toBeVisible();
    await expect(edit).toHaveAttribute('aria-expanded', 'true');
  },
);

test(
  'the endpoint editor names both endpoints and dismisses on Escape',
  { tag: '@parity:selected-edge-editor-shows-both-endpoints' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--endpoint-editor'));

    const from = page.getByRole('combobox', { name: 'From' });
    const to = page.getByRole('combobox', { name: 'To' });
    await expect(from).toHaveValue('Card 1');
    await expect(to).toHaveValue('Card 2');

    // Choosing a Card is the completion, and it settles the editor.
    await to.press('ArrowDown');
    await page.getByRole('option', { name: /Card 4/ }).click();

    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit this Edge' }).click();
    await expect(page.getByRole('combobox', { name: 'To' })).toHaveValue('Card 4');

    // Escape dismisses the open list first, then the editor above it — two
    // layers, one press each (ADR 0048).
    //
    // Each press waits on the state it is about to change. Without that the
    // sequence is a race the browser wins about one run in ten: `ArrowDown`
    // opens the list asynchronously, and both Base UI surfaces answer Escape
    // from a *document* keydown listener, so a second press issued before the
    // first has settled reaches a layer that has already gone.
    const reopened = page.getByRole('combobox', { name: 'To' });
    await reopened.press('ArrowDown');
    await expect(reopened).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');

    await expect(reopened).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('edge-editor')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
  },
);

test(
  'an ineligible endpoint keeps its place in the list, disabled, with its reason',
  { tag: '@parity:selected-edge-endpoint-refusal-disables-its-choice' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--disabled-choice'));

    await page.getByRole('combobox', { name: 'To' }).press('ArrowDown');

    const refused = page.getByRole('option', {
      name: /These Cards are already connected in this Graph/,
    });
    await expect(refused).toHaveAttribute('aria-disabled', 'true');
    await expect(refused).toContainText('Card 3');
    // Still offered rather than filtered out: an author searching for it finds
    // it, and finds out why it cannot be taken.
    await expect(page.getByRole('option')).toHaveCount(5);
  },
);

/*
 * Written out twice rather than looped, and that is the catalogue check's rule
 * rather than a preference: `scripts/ui-catalog.ts` reads a test's title and its
 * `tag` as *literals* off the syntax tree, so a computed title or a ternary tag
 * is evidence it cannot see at all.
 */
test(
  'a refused From endpoint marks only that Field and describes it',
  { tag: '@parity:selected-edge-from-refusal-is-field-local' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--from-refusal'));

    const attempted = page.getByRole('combobox', { name: 'From' });
    await expect(attempted).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('combobox', { name: 'To' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );

    // The sentence is reachable from the Field rather than merely near it.
    const describedBy = await attempted.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(
      'These Cards are already connected in this Graph.',
    );
    await expect(page.getByTestId('edge-endpoint-refusal')).toHaveCount(0);
  },
);

test(
  'a refused To endpoint marks only that Field and describes it',
  { tag: '@parity:selected-edge-to-refusal-is-field-local' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--to-refusal'));

    const attempted = page.getByRole('combobox', { name: 'To' });
    await expect(attempted).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('combobox', { name: 'From' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );

    const describedBy = await attempted.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText(
      'These Cards are already connected in this Graph.',
    );
    await expect(page.getByTestId('edge-endpoint-refusal')).toHaveCount(0);
  },
);

test(
  'a reconnection refusal no endpoint could correct uses the form channel',
  { tag: '@parity:selected-edge-stale-reconnection-uses-the-form-channel' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--reconnection-refusal'));

    await expect(page.getByTestId('edge-endpoint-refusal')).toHaveText(
      'That Edge is no longer in this Graph.',
    );
    // Neither Field is marked, because neither list holds a row that would
    // answer a Graph that no longer has this Edge.
    await expect(page.getByRole('combobox', { name: 'From' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    await expect(page.getByRole('combobox', { name: 'To' })).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    await expect(page.getByRole('alert')).toBeVisible();
  },
);

test(
  'a refused Delete stays on the controls that asked',
  { tag: '@parity:selected-edge-deletion-refusal-stays-on-its-controls' },
  async ({ page }) => {
    await page.goto(story('components--selected-edge-controls--deletion-refusal'));

    await expect(page.getByTestId('edge-delete-refusal')).toHaveText(
      'Select a Layout to edit its Edges.',
    );
    await expect(page.getByRole('alert')).toBeVisible();
    // Not an endpoint error in an editor nobody opened.
    await expect(page.getByTestId('edge-editor')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete this Edge' })).toBeVisible();
  },
);

/**
 * The HUD on a real canvas: React Flow's own MiniMap over nodes it measured.
 *
 * What the story fixes is the key beside it — every Graph the renderer draws,
 * each with its resolved colour, and exactly one emphasised. **Emphasis is not
 * filtering** (ADR 0040): the inactive Graphs stay listed and stay coloured.
 * That the emphasis *moves* with an activation, and that the Sidebar agrees
 * when it does, is the paired application evidence's claim — activation is the
 * Sidebar's command and a story-only button for it would prove nothing here.
 */
test(
  'the Graph HUD keys every Graph and emphasises the active one',
  { tag: '@parity:graph-hud-and-sidebar-agree-on-the-active-graph' },
  async ({ page }) => {
    await page.goto(story('surfaces--graph-hud--retained'));

    const key = page.getByTestId('graph-legend');
    const items = key.locator('.legend__item');
    await expect(items).toHaveCount(4);
    expect(await items.allInnerTexts()).toEqual(['Long', 'Mid', 'Short', 'Echo']);
    // The minimap is React Flow's own, drawing the nodes the flow measured —
    // the fixture supplies no substitute for it and no geometry of its own.
    await expect(page.locator('.react-flow__minimap')).toBeVisible();
    await expect(page.locator('.react-flow__minimap-node')).toHaveCount(5);

    // Exactly one, and the others are dimmed rather than dropped.
    await expect(key.locator('li[data-active="true"]')).toHaveCount(1);
    await expect(key.locator('li[data-active="true"]')).toHaveText('Long');
    await expect(key.locator('li[data-active="false"]')).toHaveCount(3);
    const stripes = await items
      .locator('[aria-hidden="true"]')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    expect(new Set(stripes).size).toBe(4);
  },
);
