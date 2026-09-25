import { expect, test } from '@playwright/test';

/** Canonical Resource address — not the contextual Map one. */
const RESOURCE_COPY_LINK = /^Copy link to Resource(?! in Map)/;

/**
 * The entity-actions menu, in a real browser, because jsdom cannot fail this.
 *
 * `fireEvent.click` fires `click` alone. A real press is a pointerdown, a
 * mousedown, a focus, a mouseup and then a click, and the second half is where
 * a trigger that drops the ref Base UI's `Menu.Trigger` gives it breaks: with
 * no element, the dismissal cannot attribute the press to a trigger and closes
 * the menu that press has just opened.
 *
 * A menu reached two ways — its trigger and a right click — is the Resource
 * rail's (ADR 0073), which is what the last three tests in this file press, on
 * the stable `Components/Resource` rail story. The Command Dock has no
 * `onContextMenu`. For the Space's own menu, the test below holds the one
 * choice the Dock decides — which address it offers, and that Rename is a
 * command in it — untagged.
 */

/**
 * The Space's own menu carries one address, and that is a decision of its
 * own rather than a side-effect of Rename living here too.
 *
 * The address is the Space's **own**, and that is a departure rather than the
 * rule: a second address does exist — the drawing Map's, which is what
 * reproduces the screen and what the Graph cluster copies. The Space menu
 * deliberately does not offer it, because copying it would stop the Space's link
 * meaning the Space. Which of the two a Space title means is a product decision
 * `.scratch/link-ux` has not taken, so this holds the behaviour that stands
 * rather than a claim that no second address is possible.
 *
 * Rename sits in this menu with Copy link to Space — the name discloses, and
 * the editor is begun from the list.
 * `spaceEntityActions` is still handed `onRename: null` by the application
 * (`entity-actions.tsx`): that is the Resource rail's menu, not this cluster's.
 */
test('the Space cluster discloses from the name and offers one address plus Rename', async ({
  page,
}) => {
  await page.goto('/?story=space--command-dock--default&mode=preview');

  const title = page.getByTestId('space-title').filter({ visible: true });
  await expect(title).toContainText('Rendering');
  await expect(title).toHaveJSProperty('tagName', 'BUTTON');
  await expect(page.getByRole('button', { name: 'Space: Rendering', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Map: Collection 1', exact: true })).toBeVisible();

  // `delay` is the whole reason this test is in a browser: a default Playwright
  // click puts mousedown and mouseup in the same tick, and the dismissal never
  // gets a turn between them.
  await page.getByRole('button', { name: 'Space: Rendering', exact: true }).click({ delay: 120 });

  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copy link to Space' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /permanent/ })).toHaveCount(0);

  // Still open a beat later: a trigger whose ref was dropped opens and is
  // dismissed by its own press, which is fast enough to read as "nothing
  // happened" and slow enough that an immediate assertion would pass.
  await page.waitForTimeout(250);
  await expect(menu).toBeVisible();
});

/**
 * A copy confirms by swapping the item's own label, without the menu closing.
 *
 * **This is the Resource rail's, not the chrome's.** `EntityActionsMenu` swaps
 * a pressed item's words in the rail, a menu on the canvas itself. The Command
 * Dock covers nothing, so it reports through the application's standing notice
 * instead.
 */
test('a copy command confirms in the rail menu it was pressed in', async ({ page }) => {
  await page.goto('/?story=components--resource--rail-actions&mode=preview');

  await page.getByRole('button', { name: 'Actions for Resource Resource 2' }).click({ delay: 120 });
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: RESOURCE_COPY_LINK }).click();

  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Copied' })).toBeVisible();
});

test('a Resource rail opens its actions menu from the actions control', async ({ page }) => {
  await page.goto('/?story=components--resource--rail-actions&mode=preview');

  await page.getByRole('button', { name: 'Actions for Resource Resource 2' }).click({ delay: 120 });

  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Copy link to Resource in Map' }).click();
  await expect(page.getByTestId('copy-report')).toHaveText(
    /^Copied .*\/maps\/AAAAAAAAQACAAAAAAAAAIA\/resources\//,
  );
});

test(
  'a Resource opens the same actions menu from a right click',
  { tag: '@parity:canvas-resource-actions-menu' },
  async ({ page }) => {
    await page.goto('/?story=components--resource--rail-actions&mode=preview');

    await page.getByRole('article', { name: 'Resource 2' }).click({ button: 'right' });

    const menu = page.getByRole('menu');
    // No Rename: a Resource's title is renamed in place on its Front, so the menu
    // production would supply here holds its two addresses and nothing else.
    await expect(menu.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
    await expect(
      menu.getByRole('menuitem', { name: 'Copy link to Resource in Map' }),
    ).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: RESOURCE_COPY_LINK })).toBeVisible();
  },
);
