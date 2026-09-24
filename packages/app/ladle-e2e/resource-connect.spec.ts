import { expect, test, type Page } from '@playwright/test';
import { edgeNamed } from '../e2e/edge-chrome';

/**
 * The story's Pitch Graph runs 1 → 2 → 3 and 1 → 4 → 5 → 6, so Resource 3 has
 * somewhere new to go and Resource 1 → Resource 2 is already drawn.
 */

const open = async (page: Page): Promise<void> => {
  await page.goto('/?story=space--edge-toolbar--default&mode=preview');
  await expect(page.locator('.react-flow__edge[tabindex]')).toHaveCount(5);
};

const nodeNamed = (page: Page, name: string) =>
  page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('article', { name, exact: true }) })
    .first();

/** Where React Flow has put a node, in flow coordinates. */
const positionOf = (page: Page, name: string) =>
  nodeNamed(page, name).evaluate((element) => {
    const match = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/u.exec(
      element instanceof HTMLElement ? element.style.transform : '',
    );
    return { x: Number(match?.[1]), y: Number(match?.[2]) };
  });

/** Open Connect to Resource by keyboard through the Resource's Actions menu. */
async function openConnect(page: Page, name: string) {
  const node = nodeNamed(page, name);
  await node.click({ position: { x: 10, y: 10 } });
  await expect(node).toHaveClass(/\bselected\b/);
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: `Actions for Resource ${name}`, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Create Reference' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Connect to Resource' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
  const list = page.getByRole('dialog', { name: `Connect Resource ${name}` });
  await expect(list).toBeVisible();
  return list;
}

test(
  'Connect chooses a placed Resource by keyboard and lands on the Edge it draws',
  { tag: '@parity:resource-connect-draws-an-edge-from-the-keyboard' },
  async ({ page }) => {
    await open(page);
    const list = await openConnect(page, 'Resource 3');

    // One toggle per Resource kind, and no Spaces source.
    await expect(list.getByRole('button', { pressed: true })).toHaveCount(3);
    await expect(list.getByRole('button', { name: /^Spaces in this Meta Space/ })).toHaveCount(0);
    await expect(list.getByRole('button', { name: 'Connect to Resource 3' })).toHaveCount(0);
    await expect(list.getByRole('textbox', { name: 'Search resources' })).toBeFocused();
    await page.keyboard.type('6');
    await expect(list.getByRole('button', { name: /^Connect to Resource / })).toHaveCount(1);
    // Tab order: search, kind filters (one stop), rows.
    await page.keyboard.press('Tab');
    await expect(list.getByRole('button', { name: /^Markdown Resources, / })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(list.getByRole('button', { name: 'Connect to Resource 6' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(list).toHaveCount(0);
    const edge = edgeNamed(page, 'Edge from Resource 3 to Resource 6 in Pitch');
    await expect(edge).toBeFocused();
    await expect(edge).toHaveClass(/selected/);
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Edit Edge Resource 3 → Resource 6' }),
    ).toBeFocused();
  },
);

test(
  'Connect keeps a Resource it cannot reach listed, unavailable, with the reason',
  { tag: '@parity:resource-connect-keeps-refused-targets' },
  async ({ page }) => {
    await open(page);
    const list = await openConnect(page, 'Resource 1');

    const refused = list.getByRole('button', { name: 'Connect to Resource 2' });
    await expect(refused).toHaveAttribute('aria-disabled', 'true');
    await expect(refused).toContainText('These Resources are already connected in this Graph.');
    await refused.focus();
    await expect(refused).toBeFocused();
    await expect(list.getByRole('button', { name: 'Connect to Resource 3' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );

    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Actions for Resource Resource 1', exact: true }),
    ).toBeFocused();
  },
);

test(
  'New Resource creates a Markdown Resource beside this one and lands on the Edge to it',
  { tag: '@parity:resource-connect-creates-a-new-resource' },
  async ({ page }) => {
    await open(page);
    const before = await positionOf(page, 'Resource 3');
    const list = await openConnect(page, 'Resource 3');

    await list.getByRole('button', { name: 'Connect to a new Resource' }).press('Enter');

    await expect(list).toHaveCount(0);
    const edge = page.locator('.react-flow__edge[aria-label^="Edge from Resource 3 to "]');
    await expect(edge).toBeFocused();
    await expect(edge).toHaveClass(/selected/);
    const created = /^Edge from Resource 3 to (.+) in Pitch$/u.exec(
      (await edge.getAttribute('aria-label')) ?? '',
    )?.[1];
    expect(created).toBeDefined();
    await expect(nodeNamed(page, created ?? '')).toHaveAttribute('data-id', /./);
    const at = await positionOf(page, created ?? '');
    expect(at.x).toBeGreaterThan(before.x);
    expect(at.y).toBeCloseTo(before.y, 0);
  },
);
