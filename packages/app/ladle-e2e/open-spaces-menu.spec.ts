import { expect, test, type Page } from '@playwright/test';

/**
 * The open set, and the one tab stop the whole surface takes.
 *
 * **This file drove `Space/Multiple Spaces`, a vertical tab strip of mounted
 * Space Sidebars, and that story is gone with the surface it framed (ADR
 * 0082).** What it proved is not: a reader moves between open Spaces without
 * closing or resetting any of them, and reaching the whole set costs one tab
 * stop rather than one per Space. The Command Dock answers both differently —
 * the set is a disclosure from the bar rather than a strip beside it, and the
 * bar is one `Toolbar` with a roving tabindex — so the tests are restated
 * against it rather than deleted with the strip.
 *
 * Untagged, both of them. The claims the Dock's Open Spaces menu owes are
 * `command-dock-marks-the-space-one-crossing-up` and
 * `command-dock-names-an-unwell-open-space`, and each already has its one test
 * in `command-dock.spec.ts`. These hold the two obligations the strip carried
 * that no claim names.
 */

const DEFAULT = '/?story=space--command-dock--default&mode=preview';

const openSpacesMenu = async (page: Page) => {
  // `delay`, because a zero-delay click puts mousedown and mouseup in one tick
  // and Base UI's dismissal never gets a turn between them.
  await page.getByRole('button', { name: 'Spaces. 5 open.' }).click({ delay: 120 });
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
};

/**
 * Moving is not closing, which is the change ADR 0068 has to answer to.
 *
 * Exit used to be both the move and the close, so leaving a Space took its
 * Diagram and Graph selections with it. Nothing closes here: the open set is a
 * tree a reader moves around, and every entry keeps where it was left — so
 * coming back to one arrives where you were rather than at its default.
 */
test('the Open Spaces menu moves between Spaces without closing or resetting one', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  await expect(page.getByTestId('space-title').locator('visible=true')).toContainText('Rendering');
  await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
    'Collection 1',
  );

  // Leave the Diagram the entry opened on, so returning has something to prove.
  await page
    .getByRole('button', { name: 'Diagram: Collection 1', exact: true })
    .click({ delay: 120 });
  await page.getByRole('menuitemradio', { name: 'Collection 2' }).click();
  await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
    'Collection 2',
  );

  await (await openSpacesMenu(page)).getByRole('menuitemradio', { name: /^Traversal/ }).click();
  await expect(page.getByTestId('space-title').locator('visible=true')).toContainText('Traversal');

  // Still five, so the Space just left is open rather than closed.
  const returning = await openSpacesMenu(page);
  await expect(returning.getByRole('menuitemradio')).toHaveCount(5);
  await returning.getByRole('menuitemradio', { name: /^Rendering/ }).click();

  await expect(page.getByTestId('space-title').locator('visible=true')).toContainText('Rendering');
  await expect(page.getByTestId('selected-canvas').locator('visible=true')).toContainText(
    'Collection 2',
  );
});

/**
 * One tab stop for the whole surface (ADR 0073).
 *
 * Each cluster used to be a `Toolbar` of its own, which made the Dock four roots
 * and four tab stops; the ADR draws one root with named `role="group"`s inside
 * it, so the arrows cross a group boundary exactly as they cross any other gap.
 * A roving tabindex is what that means in the DOM, and it is the thing a
 * `Button` dropped into the bar instead of a `ToolbarButton` silently breaks —
 * it would take a tab stop of its own and the bar would stop being one.
 */
test('the whole Dock is one tab stop with a roving order inside it', async ({ page }) => {
  await page.goto(DEFAULT);

  const surface = page.getByRole('toolbar', { name: 'Command Dock' });
  await expect(surface).toBeVisible();
  await expect(surface.locator('[tabindex="0"]')).toHaveCount(1);

  const grip = surface.getByRole('button', { name: /^Move Command Dock\./ });
  await grip.focus();
  await expect(grip).toBeFocused();
  await expect(surface.locator('[tabindex="0"]')).toHaveCount(1);

  await page.keyboard.press('ArrowRight');
  await expect(grip).not.toBeFocused();
  // The focus moved *within* the bar rather than off it, and the one stop moved
  // with it.
  await expect(surface.locator(':focus')).toHaveCount(1);
  await expect(surface.locator('[tabindex="0"]')).toHaveCount(1);
});

/** Exit must run the same lifecycle as production, including Opener reassignment. */
test('Exit closes one Space and keeps its children reachable through their new Opener', async ({
  page,
}) => {
  await page.goto(DEFAULT);
  await (await openSpacesMenu(page)).getByRole('menuitemradio', { name: /^Design system/ }).click();
  await expect(page.locator('[data-testid="space-title"]:visible')).toContainText('Design system');
  await page
    .getByRole('button', { name: 'Space: Design system', exact: true })
    .click({ delay: 120 });
  await page.getByRole('menuitem', { name: 'Exit Space', exact: true }).click();
  await expect(page.locator('[data-testid="space-title"]:visible')).toContainText('Meta Space');

  await page.getByRole('button', { name: 'Spaces. 4 open.' }).click({ delay: 120 });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitemradio')).toHaveCount(4);
  await expect(menu.getByRole('menuitemradio', { name: /^Design system/ })).toHaveCount(0);
  await menu.getByRole('menuitemradio', { name: /^Rendering/ }).click();
  await expect(page.getByRole('button', { name: 'Go to Platform' })).toBeVisible();
  await expect(page.locator('[data-testid="selected-canvas"]:visible')).toContainText(
    'Collection 1',
  );
});
