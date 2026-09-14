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
    const trigger = thing.getByTestId(`space-thing-${kind}`);
    await trigger.focus();
    await trigger.press('Enter');
  };
  await openMenu('diagram');
  await expect(page.getByRole('menuitem', { name: 'New Diagram', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Copy link', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Delete / })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).fill('Target context');
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).press('Enter');
  await expect(thing.getByTestId('space-thing-diagram')).toHaveText('Target context');
  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toBeFocused();
  await canvas.focus();
  await expect(page.getByRole('textbox', { name: 'Diagram name', exact: true })).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
  await expect(thing.getByRole('status')).toHaveText('Link copied.');
  const diagramLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(diagramLink).pathname).toMatch(/^\/spaces\/[^/]+\/diagrams\/[^/]+$/);

  await openMenu('graph');
  await expect(page.getByRole('menuitem', { name: 'Colour…', exact: true })).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Copy permanent link', exact: true }),
  ).toBeVisible();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).fill('Target path');
  await page.getByRole('textbox', { name: 'Graph name', exact: true }).press('Enter');
  await expect(thing.getByTestId('space-thing-graph')).toHaveText('Target path');
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
  await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
  const graphLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(graphLink).toContain(diagramLink);
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Copy permanent link', exact: true }).click();
  const permanent = await page.evaluate(() => navigator.clipboard.readText());
  expect(permanent).not.toBe(graphLink);
  expect(new URL(permanent).pathname).toMatch(/^\/spaces\/[^/]+\/graphs\/[^/]+$/);

  await openMenu('graph');
  await expect(
    page.getByRole('menuitem', { name: 'Delete Target path', exact: true }),
  ).toBeDisabled();
  await page.getByRole('menuitem', { name: 'New Graph', exact: true }).click();
  await expect(thing.getByTestId('space-thing-graph')).toHaveText('Graph 1');
  await openMenu('graph');
  await page.getByRole('menuitem', { name: 'Delete Graph 1', exact: true }).click();
  await expect(thing.getByTestId('space-thing-graph')).toHaveText('Target path');

  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'New Diagram', exact: true }).click();
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).fill('Created from rail');
  await page.getByRole('textbox', { name: 'Diagram name', exact: true }).press('Enter');
  await expect(thing.getByTestId('space-thing-diagram')).toHaveText('Created from rail');
  await openMenu('diagram');
  await page.getByRole('menuitem', { name: 'Delete Created from rail', exact: true }).click();
  await expect(thing.getByTestId('space-thing-diagram')).toHaveText('Target context');
  await expect(canvas).toHaveText(containingDiagram ?? '');
}

/** The Space Thing entity menu and its Alias creation, through both production hosts. */
export async function exerciseSpaceThingEntityMenu(page: Page, thing: Locator): Promise<void> {
  const id = await thing.getAttribute('data-id');
  if (id === null) throw new Error('Space Thing id missing');
  const card = page.locator(`.react-flow__node[data-id="${id}"]`);
  const typography = (control: Locator) =>
    control.evaluate((element) => ({
      font: getComputedStyle(element).fontSize,
      icons: [...element.querySelectorAll('svg')].map((icon) => ({
        width: getComputedStyle(icon).width,
        height: getComputedStyle(icon).height,
      })),
    }));
  expect(await typography(card.getByTestId('space-thing-diagram'))).toEqual(
    await typography(page.locator('[data-testid="selected-canvas"]:visible')),
  );
  expect(await typography(card.getByTestId('space-thing-graph'))).toEqual(
    await typography(page.locator('[data-testid="active-graph"]:visible')),
  );
  const menu = async () => {
    const trigger = card.getByRole('button', { name: /^Actions for Thing/ });
    await trigger.focus();
    await trigger.press('Enter');
  };
  await menu();
  await expect(page.getByRole('menuitem')).toHaveText([
    'Rename',
    'Create Alias',
    'Enter',
    'Open in New Tab',
    'Copy link to Thing in Diagram',
    'Copy link to Thing',
    'Copy link to Space',
    'Remove from Diagram',
  ]);
  await expect(page.getByRole('menu').getByRole('separator')).toHaveCount(3);
  await expect(card.getByRole('button', { name: /^Enter/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Thing title', exact: true });
  await expect(title).toBeFocused();
  await title.fill('Space card');
  await title.press('Enter');
  await expect(card.getByRole('heading', { name: 'Space card', exact: true })).toBeVisible();
  await menu();
  await page.getByRole('menuitem', { name: 'Create Alias', exact: true }).click();
  await expect(title).toBeFocused();
  await title.fill('Space card alias');
  await title.press('Enter');
  const alias = page.locator('.react-flow__node').filter({
    has: page.getByRole('heading', { name: 'Space card alias', exact: true }),
  });
  await expect(alias.locator('[data-testid="thing"]')).toHaveAttribute('data-kind', 'alias');
  const openAlias = alias.getByRole('button', { name: 'Open Thing Space card alias' });
  await openAlias.focus();
  await openAlias.press('Enter');
  const aliasId = await alias.getAttribute('data-id');
  const embedded = page.locator(`.react-flow__node[data-id^="embedded:${aliasId}:"]`);
  await expect(embedded.first()).toBeVisible();
  expect(
    await alias.locator('.canvas-thing__body').evaluate((body) => getComputedStyle(body).height),
  ).toBe('100px');
  await expect(embedded.getByTestId('canvas-thing-actions')).toHaveCount(0);
  const aliasMenu = alias.getByRole('button', { name: 'Actions for Thing Space card alias' });
  await aliasMenu.focus();
  await aliasMenu.press('Enter');
  await expect(page.getByRole('menuitem', { name: /^Create Alias/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');
}
