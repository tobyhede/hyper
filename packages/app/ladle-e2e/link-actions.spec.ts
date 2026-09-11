import { expect, test } from '@playwright/test';

/**
 * The entity-actions menu, in a real browser, because jsdom cannot fail this.
 *
 * `fireEvent.click` fires `click` alone. A real press is a pointerdown, a
 * mousedown, a focus, a mouseup and then a click, and it was the second half
 * that broke this: a trigger that dropped the ref Base UI's `Menu.Trigger` gave
 * it had no element, so the dismissal could not attribute the press to a
 * trigger and closed the menu that press had just opened.
 *
 * **The Sidebar rows this was written against are gone (ADR 0082).** Three
 * tests here pressed `Space/Space`, and the claim one of them carried —
 * `space-sidebar-entity-actions-menu` — described a menu "reached two ways from
 * a Sidebar row". The Command Dock has clusters rather than rows and no
 * `onContextMenu` anywhere, so that behaviour did not move: it belongs to the
 * Thing rail (ADR 0073), which is what the last two tests in this file press.
 * What is left of the Sidebar's half is the one thing the Dock still decides
 * about the Space's own menu — which address it offers, and that Rename is not a
 * row in it — restated below in the Dock's own words and untagged, the claim it
 * stood for having been retired rather than renamed.
 */

/**
 * The Space's own menu carries one address and no Rename row, and that is two
 * decisions rather than one.
 *
 * The address is the Space's **own**, and that is a departure rather than the
 * rule: a second address does exist — the drawing Diagram's, which is what
 * reproduces the screen and what the Graph cluster copies. The Space menu
 * deliberately does not offer it, because copying it would stop the Space's link
 * meaning the Space. Which of the two a Space title means is a product decision
 * `.scratch/link-ux` has not taken, so this holds the behaviour that stands
 * rather than a claim that no second address is possible.
 *
 * And no Rename row — which is no longer because there is no such Edit.
 * `space-authoring.ts` has `renamed-space` beside `renamed-diagram` and
 * `renamed-graph`, and the Dock draws the name itself as the control that runs
 * it. A row in this menu would open that same editor from a second place, which
 * is the duplication the Dock keeps removing, and it is the reason
 * `spaceEntityActions` is handed `onRename: null` by the application
 * (`entity-actions.tsx`). So the name beside this menu is a `button`, and the
 * menu it discloses is still Rename-free.
 */
test('the Space name renames while its menu carries one address and no Rename row', async ({
  page,
}) => {
  await page.goto('/?story=space--command-dock--default&mode=preview');

  const title = page.getByTestId('space-title').filter({ visible: true });
  await expect(title).toContainText('Rendering');
  await expect(title).toHaveJSProperty('tagName', 'BUTTON');
  await expect(page.getByRole('button', { name: 'Rename Space: Rendering' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rename Diagram: Collection 1' })).toBeVisible();

  // `delay` is the whole reason this test is in a browser: a default Playwright
  // click puts mousedown and mouseup in the same tick, and the dismissal that
  // this regressed on never gets a turn between them.
  await page.getByRole('button', { name: 'Space: Rendering' }).click({ delay: 120 });

  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /permanent/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);

  // Still open a beat later: a trigger whose ref was dropped opens and is
  // dismissed by its own press, which is fast enough to read as "nothing
  // happened" and slow enough that an immediate assertion would pass.
  await page.waitForTimeout(250);
  await expect(menu).toBeVisible();
});

/**
 * A copy confirms by swapping the item's own label, without the menu closing.
 *
 * **This is the Thing rail's and no longer the chrome's.** `EntityActionsMenu`
 * swaps a pressed item's words because the Sidebar's menus were drawn inside a
 * Sheet over the area a pinned notice renders in, and on a phone the reader
 * could not see the report any other way. The Command Dock has no Sheet and
 * covers nothing, so it reports through the application's standing notice
 * instead; the rail keeps the swap, being a menu on the canvas itself.
 */
test('a copy command confirms in the rail menu it was pressed in', async ({ page }) => {
  await page.goto('/?story=review--link-actions--thing-rail&mode=preview');

  await page.getByRole('button', { name: 'Actions for Thing Thing 2' }).click({ delay: 120 });
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: /^Copy permanent link/ }).click();

  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copied' })).toBeVisible();
});

test('a Thing rail opens its actions menu from the link control', async ({ page }) => {
  await page.goto('/?story=review--link-actions--thing-rail&mode=preview');

  await page.getByRole('button', { name: 'Actions for Thing Thing 2' }).click({ delay: 120 });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Copy link/ }).click();
  await expect(
    page.getByText(/Copied → .*\/diagrams\/AAAAAAAAQACAAAAAAAAAIA\/things\//),
  ).toBeVisible();
});

test('a Thing opens the same actions menu from a right click', async ({ page }) => {
  await page.goto('/?story=review--link-actions--thing-rail&mode=preview');

  await page.getByRole('article', { name: 'Thing 2' }).click({ button: 'right' });

  const menu = page.getByRole('menu');
  // No Rename: a Thing's title is renamed in place on its Front, so the menu
  // production would supply here holds its two addresses and nothing else.
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /^Copy link/ })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /^Copy permanent link/ })).toBeVisible();
});
