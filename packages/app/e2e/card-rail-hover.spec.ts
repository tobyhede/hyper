import { expect, test } from './fixtures';
import { nodeByTitle } from './graph';

test(
  'Open and Close release pointer-revealed controls while preserving keyboard access',
  { tag: '@parity:card-rail-reveal-distinguishes-pointer-and-keyboard' },
  async ({ page }) => {
    await page.goto('/');
    const card = nodeByTitle(page, 'A');
    const actions = card.getByRole('toolbar', { name: 'Card A', exact: true });
    const resize = card.locator('.rf-card-node__resize-control');
    for (const operation of ['Open', 'Close']) {
      await card.hover();
      await card.getByRole('button', { name: `${operation} Card A`, exact: true }).click();
      await page.mouse.move(1, 1);
      await expect(actions).toHaveCSS('opacity', '0');
      await expect(actions).toHaveCSS('pointer-events', 'none');
      if (operation === 'Open') {
        await expect(resize).toHaveCSS('opacity', '0');
        await expect(card.locator('.rf-card-node__resize-mark')).toHaveCSS('opacity', '0');
      } else {
        await expect(resize).toHaveCount(0);
      }
    }
    // Switch to keyboard modality, then reach and operate the same toolbar.
    await page.keyboard.press('Tab');
    const open = card.getByRole('button', { name: 'Open Card A', exact: true });
    await open.focus();
    await expect(actions).toHaveCSS('opacity', '1');
    await open.press('Enter');
    const close = card.getByRole('button', { name: 'Close Card A', exact: true });
    await expect(close).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(resize).toHaveCSS('opacity', '1');
    await close.press('Enter');
    await expect(open).toBeFocused();
    await expect(actions).toHaveCSS('opacity', '1');
    await expect(resize).toHaveCount(0);
  },
);
