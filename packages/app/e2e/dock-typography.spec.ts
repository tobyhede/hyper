import { createThing } from './graph';
import { expect, test } from './fixtures';

/**
 * One treatment across the three names, and all three disclose.
 *
 * The Space used to be the exception — a `<span>` wearing the Button box, because
 * there was no `renamed-space` Edit and a greyed name would have advertised a
 * command nobody could run. There is one now, so what this holds is that the
 * three identities are one composition: shared typography *and* a shared
 * disclosure, with Rename in each list and the caret coming back to the name.
 */
test(
  'Dock identities share typography and each name discloses its list',
  { tag: '@parity:command-dock-identity-presentation' },
  async ({ page }) => {
    await page.goto('/');
    const space = page.getByTestId('space-title');
    const diagram = page.getByTestId('selected-canvas');
    await expect(space).toBeVisible();
    await expect(diagram).toBeVisible();
    await expect(page.getByTestId('active-graph')).toBeVisible();
    /**
     * **All three read in one frame, and that is the assertion rather than a
     * precaution.**
     *
     * The names share the Button's `transition-[color,…] duration-200`, so a
     * colour read while that transition is in flight is a point on it rather
     * than a settled value. Read one locator after another and the three land at
     * different points of the same animation, which reports a difference in
     * *time* as a difference in treatment. Sampling them together removes the
     * race instead of waiting it out: they mount together with one duration from
     * one value, so a shared transition is shared at every frame of it, and a
     * genuinely different colour still differs. The Ladle half of this claim
     * reads the same way for the same reason.
     */
    const [reference, ...others] = await page
      .locator(
        '[data-testid="space-title"], [data-testid="selected-canvas"], [data-testid="active-graph"]',
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return [
            style.fontFamily,
            style.fontSize,
            style.fontWeight,
            style.lineHeight,
            style.color,
          ];
        }),
      );
    expect(others).toHaveLength(2);
    for (const identity of others) expect(identity).toEqual(reference);
    await expect(page.getByRole('button', { name: /^Space:/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Diagram:/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Active Graph:/ })).toHaveCount(1);
    await diagram.click({ delay: 120 });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(diagram).toBeFocused();
    // The Space's own, because the identity that used to be a label had no way
    // to owe the caret at all.
    await space.click({ delay: 120 });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('textbox', { name: 'Space name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(space).toBeFocused();
    const graph = page.getByTestId('active-graph');
    await graph.click({ delay: 120 });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(page.getByRole('textbox', { name: 'Graph name', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(graph).toBeFocused();
  },
);

/**
 * Switching stays reachable while Rename is withdrawn.
 *
 * Creating a Thing opens its title editor, which takes the caret and withdraws
 * all three chrome renames together (`authoring-availability.ts`). The name is
 * the disclosure, so that withdrawal is the Rename row, not the trigger.
 */
test('Rename is withdrawn on every identity while a Thing title editor is open', async ({
  page,
}) => {
  await page.goto('/');
  const openRename = async (name: string) => {
    await page.getByTestId(name).click({ delay: 120 });
    return page.getByRole('menuitem', { name: 'Rename' });
  };

  const available = await openRename('space-title');
  await expect(available).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  await createThing(page, 'Markdown Thing');
  await expect(page.getByRole('textbox', { name: 'Thing title' })).toBeVisible();

  for (const name of ['space-title', 'selected-canvas', 'active-graph']) {
    const rename = await openRename(name);
    await expect(rename).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
  }
});
