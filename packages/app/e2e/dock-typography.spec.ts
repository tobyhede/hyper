import { expect, test } from './fixtures';

/**
 * One treatment across the three names, and all three are controls.
 *
 * The Space used to be the exception — a `<span>` wearing the Button box, because
 * there was no `renamed-space` Edit and a greyed name would have advertised a
 * command nobody could run. There is one now, so what this holds is that the
 * three identities are one component in one state: shared typography *and* a
 * shared affordance, with the caret coming back to whichever name opened its
 * editor.
 */
test(
  'Dock identities share typography and each name is its own rename control',
  { tag: '@parity:command-dock-identity-presentation' },
  async ({ page }) => {
    await page.goto('/');
    const space = page.getByTestId('space-title');
    const diagram = page.getByTestId('selected-canvas');
    await expect(space).toBeVisible();
    await expect(diagram).toBeVisible();
    const typography = await diagram.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.fontFamily, style.fontSize, style.fontWeight, style.lineHeight, style.color];
    });
    for (const identity of [space, page.getByTestId('active-graph')]) {
      await expect(identity).toBeVisible();
      expect(
        await identity.evaluate((element) => {
          const style = getComputedStyle(element);
          return [
            style.fontFamily,
            style.fontSize,
            style.fontWeight,
            style.lineHeight,
            style.color,
          ];
        }),
      ).toEqual(typography);
    }
    await expect(page.getByRole('button', { name: /^Rename Space:/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Rename Diagram:/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Rename Graph:/ })).toHaveCount(1);
    await diagram.click();
    await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(diagram).toBeFocused();
    // The Space's own, because the identity that used to be a label had no way
    // to owe the caret at all.
    await space.click();
    await expect(page.getByRole('textbox', { name: 'Space name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(space).toBeFocused();
  },
);
