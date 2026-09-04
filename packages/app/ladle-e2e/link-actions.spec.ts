import { expect, test } from '@playwright/test';

/**
 * The entity-actions menu, in a real browser, because jsdom cannot fail this.
 *
 * `fireEvent.click` fires `click` alone. A real press is a pointerdown, a
 * mousedown, a focus, a mouseup and then a click, and it was the second half
 * that broke this: with `SidebarMenuAction` dropping the ref Base UI's
 * `Menu.Trigger` gave it, the trigger had no element, so the dismissal could
 * not attribute the press to a trigger and closed the menu that press had just
 * opened. The unit test in `packages/ui/test/Sidebar.test.tsx` holds the ref
 * itself; this holds what a person actually does.
 *
 * The Sidebar tests below press the **stable** `Space/Space` story, because
 * production supplies `entityActions` now and the real Sidebar draws the real
 * menu there. `Review/Link Actions` keeps only the Card rail, which no Card on
 * a canvas can reach until `CardNode` passes the actions through.
 */
test(
  'a Sidebar row opens one menu from its trailing icon and from a right click',
  { tag: '@parity:space-sidebar-entity-actions-menu' },
  async ({ page }) => {
    await page.goto('/?story=space--space--settled&mode=preview');

    const row = page.getByRole('button', { name: 'Collection 1', exact: true });
    await expect(row).toBeVisible();
    await row.hover();

    // `delay` is the whole test. A default Playwright click puts mousedown and
    // mouseup in the same tick, and the dismissal that this regressed on never
    // gets a turn between them — the spec passed against the broken build until
    // this was added. A person's press is tens of milliseconds long.
    await page
      .getByRole('button', { name: 'Actions for Layout Collection 1' })
      .click({ delay: 120 });

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Delete Layout' })).toBeVisible();

    // Still open a beat later: a trigger whose ref was dropped opens and is
    // dismissed by its own press, which is fast enough to read as "nothing
    // happened" and slow enough that an immediate assertion would pass.
    await page.waitForTimeout(250);
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');

    // The accelerator, opening the identical list — which is `EntityActionItems`'
    // doing rather than two lists kept in step.
    await row.click({ button: 'right' });
    const contextMenu = page.getByRole('menu');
    await expect(contextMenu.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
    await expect(contextMenu.getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
    await expect(contextMenu.getByRole('menuitem', { name: 'Delete Layout' })).toBeVisible();
  },
);

/**
 * The Space's own title carries the menu too, and offers exactly one command.
 *
 * A Space has one address, so there is nothing for a permanent link to differ
 * from, and production has no Space rename — both are absent rather than shown
 * and refused.
 */
test('the Space title offers its one address and no rename', async ({ page }) => {
  await page.goto('/?story=space--space--settled&mode=preview');

  await page.getByTestId('space-title').hover();
  await page.getByRole('button', { name: 'Actions for Space Space' }).click({ delay: 120 });

  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveCount(1);
  await expect(menu.getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
});

/**
 * A copy confirms by swapping the item's own label, without the menu closing —
 * which is why no copy command dismisses the mobile sheet either.
 */
test('a copy command confirms in the menu it was pressed in', async ({ page }) => {
  await page.goto('/?story=space--space--settled&mode=preview');

  await page.getByRole('button', { name: 'Long', exact: true }).hover();
  await page.getByRole('button', { name: 'Actions for Graph Long' }).click({ delay: 120 });
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: /^Copy link/ }).click();

  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copied' })).toBeVisible();
});

test('a Card rail opens its actions menu from the link control', async ({ page }) => {
  await page.goto('/?story=review--link-actions--card-rail&mode=preview');

  await page.getByRole('button', { name: 'Actions for Card Card 2' }).click({ delay: 120 });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Copy link/ }).click();
  await expect(page.getByText(/Copied → .*\/views\/AAAAAAAAQACAAAAAAAAAIA\/cards\//)).toBeVisible();
});

test('a Card opens the same actions menu from a right click', async ({ page }) => {
  await page.goto('/?story=review--link-actions--card-rail&mode=preview');

  await page.getByRole('article', { name: 'Card 2' }).click({ button: 'right' });

  const menu = page.getByRole('menu');
  // No Rename: a Card's title is renamed in place on its Front, so the menu
  // production would supply here holds its two addresses and nothing else.
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Copy permanent link/ })).toBeVisible();
});
