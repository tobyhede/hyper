import { createThing } from './graph';
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

/**
 * A withdrawn name is visibly withdrawn, which is a stylesheet's job here and
 * nothing the component can do.
 *
 * `IdentityName` draws one `ToolbarButton` in both states and hands it
 * `disabled`. ADR 0073 keeps a toolbar item focusable while it is unavailable,
 * so Base UI writes `aria-disabled="true"` and **no** native `disabled`
 * attribute — every `disabled:` utility on the button misses, the base
 * `cursor-pointer` stands, and the ghost variant's hover fill still lands.
 * Without `command-dock.css`'s `[aria-disabled='true']` rule the two states are
 * pixel-identical and a withdrawn name lights up under the pointer, so the rule
 * is load-bearing and this is what holds it there: delete it and this test is
 * the only thing in the repository that goes red.
 *
 * Read in a browser rather than jsdom because it is `getComputedStyle` over a
 * cascade that jsdom does not run.
 */
test('a withdrawn Dock name is quieted and refuses the pointer', async ({ page }) => {
  await page.goto('/');
  const treatment = (name: string) =>
    page.getByTestId(name).evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, cursor: style.cursor };
    });

  const available = await treatment('space-title');
  expect(available.cursor).toBe('pointer');

  // Creating a Thing opens its title editor, which is what takes the caret and
  // withdraws all three chrome renames together (`authoring-availability.ts`).
  await createThing(page, 'Markdown Thing');
  await expect(page.getByRole('textbox', { name: 'Thing title' })).toBeVisible();

  for (const name of ['space-title', 'selected-canvas', 'active-graph']) {
    await expect(page.getByTestId(name)).toHaveAttribute('aria-disabled', 'true');
    const withdrawn = await treatment(name);
    expect(withdrawn.cursor).toBe('not-allowed');
    expect(withdrawn.color).not.toBe(available.color);
  }
});
