import { confirmDeletion, drawnHeadShape, expectMenuGroups, resourceControls } from './graph';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Exercise the same target commands through the application and its production story.
 *
 * The target Graph the Space Resource shows must have at least one Edge: Shape…
 * is proved by every Edge the Space Resource draws for it ending in the chosen
 * head shape, which a Graph with none would satisfy without drawing anything.
 */
export async function exerciseSpaceResourceContextMenus(
  page: Page,
  resource: Locator,
  targetTitle: string,
): Promise<void> {
  const canvas = page.locator('[data-testid="selected-canvas"]:visible');
  const containingMap = await canvas.textContent();
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
  const openMenu = async (kind: 'map' | 'graph') => {
    const trigger = (await resourceControls(page, resource)).getByTestId(`space-resource-${kind}`);
    await trigger.focus();
    await trigger.press('Enter');
  };
  // One grouping grammar: the
  // Map list, New Map on its own, Rename beside Copy link to
  // Map, then Delete — one separator between each group.
  await openMenu('map');
  const mapMenu = page.getByRole('menu');
  await expectMenuGroups(mapMenu, [
    await mapMenu.getByRole('menuitemradio').allInnerTexts(),
    ['New Map'],
    ['Rename', 'Copy link to Map'],
    [/^Delete /],
  ]);
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Map name', exact: true }).fill('Target context');
  await page.getByRole('textbox', { name: 'Map name', exact: true }).press('Enter');
  await expect(
    (await resourceControls(page, resource)).getByTestId('space-resource-map'),
  ).toHaveText('Target context');
  await openMenu('map');
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Map name', exact: true })).toBeFocused();
  await canvas.focus();
  await expect(page.getByRole('textbox', { name: 'Map name', exact: true })).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await openMenu('map');
  await page.getByRole('menuitem', { name: 'Copy link to Map', exact: true }).click();
  await expect(resource.getByRole('status')).toHaveText('Link copied.');
  const mapLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(mapLink).pathname).toMatch(/^\/spaces\/[^/]+\/maps\/[^/]+$/);

  // Same grammar, with Colour… and Shape… heading the commands on this Graph —
  // and no permanent address offered.
  await openMenu('graph');
  const graphMenu = page.getByRole('menu');
  await expect(graphMenu.getByRole('menuitem', { name: /^Copy permanent link/ })).toHaveCount(0);
  await expectMenuGroups(graphMenu, [
    await graphMenu.getByRole('menuitemradio').allInnerTexts(),
    ['New Graph'],
    ['Colour…', 'Shape…', 'Rename', 'Copy link to Graph'],
    [/^Delete /],
  ]);
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const graphName = page.getByRole('textbox', { name: 'Graph name', exact: true });
  await graphName.fill('');
  await graphName.press('Enter');
  const notice = page.getByRole('alert').filter({ hasText: `${targetTitle}: Graph unchanged` });
  await expect(notice).toContainText('A Graph title is required.');
  await notice.getByRole('button', { name: `Dismiss: ${targetTitle}: Graph unchanged` }).click();
  await expect(notice).toHaveCount(0);
  await expect(graphName).toBeVisible();
  await graphName.fill('Target path');
  await graphName.press('Enter');
  await expect(
    (await resourceControls(page, resource)).getByTestId('space-resource-graph'),
  ).toHaveText('Target path');
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Colour…', exact: true }).click();
  await page
    .getByRole('group', { name: 'Graph colour' })
    .getByRole('menuitemradio', { name: 'Pink', exact: true })
    .click();
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Colour…', exact: true }).click();
  await expect(
    page
      .getByRole('group', { name: 'Graph colour' })
      .getByRole('menuitemradio', { name: 'Pink', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Shape… changes the target's Graph as Colour… does, and closes behind it.
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Shape…', exact: true }).click();
  await page
    .getByRole('group', { name: 'Graph head shape' })
    .getByRole('menuitemradio', { name: 'Dot', exact: true })
    .click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const placement = await resource.getAttribute('data-id');
  const embeddedEdges = page.locator(
    `.react-flow:visible .react-flow__edge[data-id^="${placement}:"]`,
  );
  await expect.poll(() => embeddedEdges.count()).toBeGreaterThan(0);
  for (const edge of await embeddedEdges.all())
    await expect.poll(() => drawnHeadShape(edge)).toBe('dot');
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Shape…', exact: true }).click();
  await expect(
    page
      .getByRole('group', { name: 'Graph head shape' })
      .getByRole('menuitemradio', { name: 'Dot', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Copy link to Graph', exact: true }).click();
  const graphLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(graphLink).toContain(mapLink);

  await openMenu('graph');
  await expect(
    page.getByRole('menuitem', { name: 'Delete Target path', exact: true }),
  ).toBeDisabled();
  await page.getByRole('menuitem', { name: 'New Graph', exact: true }).click();
  await expect(
    (await resourceControls(page, resource)).getByTestId('space-resource-graph'),
  ).toHaveText('Graph 1');
  // Delete asks first, in the Dock's words, and Cancel or Escape leave the
  // Graph in place with the caret back on the rail.
  const graphTrigger = (await resourceControls(page, resource)).getByTestId('space-resource-graph');
  const graphQuestion = page.getByRole('alertdialog', {
    name: 'Delete Graph 1 From Target context?',
  });
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Delete Graph 1', exact: true }).click();
  await expect(graphQuestion).toContainText(
    'Permanently deletes the Graph and all Edges from the Map.',
  );
  await graphQuestion.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(graphQuestion).toHaveCount(0);
  await expect(graphTrigger).toBeFocused();
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Delete Graph 1', exact: true }).click();
  await expect(graphQuestion.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(graphQuestion).toHaveCount(0);
  await expect(graphTrigger).toBeFocused();
  await expect(graphTrigger).toHaveText('Graph 1');
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Delete Graph 1', exact: true }).click();
  await confirmDeletion(page, 'Delete Graph 1 From Target context?');
  await expect(
    (await resourceControls(page, resource)).getByTestId('space-resource-graph'),
  ).toHaveText('Target path');

  await openMenu('map');
  await page.getByRole('menuitem', { name: 'New Map', exact: true }).click();
  await page.getByRole('textbox', { name: 'Map name', exact: true }).fill('Created from rail');
  await page.getByRole('textbox', { name: 'Map name', exact: true }).press('Enter');
  await expect(
    (await resourceControls(page, resource)).getByTestId('space-resource-map'),
  ).toHaveText('Created from rail');
  const mapTrigger = (await resourceControls(page, resource)).getByTestId('space-resource-map');
  const mapQuestion = page.getByRole('alertdialog', {
    name: 'Delete Created from rail From Space?',
  });
  await openMenu('map');
  await page.getByRole('menuitem', { name: 'Delete Created from rail', exact: true }).click();
  await expect(mapQuestion).toContainText(
    'Permanently deletes the Map, and all Graphs from the Space.',
  );
  await expect(mapQuestion.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(mapQuestion).toHaveCount(0);
  await expect(mapTrigger).toBeFocused();
  await expect(mapTrigger).toHaveText('Created from rail');
  await openMenu('map');
  await page.getByRole('menuitem', { name: 'Delete Created from rail', exact: true }).click();
  await confirmDeletion(page, 'Delete Created from rail From Space?');
  await expect(
    (await resourceControls(page, resource)).getByTestId('space-resource-map'),
  ).toHaveText('Target context');
  await expect(canvas).toHaveText(containingMap ?? '');
}

/** The Space Resource entity menu and its Reference Resource creation, through both production hosts. */
export async function exerciseSpaceResourceEntityMenu(
  page: Page,
  resource: Locator,
): Promise<void> {
  const id = await resource.getAttribute('data-id');
  if (id === null) throw new Error('Space Resource id missing');
  const resourceNode = page.locator(`.react-flow__node[data-id="${id}"]`);
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
    await typography(
      (await resourceControls(page, resourceNode)).getByTestId('space-resource-map'),
    ),
  ).toEqual(await typography(page.locator('[data-testid="selected-canvas"]:visible')));
  expect(
    await typography(
      (await resourceControls(page, resourceNode)).getByTestId('space-resource-graph'),
    ),
  ).toEqual(await typography(page.locator('[data-testid="active-graph"]:visible')));
  const menu = async () => {
    const trigger = (await resourceControls(page, resourceNode)).getByRole('button', {
      name: /^Actions for Resource/,
    });
    await trigger.focus();
    await trigger.press('Enter');
  };
  // The Title edits on the drawn Resource, not from the menu: the menu carries no Rename
  // row, so the rename that seeds the rest of this test presses the Resource's own
  // control instead.
  const title = page.getByRole('textbox', { name: 'Resource title', exact: true });
  await resourceNode.getByRole('button', { name: /^Edit Title / }).click();
  await expect(title).toBeFocused();
  await title.fill('Space Resource');
  await title.press('Enter');
  await expect(
    resourceNode.getByRole('heading', { name: 'Space Resource', exact: true }),
  ).toBeVisible();
  await menu();
  await expectMenuGroups(page.getByRole('menu'), [
    ['Create Reference'],
    ['Connect to Resource'],
    ['Enter', 'Open in New Tab'],
    ['Copy link to Resource in Map', 'Copy link to Resource', 'Copy link to Space'],
    ['Remove from Map', 'Delete from Space'],
  ]);
  await expect(
    (await resourceControls(page, resourceNode)).getByRole('button', { name: /^Enter/ }),
  ).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Create Reference', exact: true }).click();
  await expect(title).toBeFocused();
  await title.fill('Space Resource reference');
  await title.press('Enter');
  const reference = page.locator('.react-flow__node').filter({
    has: page.getByRole('heading', { name: 'Space Resource reference', exact: true }),
  });
  await expect(reference.locator('[data-testid="resource"]')).toHaveAttribute(
    'data-kind',
    'reference',
  );
  const openReference = (await resourceControls(page, reference)).getByRole('button', {
    name: 'Open Resource Space Resource reference',
  });
  await openReference.focus();
  await openReference.press('Enter');
  const referenceId = await reference.getAttribute('data-id');
  const embedded = page.locator(`.react-flow__node[data-id^="embedded:${referenceId}:"]`);
  await expect(embedded.first()).toBeVisible();
  expect(
    await reference
      .locator('.canvas-resource__body')
      .evaluate((body) => (body instanceof HTMLElement ? body.offsetHeight : 0)),
  ).toBeLessThan(50);
  await expect(embedded.getByTestId('canvas-resource-actions')).toHaveCount(0);
  const referenceMenu = (await resourceControls(page, reference)).getByRole('button', {
    name: 'Actions for Resource Space Resource reference',
  });
  await referenceMenu.focus();
  await referenceMenu.press('Enter');
  await expect(page.getByRole('menuitem', { name: /^Create Reference/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
}
