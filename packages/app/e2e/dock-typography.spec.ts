import { expect, test } from './fixtures';

test(
  'Dock identities share typography while the Space name remains a label',
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
    await expect(page.getByRole('button', { name: /^Rename Space:/ })).toHaveCount(0);
    await diagram.click();
    await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(diagram).toBeFocused();
  },
);
