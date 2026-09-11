import { expect, test, type Locator, type Page } from '@playwright/test';

const STORY = '/?story=surfaces--space-thing-embedded-diagram--selected-diagram&mode=preview';

/** The containing Space Thing, by the Thing id the story Space declares for it. */
const spaceThing = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id="00000000-0000-4000-8000-000000000005"]');

/**
 * The Things the Space Thing draws, by the id shape the projection gives them.
 *
 * `embedded:<spaceThingId>:<targetThingId>` names a placement rather than a Thing,
 * because one target Space may be shown by two Space Things on one canvas — so
 * the prefix is the only stable thing about it from out here, and it is exactly
 * what says "this node belongs to another Space".
 */
const embeddedNodes = (page: Page): Locator =>
  page.locator('.react-flow__node[data-id^="embedded:"]');

const open = async (page: Page): Promise<void> => {
  await page.goto(STORY);
  // The target Space is read asynchronously — it is a different Space, stored
  // beside this one — so the Thing draws before its Diagram can, and waiting on
  // the Thing alone would race the read this story is about.
  await expect(embeddedNodes(page)).toHaveCount(2, { timeout: 20_000 });
};

test(
  'an Open Space Thing draws the Diagram it selects inside its own rect',
  { tag: '@parity:open-space-thing-draws-its-selected-diagram' },
  async ({ page }) => {
    await open(page);

    // Titles from the other Space, which no Thing of the containing Space
    // carries — so a node drawing one could not have come from anywhere else.
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Intake' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Storage' })).toBeVisible();
    // The selected Graph is drawn with them: an embedded Diagram is the Things
    // *and* the one Graph the Thing selects across them.
    await expect(
      page.locator('.react-flow__edge[data-id^="00000000-0000-4000-8000-000000000005:"]'),
    ).toHaveCount(1);

    // Inside the Space Thing's own box, which is what makes the Thing a window
    // onto another Space rather than a second row of Things beside it. React
    // Flow renders a sub-flow child as a sibling of its parent, so containment
    // is a fact about the measured boxes and never about the DOM tree.
    const outer = await spaceThing(page).boundingBox();
    if (outer === null) throw new Error('The Space Thing was not drawn');
    for (const node of await embeddedNodes(page).all()) {
      const inner = await node.boundingBox();
      if (inner === null) throw new Error('An embedded Thing was not drawn');
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.y).toBeGreaterThanOrEqual(outer.y);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  },
);

/**
 * The two choices an Open Space Thing publishes, drawn as the Dock draws the same
 * two (`.scratch/command-dock/issues/12`).
 *
 * Both halves matter and only one is about appearance. The treatment is compared
 * against the Dock **on screen in the same page**, property by property, so a
 * change to either that the other did not follow fails here rather than drawing
 * two panels that merely looked alike when this was written. The other half is
 * that the controls are not the Dock's *operations*: pressing this Thing's Diagram
 * list must not move the canvas the Thing is standing on.
 */
test(
  "an Open Space Thing's choices are the Dock's surface and controls, acting on the Thing",
  { tag: '@parity:open-space-thing-chooses-its-context-on-the-shared-controls' },
  async ({ page }) => {
    await open(page);
    const thing = spaceThing(page);

    // What the Thing holds: the target Space's own Diagram and Graph, named.
    await expect(thing.getByTestId('space-thing-diagram')).toHaveText('Collection 1');
    await expect(thing.getByTestId('space-thing-graph')).toHaveText('Overview');

    const treatment = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          borderRadius: style.borderTopLeftRadius,
          borderColor: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          padding: style.paddingTop,
        };
      });
    expect(await treatment(thing.locator('[data-slot="command-surface"]'))).toEqual(
      await treatment(page.locator('.command-dock__surface:visible')),
    );

    // The same list the Dock's own Diagram cluster discloses: radio rows, one
    // marked, reached from the control that names what is chosen.
    // `:visible`, because every open Space stays mounted with one shown
    // (`OpenSpacesApplication`), and the target Space is open here too.
    //
    // The row chosen is deliberately **not** the one already marked: pressing
    // the selected row and finding the Thing unchanged proves the list renders,
    // not that a choice is honoured. The target Space offers a second Diagram
    // whose content no other Diagram of it draws, so what is on screen
    // afterwards could only have come from the choice.
    const selectedDiagram = page.locator('[data-testid="selected-canvas"]:visible');
    const before = await selectedDiagram.innerText();
    await thing.getByTestId('space-thing-diagram').click();
    const row = page.getByRole('menuitemradio', { name: 'Collection 2' });
    await expect(row).toBeVisible();
    await row.click();

    // The Thing's stored context is the chosen one, Graph included: choosing a
    // Diagram seeds the Graph from that Diagram's own Active Graph
    // (`canvas-thing-authoring.ts`), so both names move together.
    await expect(thing.getByTestId('space-thing-diagram')).toHaveText('Collection 2');
    await expect(thing.getByTestId('space-thing-graph')).toHaveText('Detail');

    // And the embedding redrew to the chosen Diagram: its own Thing, and none of
    // the Diagram that was selected a moment ago.
    await expect(embeddedNodes(page)).toHaveCount(1);
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Review' })).toBeVisible();
    await expect(embeddedNodes(page).getByRole('heading', { name: 'Intake' })).toHaveCount(0);

    // And it acted on the Thing rather than on the Space the Thing sits in: the
    // containing Diagram is the one it was.
    await expect(selectedDiagram).toHaveText(before);
  },
);

test(
  'editing the embedded Thing updates its target Space',
  { tag: '@parity:embedded-diagram-things-author-target' },
  async ({ page }) => {
    await open(page);
    const embedded = embeddedNodes(page).filter({
      has: page.getByRole('heading', { name: 'Intake', exact: true }),
    });
    await embedded.hover();
    // Anchors, not affordances (ADR 0087): an embedded Diagram draws Edges, and
    // an Edge attaches to an anchor — but nothing here offers a drag one.
    await expect(embedded.locator('.rf-thing-node__authoring-handle')).toHaveCount(8);
    await expect(embedded.getByRole('button', { name: /^Connect (from|to) / })).toHaveCount(0);
    await embedded.getByRole('button', { name: 'Edit Thing Intake' }).click();
    await embedded
      .getByRole('textbox', { name: 'Markdown source of Intake' })
      .fill('Edited in the embedded Diagram');
    await embedded.getByRole('button', { name: 'Save Thing Intake' }).click();
    await expect(embedded).toContainText('Edited in the embedded Diagram');
    // Crossing into the target Space to read the same edit there. The vertical
    // tab strip that used to do this went with the Space Sidebar (ADR 0082), so
    // the move is the Command Dock's Open Spaces menu — and the assertion is on
    // the Space the Dock is now naming rather than on a panel beside it.
    await page.getByRole('button', { name: /^Spaces\. \d+ open\.$/ }).click({ delay: 120 });
    await page.getByRole('menuitemradio', { name: /^Architecture/ }).click();
    // `:visible`, because every open Space stays mounted and only one is shown
    // (`OpenSpacesApplication`). A role query already skips the hidden ones —
    // they are out of the accessibility tree — but a test id does not.
    await expect(page.locator('[data-testid="space-title"]:visible')).toContainText('Architecture');
    const intake = page
      .locator('.react-flow__node:visible')
      .filter({ has: page.getByRole('heading', { name: 'Intake', exact: true }) });
    await expect(intake).toContainText('Edited in the embedded Diagram');
  },
);

test('the embedded Diagram story is isolated from the Ladle catalogue', async ({ page }) => {
  await page.goto('/?story=surfaces--space-thing-embedded-diagram--selected-diagram');

  const storyFrame = page.frameLocator('iframe');
  await expect(storyFrame.locator('.react-flow__node[data-id^="embedded:"]').first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('.react-flow__node[data-id^="embedded:"]')).toHaveCount(0);
});
