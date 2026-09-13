import { nodeByTitle } from './graph';
import { expect, test, type Page } from './fixtures';

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

async function dismissOpenMenus(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await page.getByRole('menu').count()) === 0) return;
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('menu')).toHaveCount(0);
}

const identityMenu = (page: Page, testId: 'space-title' | 'selected-canvas' | 'active-graph') => {
  const marker =
    testId === 'space-title'
      ? 'Copy link'
      : testId === 'selected-canvas'
        ? 'New Diagram'
        : 'New Graph';
  return page.getByRole('menu').filter({
    has: page.getByRole('menuitem', { name: marker, exact: true }),
  });
};

/** A refused Thing-title draft the chrome-rename guard recognises. */
async function beginRefusedThingTitleEdit(page: Page) {
  await dismissOpenMenus(page);
  const thing = nodeByTitle(page, 'A').first();
  await thing.getByRole('button', { name: 'Edit Title A' }).click();
  const thingTitle = page.getByRole('textbox', { name: 'Thing title' });
  await thingTitle.fill('   ');
  await thingTitle.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('A Thing title is required.');
  return thingTitle;
}

/**
 * Switching stays reachable while Rename is withdrawn.
 *
 * Creating a Thing opens its title editor, which takes the caret and withdraws
 * all three chrome renames together (`authoring-availability.ts`). The name is
 * the disclosure, so that withdrawal is the Rename row, not the trigger.
 *
 * Each identity is exercised with its own refused draft: opening one list and
 * dismissing it can end the Thing title edit in a real browser, so chaining all
 * three against one editor would read withdrawal on the first and availability
 * on the rest (`thing-authoring.test.tsx`, ADR 0065).
 */
test('Rename is withdrawn on every identity while a Thing title editor is open', async ({
  page,
}) => {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();

  await page.getByTestId('space-title').click({ delay: 120 });
  await expect(
    identityMenu(page, 'space-title').getByRole('menuitem', { name: 'Rename' }),
  ).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  for (const testId of ['space-title', 'selected-canvas', 'active-graph'] as const) {
    const thingTitle = await beginRefusedThingTitleEdit(page);
    await page.getByTestId(testId).click({ delay: 120 });
    await expect(
      identityMenu(page, testId).getByRole('menuitem', { name: 'Rename' }),
    ).toHaveAttribute('aria-disabled', 'true');
    await expect(thingTitle).toBeVisible();
    await dismissOpenMenus(page);
    if (await thingTitle.isVisible()) {
      await thingTitle.press('Escape');
      await expect(thingTitle).toHaveCount(0);
    }
  }
});
