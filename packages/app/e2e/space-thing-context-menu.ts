import { expectMenuGroups, thingControls } from './graph';
import { expect, type Locator, type Page } from '@playwright/test';

/** Exercise the same target commands through the application and its production story. */
export async function exerciseSpaceThingContextMenus(page: Page, thing: Locator): Promise<void> {
  const canvas = page.locator('[data-testid="selected-canvas"]:visible');
  const containingDiagram = await canvas.textContent();
  await page.evaluate(() => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          copied = text;
          return Promise.resolve();
        },
        readText: () => Promise.resolve(copied),
      },
    });
  });
  const openMenu = async (kind: 'diagram' | 'graph') => {
    const trigger = (await thingControls(page, thing)).getByTestId(`space-thing-${kind}`);
    await trigger.focus();
    await trigger.press('Enter');
  };
  // One grouping grammar (`.scratch/dock-menu-reorganisation/issues/01`): the
  // Diagram list, New Diagram on its own, Rename beside Copy link to
  // Diagram, then Delete — one separator between each group.
  await openMenu('diagram');
  const diagramMenu = page.getByRole('menu');
  await expectMenuGroups(diagramMenu, [
    await diagramMenu.getByRole('menuitemradio').allInnerTexts(),
    ['New Diagram'],
    ['Rename', 'Copy link to Diagram'],
    [/^Delete /],
  ]);
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).fill('Target context');
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).press('Enter');
  await expect((await thingControls(page, thing)).getByTestId('space-thing-diagram')).toHaveText(
    'Target context',
  );
  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toBeFocused();
  await canvas.focus();
  await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'Copy link to Diagram', exact: true }).click();
  await expect(thing.getByRole('status')).toHaveText('Link copied.');
  const diagramLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(diagramLink).pathname).toMatch(/^\/spaces\/[^/]+\/diagrams\/[^/]+$/);

  // Same grammar, with Colour… standing alone immediately after the list —
  // and no permanent address offered any more.
  await openMenu('graph');
  const graphMenu = page.getByRole('menu');
  await expect(graphMenu.getByRole('menuitem', { name: /^Copy permanent link/ })).toHaveCount(0);
  await expectMenuGroups(graphMenu, [
    await graphMenu.getByRole('menuitemradio').allInnerTexts(),
    ['Colour…'],
    ['New Graph'],
    ['Rename', 'Copy link to Graph'],
    [/^Delete /],
  ]);
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).fill('Target path');
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).press('Enter');
  await expect((await thingControls(page, thing)).getByTestId('space-thing-graph')).toHaveText(
    'Target path',
  );
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Colour…', exact: true }).click();
  await page.getByRole('radio', { name: 'Pink', exact: true }).click();
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Colour…', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Pink', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Copy link to Graph', exact: true }).click();
  const graphLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(graphLink).toContain(diagramLink);

  await openMenu('graph');
  await expect(
    page.getByRole('menuitem', { name: 'Delete Target path', exact: true }),
  ).toBeDisabled();
  await page.getByRole('menuitem', { name: 'New Graph', exact: true }).click();
  await expect((await thingControls(page, thing)).getByTestId('space-thing-graph')).toHaveText(
    'Graph 1',
  );
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Delete Graph 1', exact: true }).click();
  await expect((await thingControls(page, thing)).getByTestId('space-thing-graph')).toHaveText(
    'Target path',
  );

  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'New Diagram', exact: true }).click();
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).fill('Created from rail');
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).press('Enter');
  await expect((await thingControls(page, thing)).getByTestId('space-thing-diagram')).toHaveText(
    'Created from rail',
  );
  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'Delete Created from rail', exact: true }).click();
  await expect((await thingControls(page, thing)).getByTestId('space-thing-diagram')).toHaveText(
    'Target context',
  );
  await expect(canvas).toHaveText(containingDiagram ?? '');
}

/** The Space Thing entity menu and its Reference Thing creation, through both production hosts. */
export async function exerciseSpaceThingEntityMenu(page: Page, thing: Locator): Promise<void> {
  const id = await thing.getAttribute('data-id');
  if (id === null) throw new Error('Space Thing id missing');
  const thingNode = page.locator(`.react-flow__node[data-id="${id}"]`);
  const typography = (control: Locator) =>
    control.evaluate((element) => ({
      font: getComputedStyle(element).fontSize,
      lineHeight: getComputedStyle(element).lineHeight,
      height: getComputedStyle(element).height,
      icons: [...element.querySelectorAll('svg')].map((icon) => ({
        width: getComputedStyle(icon).width,
        height: getComputedStyle(icon).height,
      })),
    }));
  expect(
    await typography((await thingControls(page, thingNode)).getByTestId('space-thing-diagram')),
  ).toEqual(await typography(page.locator('[data-testid="selected-canvas"]:visible')));
  expect(
    await typography((await thingControls(page, thingNode)).getByTestId('space-thing-graph')),
  ).toEqual(await typography(page.locator('[data-testid="active-graph"]:visible')));
  const menu = async () => {
    const trigger = (await thingControls(page, thingNode)).getByRole('button', {
      name: /^Actions for Thing/,
    });
    await trigger.focus();
    await trigger.press('Enter');
  };
  // The Title still edits on the Thing front, not from the menu
  // (`.scratch/dock-menu-reorganisation/issues/04`): the menu carries no Rename
  // row, so the rename that seeds the rest of this test presses the front's own
  // control instead.
  const title = page.getByRole('textbox', { name: 'Thing title', exact: true });
  await thingNode.getByRole('button', { name: /^Edit Title / }).click();
  await expect(title).toBeFocused();
  await title.fill('Space Thing');
  await title.press('Enter');
  await expect(thingNode.getByRole('heading', { name: 'Space Thing', exact: true })).toBeVisible();
  await menu();
  // No Delete from Space here: `thingNode` is Open — both callers reach it
  // through `openSpaceThingOnItsDiagram`, which presses Enter on it so its
  // Diagram and Graph menus have something to exercise — and Delete from
  // Space is withdrawn while any Thing on the Diagram is Open
  // (`authoring-availability.ts`'s `deleteThing`), so that Open state cannot
  // outlive the Thing it names. Delete from Space's presence and effect on a
  // closed Space Thing are covered by `space-thing.spec.ts`'s "deleting the
  // last Space Thing deletes the Space it referenced" and "removing a Space
  // Thing from the Diagram leaves the Thing and its target Space intact".
  await expectMenuGroups(page.getByRole('menu'), [
    ['Create Reference'],
    ['Enter', 'Open in New Tab'],
    ['Copy link to Thing in Diagram', 'Copy link to Thing', 'Copy link to Space'],
    ['Remove from Diagram'],
  ]);
  await expect(
    (await thingControls(page, thingNode)).getByRole('button', { name: /^Enter/ }),
  ).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Create Reference', exact: true }).click();
  await expect(title).toBeFocused();
  await title.fill('Space Thing reference');
  await title.press('Enter');
  const reference = page.locator('.react-flow__node').filter({
    has: page.getByRole('heading', { name: 'Space Thing reference', exact: true }),
  });
  await expect(reference.locator('[data-testid="thing"]')).toHaveAttribute(
    'data-kind',
    'reference',
  );
  const openReference = (await thingControls(page, reference)).getByRole('button', {
    name: 'Open Thing Space Thing reference',
  });
  await openReference.focus();
  await openReference.press('Enter');
  const referenceId = await reference.getAttribute('data-id');
  const embedded = page.locator(`.react-flow__node[data-id^="embedded:${referenceId}:"]`);
  await expect(embedded.first()).toBeVisible();
  expect(
    await reference
      .locator('.canvas-thing__body')
      .evaluate((body) => (body instanceof HTMLElement ? body.offsetHeight : 0)),
  ).toBeLessThan(50);
  await expect(embedded.getByTestId('canvas-thing-actions')).toHaveCount(0);
  const referenceMenu = (await thingControls(page, reference)).getByRole('button', {
    name: 'Actions for Thing Space Thing reference',
  });
  await referenceMenu.focus();
  await referenceMenu.press('Enter');
  await expect(page.getByRole('menuitem', { name: /^Create Reference/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
}
