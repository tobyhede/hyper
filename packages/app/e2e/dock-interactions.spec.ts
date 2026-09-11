import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { boxOf, dock, nodeByTitle, settled } from './graph';

for (const delay of [0, 120]) {
  test(`Dock disclosures switch on one press (${delay}ms)`, async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A')).toBeVisible();
    await settled(page);
    const surface = dock(page);
    await surface.getByRole('button', { name: /^Diagram: / }).click({ delay });
    await expect(page.getByRole('menuitem', { name: 'New Diagram', exact: true })).toBeVisible();
    await surface.getByRole('button', { name: /^Active Graph: / }).click({ delay });
    await expect(page.getByRole('menuitem', { name: 'New Graph', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'New Diagram', exact: true })).toHaveCount(0);
    await surface.getByRole('button', { name: /^Space: / }).click({ delay });
    await expect(page.getByRole('menuitem', { name: 'New Space', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'New Graph', exact: true })).toHaveCount(0);
  });

  for (const kind of ['Diagram', 'Graph']) {
    test(`${kind} rename is isolated from the canvas with a menu open (${delay}ms)`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(nodeByTitle(page, 'A')).toBeVisible();
      await settled(page);
      const persistence = page.getByTestId('persistence-status');
      const revision = await persistence.getAttribute('data-revision');
      const closed = await page.locator('.canvas-thing[data-expanded="false"]').count();
      await dock(page)
        .getByRole('button', { name: /^Space: / })
        .click({ delay });
      await expect(page.getByRole('menuitem', { name: 'New Space', exact: true })).toBeVisible();
      await dock(page)
        .getByRole('button', { name: new RegExp(`^Rename ${kind}:`) })
        .click({ delay });
      const editor = page.getByRole('textbox', { name: `${kind} name`, exact: true });
      await expect(editor).toBeFocused();
      await expect(page.getByRole('menu')).toHaveCount(0);
      await editor.fill('Cancelled rename');
      await editor.press('Escape');
      await expect(editor).toHaveCount(0);
      // Give an unintended asynchronous Edit time to publish before checking
      // the unchanged revision, as the editing suite does for negative gestures.
      await page.waitForTimeout(250);
      await expect(page.locator('.canvas-thing[data-expanded="false"]')).toHaveCount(closed);
      await expect(page.locator('.canvas-thing[data-expanded="true"]')).toHaveCount(0);
      await expect(persistence).toHaveAttribute('data-revision', revision ?? '');
    });
  }
}

test(
  'a side-edge Dock keeps names and opens disclosures into the canvas',
  {
    tag: '@parity:command-dock-keeps-its-names-on-a-side-edge',
  },
  async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A')).toBeVisible();
    // The same gate every other test in this file opens with, and the one this
    // test was missing. A visible node says the projection arrived, not that
    // the opening camera animation has stopped — and animation frames still
    // being spent on the canvas are what stretch a menu's own exit animation in
    // wall-clock time, which is the gap the press below has to clear.
    await settled(page);
    await dock(page)
      .getByRole('button', { name: /^Move Command Dock/ })
      .click();
    // The slot menu orders the four labelled edge groups clockwise: the second
    // Middle item is the left edge's midpoint.
    await page.getByRole('menuitemradio', { name: 'Middle', exact: true }).nth(1).click();
    await expect(dock(page)).toHaveAttribute('data-orientation', 'vertical');
    // **The grip's own menu has to be gone before the next trigger is pressed.**
    // At most one Dock disclosure is open at a time — one open id under the
    // whole row — so a press landing while the slot menu is still closing is an
    // *outside* press, which Base UI spends on the dismissal, and the menu this
    // asks for never opens. The assertions above usually cover the gap and that
    // is exactly the problem: this failed on CI's first attempt and passed on
    // retry #1, which `failOnFlakyTests` correctly refuses to call a pass.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByTestId('space-title')).toHaveText('Diagram fixture');
    await expect(page.getByTestId('selected-canvas')).toHaveText('Collection 1');
    await expect(page.getByTestId('active-graph')).toHaveText('Long');
    await dock(page)
      .getByRole('button', { name: /^Diagram: / })
      .click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('data-side', 'right');
    const frame = await dock(page).boundingBox();
    const popup = await menu.boundingBox();
    if (frame === null || popup === null) throw new Error('Dock or menu has no visible box');
    expect(popup.x).toBeGreaterThanOrEqual(frame.x);
    expect(popup.x + popup.width).toBeGreaterThan(frame.x + frame.width);
    await menu.getByRole('menuitemradio', { name: 'Collection 2', exact: true }).click();
    await expect(page.getByTestId('selected-canvas')).toHaveText('Collection 2');
  },
);

/**
 * **The grip answers the primary button and nothing else.**
 *
 * The grip is not a `Menu.Trigger`, so every semantic a trigger would have come
 * with is this control's to state — and button filtering is the one it never
 * stated. A `pointerdown` is a `pointerdown` whatever pressed it, so a
 * right-button press took hold of the dock, a right-button drag moved it, and
 * the release docked it in whatever slot the pointer had reached. There is no
 * command in the Dock that a secondary button performs, and moving the whole
 * command surface is not a reasonable answer to a request for a context menu.
 *
 * Read off the grip's own accessible name, which is where the dock says which
 * of the twelve slots it is in — the same sentence a screen reader is given.
 */
test('a secondary-button drag on the grip leaves the Dock in its slot', async ({ page }) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A')).toBeVisible();
  await settled(page);

  const grip = dock(page).getByRole('button', { name: /^Move Command Dock/ });
  await expect(grip).toHaveAccessibleName('Move Command Dock. Top edge, centre.');
  const box = await boxOf(grip, 'the grip');
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('The page has no viewport size.');

  // Far enough to clear `DRAG_THRESHOLD` several times over and to land in a
  // different edge's half of the container, so a gesture that is taken at all
  // redocks visibly rather than settling back where it started.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(viewport.width - 20, viewport.height / 2, { steps: 10 });
  await page.mouse.up({ button: 'right' });

  await expect(grip).toHaveAccessibleName('Move Command Dock. Top edge, centre.');
  await expect(dock(page)).toHaveAttribute('data-orientation', 'horizontal');
});

/**
 * The handles sit half outside the Thing's own box, so a pointer moving from the
 * Thing onto one leaves `.canvas-thing` without leaving the Thing — and the rail
 * must not drop away under a pointer that is still on the Thing's furniture.
 *
 * Read off the commands and the kind glyph rather than a coloured band: the band
 * is gone and the rail is neutral (`.scratch/command-dock/issues/12`). The
 * handle's own colour is asserted here too, because it is the half of the
 * treatment change that says where the Graph's colour went.
 */
test('hovering a Thing handle keeps its rail revealed with entity actions', async ({ page }) => {
  await page.goto('/');
  const thing = nodeByTitle(page, 'A');
  await expect(thing).toBeVisible();
  await settled(page);
  await thing.hover();
  const handle = thing.locator('[data-handleid="authoring-source-right"]');
  const color = await handle.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(color).not.toBe('rgba(0, 0, 0, 0)');
  const box = await handle.boundingBox();
  if (box === null) throw new Error('Thing handle has no box');
  // The outside half is beyond the Thing face but inside the handle hit target.
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await expect(handle).toBeVisible();
  await expect(thing.locator('.thing-rail__kind')).toHaveCSS('opacity', '1');
  await expect(thing.getByTestId('canvas-thing-actions')).toHaveCSS('opacity', '1');
});

/**
 * A refused Copy link, reported over a Dock moved into the same corner.
 *
 * The two tests below are the two halves of one rule and neither is worth
 * asserting alone: the report is drawn above the bar, and the reader can put it
 * away again. Sharing the setup is what stops the second one being written
 * against a Dock that never overlapped, which would pass while proving nothing.
 */
async function reportOverAnOverlappingDock(page: Page): Promise<Locator> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: () => Promise.reject(new Error('Clipboard unavailable')),
    });
  });
  await page.goto('/');
  await expect(nodeByTitle(page, 'A')).toBeVisible();
  await dock(page)
    .getByRole('button', { name: /^Move Command Dock/ })
    .click();
  await page.getByRole('menuitemradio', { name: 'Right', exact: true }).first().click();
  await dock(page)
    .getByRole('button', { name: /^Diagram: / })
    .click({ delay: 120 });
  await page.getByRole('menuitem', { name: /^Copy link/ }).click();
  const notice = page.getByRole('alert').filter({ hasText: 'Link not copied' });
  await expect(notice).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  return notice;
}

/** The box the report and the bar share, which both tests aim their hit test at. */
async function sharedCorner(
  page: Page,
  notice: Locator,
): Promise<{ readonly x: number; readonly y: number }> {
  const frame = await dock(page).boundingBox();
  const report = await notice.boundingBox();
  if (frame === null || report === null) throw new Error('Dock or notice has no visible box');
  const overlap = {
    left: Math.max(frame.x, report.x),
    right: Math.min(frame.x + frame.width, report.x + report.width),
    top: Math.max(frame.y, report.y),
    bottom: Math.min(frame.y + frame.height, report.y + report.height),
  };
  expect(overlap.right).toBeGreaterThan(overlap.left);
  expect(overlap.bottom).toBeGreaterThan(overlap.top);
  return { x: (overlap.left + overlap.right) / 2, y: (overlap.top + overlap.bottom) / 2 };
}

test('a failed clipboard command reports above an overlapping Dock', async ({ page }) => {
  const notice = await reportOverAnOverlappingDock(page);
  const corner = await sharedCorner(page, notice);
  const onTop = await page.evaluate((at) => {
    const hit = document.elementFromPoint(at.x, at.y);
    return hit !== null && hit.closest('.shell__notice') !== null;
  }, corner);
  expect(onTop).toBe(true);
});

/**
 * **The other half of drawing a report above the bar: a way out from under it.**
 *
 * A clipboard failure clears itself on the next copy, and a Space command break
 * clears only when the next switch or exit is attempted — from the Space menu,
 * on the bar the report is sitting on. So the report owes the reader a
 * dismissal, and what it owes after that is the corner back.
 */
test('a reported failure is dismissed off the Dock it covers', async ({ page }) => {
  const notice = await reportOverAnOverlappingDock(page);
  const corner = await sharedCorner(page, notice);

  await notice.getByRole('button', { name: 'Dismiss: Link not copied' }).click();

  await expect(notice).toHaveCount(0);
  const covered = await page.evaluate((at) => {
    const hit = document.elementFromPoint(at.x, at.y);
    return hit !== null && hit.closest('.shell__notice') !== null;
  }, corner);
  expect(covered).toBe(false);
  // And the bar takes the next press where the report was standing.
  await dock(page)
    .getByRole('button', { name: /^Diagram: / })
    .click({ delay: 120 });
  await expect(page.getByRole('menuitem', { name: 'New Diagram', exact: true })).toBeVisible();
});
