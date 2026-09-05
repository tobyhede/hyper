import { expect, test, type Locator, type Page } from '@playwright/test';

const STORY = '/?story=surfaces--space-card-embedded-layout--selected-layout&mode=preview';

/** The containing Space Card, by the Card id the story Space declares for it. */
const spaceCard = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id="00000000-0000-4000-8000-000000000005"]');

/**
 * The Cards the Space Card draws, by the id shape the projection gives them.
 *
 * `embedded:<spaceCardId>:<targetCardId>` names a placement rather than a Card,
 * because one target Space may be shown by two Space Cards on one canvas — so
 * the prefix is the only stable thing about it from out here, and it is exactly
 * what says "this node belongs to another Space".
 */
const embeddedNodes = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id^="embedded:"]');

const open = async (page: Page): Promise<void> => {
  await page.goto(STORY);
  // The target Space is read asynchronously — it is a different Space, stored
  // beside this one — so the Card draws before its Layout can, and waiting on
  // the Card alone would race the read this story is about.
  await expect(embeddedNodes(page)).toHaveCount(2, { timeout: 20_000 });
};

test(
  'an Open Space Card draws the Layout it selects inside its own rect',
  { tag: '@parity:open-space-card-draws-its-selected-layout' },
  async ({ page }) => {
    await open(page);

    // Titles from the other Space, which no Card of the containing Space
    // carries — so a node drawing one could not have come from anywhere else.
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Intake' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Storage' })).toBeVisible();
    // The selected Graph is drawn with them: an embedded Layout is the Cards
    // *and* the one Graph the Card selects across them.
    await expect(
      page.locator('.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]'),
    ).toHaveCount(1);

    // Inside the Space Card's own box, which is what makes the Card a window
    // onto another Space rather than a second row of Cards beside it. React
    // Flow renders a sub-flow child as a sibling of its parent, so containment
    // is a fact about the measured boxes and never about the DOM tree.
    const outer = await spaceCard(page).boundingBox();
    if (outer === null) throw new Error('The Space Card was not drawn');
    for (const node of await embeddedNodes(page).all()) {
      const inner = await node.boundingBox();
      if (inner === null) throw new Error('An embedded Card was not drawn');
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  },
);

test(
  'editing the embedded Card updates its target Space',
  { tag: '@parity:embedded-layout-cards-author-target' },
  async ({ page }) => {
    await open(page);
    const embedded = embeddedNodes(page).filter({
      has: page.getByRole('heading', { name: 'Intake', exact: true }),
    });
    await embedded.hover();
    await expect(embedded.locator('.rf-card-node__authoring-handle')).toHaveCount(0);
    await embedded.getByRole('button', { name: 'Edit Card Intake' }).click();
    await embedded
      .getByRole('textbox', { name: 'Markdown source of Intake' })
      .fill('Edited in the embedded Layout');
    await embedded.getByRole('button', { name: 'Save Card Intake' }).click();
    await expect(embedded).toContainText('Edited in the embedded Layout');
    await page.getByRole('tab', { name: 'Architecture', exact: true }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: 'Architecture', exact: true })
        .getByText('Edited in the embedded Layout'),
    ).toBeVisible();
  },
);

test('the embedded Layout story is isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=surfaces--space-card-embedded-layout--selected-layout');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.locator('.react-flow__node[data-id^="embedded:"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('.react-flow__node[data-id^="embedded:"]')).toHaveCount(0);
});
