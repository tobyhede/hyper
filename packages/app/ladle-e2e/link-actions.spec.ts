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
 * `Review/Link Actions` is a review story and carries no ADR 0052 parity claim
 * — nothing in the application supplies `entityActions` yet. It is still the
 * only place the real `SpaceSidebar` and the real `CanvasCard` draw this menu,
 * so it is where the behaviour is proven until production reaches it.
 */
test('a Sidebar row opens its actions menu from the trailing icon', async ({ page }) => {
  await page.goto('/?story=review--link-actions--sidebar&mode=preview');

  const row = page.getByRole('button', { name: 'Collection 1', exact: true });
  await expect(row).toBeVisible();
  await row.hover();

  // `delay` is the whole test. A default Playwright click puts mousedown and
  // mouseup in the same tick, and the dismissal that this regressed on never
  // gets a turn between them — the spec passed against the broken build until
  // this was added. A person's press is tens of milliseconds long.
  await page.getByRole('button', { name: 'Actions for Layout Collection 1' }).click({ delay: 120 });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();

  // Still open a beat later: a trigger whose ref was dropped opens and is
  // dismissed by its own press, which is fast enough to read as "nothing
  // happened" and slow enough that an immediate assertion would pass.
  await page.waitForTimeout(250);
  await expect(menu).toBeVisible();
});

test('a Sidebar row opens the same menu from a right click', async ({ page }) => {
  await page.goto('/?story=review--link-actions--sidebar&mode=preview');

  const row = page.getByRole('button', { name: 'Collection 1', exact: true });
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });

  await expect(page.getByRole('menu').getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
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
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
});

test('a Graph contextual link uses the selected Layout', async ({ page }) => {
  await page.goto('/?story=review--link-actions--sidebar&mode=preview');

  await page.getByRole('button', { name: 'Long', exact: true }).hover();
  await page.getByRole('button', { name: 'Actions for Graph Long' }).click();
  await page.getByRole('menuitem', { name: /^Copy link/ }).click();

  await expect(page.getByText(/Copied → .*AAAAAAAAQACAAAAAAAAAIA/)).toBeVisible();
});
