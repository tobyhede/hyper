import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { edgeNamed } from './edge-chrome';
import {
  activateGraph,
  nodeByTitle,
  positionOf,
  selectCanvas,
  selectResource,
  settled,
} from './graph';

/** A Resource's node by its name, the first line of a Title that may have several. */
const nodeNamed = (page: Page, name: string) =>
  page
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('article', { name, exact: true }) })
    .first();

/** Open Collection 1 on the Long Graph, where `T` is placed and reached by no Edge. */
async function openLong(page: Page): Promise<void> {
  await page.goto('/');
  await expect(nodeByTitle(page, 'A').first()).toBeVisible();
  await selectCanvas(page, 'Collection 1');
  await activateGraph(page, 'Long');
  await settled(page);
}

/** Open Connect to Resource by keyboard through the Resource's Actions menu. */
async function openConnect(page: Page, name: string) {
  await selectResource(nodeNamed(page, name));
  // Enter keyboard modality, so the menu opens as it does for a keyboard author.
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
  'Connect draws an Edge from the keyboard and lands on it, so Enter reaches its toolbar',
  { tag: '@parity:resource-connect-draws-an-edge-from-the-keyboard' },
  async ({ page }) => {
    await openLong(page);
    const list = await openConnect(page, 'T');

    const search = list.getByRole('textbox', { name: 'Search resources' });
    await expect(search).toBeFocused();
    await page.keyboard.type('B');
    await expect(list.getByRole('button', { name: /^Connect to (?!a new)/ })).toHaveCount(1);
    // Tab order: search, kind filters (one stop), rows.
    await page.keyboard.press('Tab');
    await expect(list.getByRole('button', { name: /^Markdown Resources, / })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(list.getByRole('button', { name: 'Connect to B', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(list).toHaveCount(0);
    const edge = edgeNamed(page, 'Edge from T to B in Long');
    await expect(edge).toBeFocused();
    await expect(edge).toHaveClass(/selected/);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');

    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Edit Edge T → B' })).toBeFocused();
  },
);

test(
  'Connect lists only placed Resources, and keeps a refused one with its reason',
  { tag: '@parity:resource-connect-keeps-refused-targets' },
  async ({ page }) => {
    await openLong(page);
    const list = await openConnect(page, 'A');

    // Anchored to the Actions trigger, on whichever side has room.
    const trigger = await page
      .getByRole('button', { name: 'Actions for Resource A', exact: true })
      .boundingBox();
    const hung = await list.boundingBox();
    expect(trigger).not.toBeNull();
    expect(hung).not.toBeNull();
    if (trigger !== null && hung !== null) {
      expect(hung.x).toBeLessThan(trigger.x + trigger.width);
      expect(hung.x + hung.width).toBeGreaterThan(trigger.x);
      const gap = Math.max(
        hung.y - (trigger.y + trigger.height),
        trigger.y - (hung.y + hung.height),
      );
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThan(20);
    }

    // A→B is already in Long: listed, unavailable, and saying why.
    const b = list.getByRole('button', { name: 'Connect to B', exact: true });
    await expect(b).toHaveAttribute('aria-disabled', 'true');
    await expect(b).toContainText('These Resources are already connected in this Graph.');
    await expect(list.getByRole('button', { name: 'Connect to C', exact: true })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    // E is Collection 2's, which this Map does not place.
    await expect(list.getByRole('button', { name: 'Connect to E', exact: true })).toHaveCount(0);
    // A itself is the source.
    await expect(list.getByRole('button', { name: 'Connect to A', exact: true })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Actions for Resource A', exact: true }),
    ).toBeFocused();
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '0');
  },
);

test(
  'New Resource creates a Markdown Resource beside this one and lands on the Edge to it',
  { tag: '@parity:resource-connect-creates-a-new-resource' },
  async ({ page }) => {
    await openLong(page);
    const before = await positionOf(nodeNamed(page, 'T'));
    const resources = await page.locator('.react-flow__node').count();
    const list = await openConnect(page, 'T');

    await list.getByRole('button', { name: 'Connect to a new Resource' }).press('Enter');

    await expect(list).toHaveCount(0);
    await expect(page.locator('.react-flow__node')).toHaveCount(resources + 1);
    const edge = page.locator('.react-flow__edge[aria-label^="Edge from T to Resource "]');
    await expect(edge).toBeFocused();
    await expect(edge).toHaveClass(/selected/);
    const title = /^Edge from T to (.+) in Long$/u.exec(
      (await edge.getAttribute('aria-label')) ?? '',
    );
    const created = nodeNamed(page, title?.[1] ?? '');
    const at = await positionOf(created);
    // Beside: to the right, top edges level.
    expect(at.x).toBeGreaterThan(before.x);
    expect(at.y).toBeCloseTo(before.y, 0);
    await expect(page.getByTestId('persistence-status')).toHaveAttribute('data-revision', '1');
  },
);

/**
 * The closing menu returns focus to its trigger; the list's initial focus must
 * win that, or the focus-out dismisses the list.
 */
test('Connect opens by pointer with the caret in the search, and stays open', async ({ page }) => {
  await openLong(page);
  await selectResource(nodeNamed(page, 'T'));
  await page.getByRole('button', { name: 'Actions for Resource T', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Connect to Resource' }).click();

  const list = page.getByRole('dialog', { name: 'Connect Resource T' });
  await expect(list.getByRole('textbox', { name: 'Search resources' })).toBeFocused();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.waitForTimeout(300);
  await expect(list).toBeVisible();
  await expect(list.getByRole('textbox', { name: 'Search resources' })).toBeFocused();
});
