import { expect, test } from './fixtures';
import { dock, nodeByTitle, settled } from './graph';

for (const delay of [0, 120]) {
  test(`Dock disclosures switch on one press (${delay}ms)`, async ({ page }) => {
    await page.goto('/');
    await expect(nodeByTitle(page, 'A')).toBeVisible();
    await settled(page);
    const surface = dock(page);
    await surface.getByRole('button', { name: /^Layout: / }).click({ delay });
    await expect(page.getByRole('menuitem', { name: 'New Layout', exact: true })).toBeVisible();
    await surface.getByRole('button', { name: /^Active Graph: / }).click({ delay });
    await expect(page.getByRole('menuitem', { name: 'New Graph', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'New Layout', exact: true })).toHaveCount(0);
    await surface.getByRole('button', { name: /^Space: / }).click({ delay });
    await expect(page.getByRole('menuitem', { name: 'New Space', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'New Graph', exact: true })).toHaveCount(0);
  });

  for (const kind of ['Layout', 'Graph']) {
    test(`${kind} rename is isolated from the canvas with a menu open (${delay}ms)`, async ({
      page,
    }) => {
      await page.goto('/');
      await expect(nodeByTitle(page, 'A')).toBeVisible();
      await settled(page);
      const persistence = page.getByTestId('persistence-status');
      const revision = await persistence.getAttribute('data-revision');
      const closed = await page.locator('.canvas-card[data-expanded="false"]').count();
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
      await expect(page.locator('.canvas-card[data-expanded="false"]')).toHaveCount(closed);
      await expect(page.locator('.canvas-card[data-expanded="true"]')).toHaveCount(0);
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
    await dock(page)
      .getByRole('button', { name: /^Move Command Dock/ })
      .click();
    // The slot menu orders the four labelled edge groups clockwise: the second
    // Middle item is the left edge's midpoint.
    await page.getByRole('menuitemradio', { name: 'Middle', exact: true }).nth(1).click();
    await expect(dock(page)).toHaveAttribute('data-orientation', 'vertical');
    await expect(page.getByTestId('space-title')).toHaveText('Layout fixture');
    await expect(page.getByTestId('selected-canvas')).toHaveText('Collection 1');
    await expect(page.getByTestId('active-graph')).toHaveText('Long');
    await dock(page)
      .getByRole('button', { name: /^Layout: / })
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

test('hovering a Card handle keeps its rail revealed with entity actions', async ({ page }) => {
  await page.goto('/');
  const card = nodeByTitle(page, 'A');
  await expect(card).toBeVisible();
  await settled(page);
  await card.hover();
  const rail = card.locator('.canvas-card__rail');
  const handle = card.locator('[data-handleid="authoring-source-right"]');
  const color = await handle.evaluate((element) => getComputedStyle(element).backgroundColor);
  const box = await handle.boundingBox();
  if (box === null) throw new Error('Card handle has no box');
  // The outside half is beyond the Card face but inside the handle hit target.
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await expect(handle).toBeVisible();
  await expect(rail).toHaveCSS('background-color', color);
  await expect(card.getByTestId('canvas-card-actions')).toHaveCSS('opacity', '1');
});

test('a failed clipboard command reports above an overlapping Dock', async ({ page }) => {
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
    .getByRole('button', { name: /^Layout: / })
    .click({ delay: 120 });
  await page.getByRole('menuitem', { name: /^Copy link/ }).click();
  const notice = page.getByRole('alert').filter({ hasText: 'Link not copied' });
  await expect(notice).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
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
  const onTop = await page.evaluate((box) => {
    const hit = document.elementFromPoint((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    return hit !== null && hit.closest('.shell__notice') !== null;
  }, overlap);
  expect(onTop).toBe(true);
});
