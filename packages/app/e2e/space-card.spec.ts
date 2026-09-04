import { expect, test } from './fixtures';
import { nodeByTitle, selectCanvas, settled } from './graph';

/**
 * Authoring a Space Card through the application, over HTTP and a real
 * repository.
 *
 * Creating one is not an ordinary completed Edit: the create path brings a
 * second Space into existence and the reference path writes a Card naming one,
 * and both are one atomic Edit over coordinated per-Space sessions (ADR 0076).
 * So what these tests are really proving is that the coordinated Edit lands
 * through the same boundary every other Edit does — one revision on the
 * containing Space, no partial state on the canvas.
 */

/**
 * The whole creation gesture, from the menu to the Card on the canvas.
 *
 * The title is typed on the pane rather than into an inline editor afterwards,
 * which is the visible difference from Add Card and Add Alias: those two mint a
 * Card and hand the caret to it, and this one cannot, because the lifecycle
 * answers a completed Edit and not the identity it created.
 */
test(
  'adding a Space Card creates its Space and places the Card that references it',
  { tag: '@parity:new-space-card-completes-on-a-labelled-create' },
  async ({ page }) => {
    await page.goto('/');
    await selectCanvas(page, 'Collection 1');
    await expect(nodeByTitle(page, 'A').first()).toBeVisible();
    await settled(page);
    const nodes = await page.locator('.react-flow__node').count();

    await page.getByTestId('add-card-menu').click();
    await page.getByRole('menuitem', { name: 'Add Space Card' }).click();

    const pane = page.getByTestId('new-space-card');
    const create = pane.getByRole('button', { name: 'Create' });
    // The completion waits on the title, because the target never needs
    // choosing: a new Space is always available and is the default row.
    await expect(create).toBeDisabled();
    await expect(pane.getByRole('combobox', { name: 'Space' })).toHaveText('A new Space');

    await page.getByTestId('new-space-card-title').fill('Architecture');
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page.getByTestId('new-space-card')).toHaveCount(0);
    await settled(page);
    await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
    await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
    // The target Space's name, drawn on the Card beside the Card's own title —
    // they begin equal and are renamed independently from here.
    await expect(nodeByTitle(page, 'Architecture').getByTestId('space-marker')).toHaveText(
      'Architecture',
    );
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  },
);

/**
 * The second Space Card is offered the first's Space, and referencing it is not
 * a copy.
 *
 * Two Cards showing one Space is the convergence ADR 0074 permits, and it is
 * what makes the reference count — rather than a single owner — the thing that
 * decides when a Space is deleted.
 */
test('a second Space Card may reference the Space the first one created', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture');
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture again');
  await page.getByRole('combobox', { name: 'Space' }).click();
  await page.getByRole('option', { name: 'Architecture' }).click();
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();

  await expect(page.getByTestId('new-space-card')).toHaveCount(0);
  await settled(page);
  // Both Cards name the same Space, and only one Space was ever created — the
  // second Card is a second way to reach it rather than a second copy of it.
  await expect(nodeByTitle(page, 'Architecture again').getByTestId('space-marker')).toHaveText(
    'Architecture',
  );
  await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '2');
});

/**
 * Opening a Space Card exposes the target's context and the selections the Card
 * authors — and nothing that would change the Space it points at.
 *
 * A created target Space is complete (ADR 0080): the one Space initializer gives
 * it an authored default Layout and one empty Active Graph, so its selectors
 * offer that Layout and its Graph rather than opening onto nothing. The Card has
 * chosen neither yet — storing the target's default Layout and Graph on the Card
 * at creation is `layout-only-v1/04`.
 */
test('an Open Space Card shows its target and offers no way to change it', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture');
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  // Opened from the keyboard rather than from the Card's own control, because
  // the created Card is placed at the visible centre and the fixture already
  // has a Card there — a deliberate partial overlap (`freeAnchor` steps only on
  // an exact collision), which leaves the rail under another node's box. Enter
  // on the focused node is the same `opened-card` completion the control runs.
  const card = nodeByTitle(page, 'Architecture');
  await card.focus();
  await card.press('Enter');

  await expect(card.getByTestId('space-marker')).toHaveText('Architecture');
  // Enabled rather than merely present: a selector over a target with nothing
  // to choose is disabled, so this is what says the created Space arrived
  // complete rather than blank.
  const layoutSelector = card.getByTestId('space-card-layout');
  await expect(layoutSelector).toBeEnabled();
  await expect(layoutSelector).toHaveText('No Layout');
  await layoutSelector.click();
  await expect(page.getByRole('option', { name: 'Layout 1' })).toBeVisible();
  await page.getByRole('option', { name: 'Layout 1' }).click();
  await settled(page);
  await expect(layoutSelector).toHaveText('Layout 1');
  await expect(card.getByTestId('space-card-graph')).toHaveText('Graph 1');
  // A Space Card has no content of its own, so the rail offers Close Card and
  // no Edit Card — the target Space is authored by entering it, not from out
  // here. Editing the *Title* is untouched: that is this Card's own, and the
  // rail's Edit Title control is the one button whose name matches loosely.
  await expect(card.getByRole('button', { name: 'Close Card Architecture' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Edit Card Architecture' })).toHaveCount(0);
});

/**
 * Deleting a Space Card says what it destroys before it is confirmed.
 *
 * V1 has no undo and the cascade can reach Spaces that are not on screen, so
 * the confirmation naming that is the thing standing in place of a refusal
 * (ADR 0074). Deleting the only reference takes its Space with it, which is
 * what leaves the Space count where it started.
 */
test('deleting the last Space Card deletes the Space it referenced', async ({ page }) => {
  await page.goto('/');
  await selectCanvas(page, 'Collection 1');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await settled(page);
  const nodes = await page.locator('.react-flow__node').count();

  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByTestId('new-space-card-title').fill('Architecture');
  await page.getByTestId('new-space-card').getByRole('button', { name: 'Create' }).click();
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(1);
  await settled(page);

  // No click selects it: a completed creation leaves the Card it made selected,
  // exactly as Add Card and Add Alias do, so Delete Card already names it.
  await page.getByRole('button', { name: 'Delete Card Architecture' }).click();
  await expect(
    page.getByText(
      'If it is the last reference to its Space, that Space is deleted with it, along with every Space below it that nothing else references.',
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete Card', exact: true }).click();

  await settled(page);
  await expect(nodeByTitle(page, 'Architecture')).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes);

  // The Space went with it, so a second Space Card is offered no existing Space
  // to reference — which is the only way this surface can see the cascade.
  await page.getByTestId('add-card-menu').click();
  await page.getByRole('menuitem', { name: 'Add Space Card' }).click();
  await page.getByRole('combobox', { name: 'Space' }).click();
  await expect(page.getByRole('option', { name: 'Architecture' })).toHaveCount(0);
});
