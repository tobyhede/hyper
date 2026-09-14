import { expect, type Locator, type Page } from '@playwright/test';
import { boxOf } from './graph';

/** Measure the visible embedding through the browser, independent of projection constants. */
export async function exerciseSpaceThingPadding(page: Page, parent: Locator, child: Locator) {
  const outer = await boxOf(parent, 'Space Thing');
  const inner = await boxOf(child, 'embedded Thing');
  // Derive canvas scale from the containing Thing, not from its projected bounds.
  const zoom = await parent.evaluate((node) =>
    node instanceof HTMLElement ? node.getBoundingClientRect().width / node.offsetWidth : 1,
  );
  expect((inner.x - outer.x) / zoom).toBeCloseTo(16, 0);
  expect((inner.y - outer.y) / zoom).toBeCloseTo(16, 0);
  await page.mouse.move(inner.x + 40 * zoom, inner.y + 12 * zoom);
  await page.mouse.down();
  await page.mouse.move(outer.x - 20 * zoom, outer.y - 20 * zoom, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const moved = await boxOf(child, 'embedded Thing at the top left');
      return [Math.round((moved.x - outer.x) / zoom), Math.round((moved.y - outer.y) / zoom)];
    })
    .toEqual([16, 16]);
  // Drag to the right edge. The visible portion ends at the same inset.
  const at = await boxOf(child, 'embedded Thing');
  await page.mouse.move(at.x + 40 * zoom, at.y + 12 * zoom);
  await page.mouse.down();
  await page.mouse.move(outer.x + outer.width - 20 * zoom, at.y + 110 * zoom, { steps: 16 });
  await page.mouse.up();
  const moved = await boxOf(child, 'embedded Thing at the right edge');
  const belongsToChild = (x: number) =>
    child.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), {
      x,
      y: moved.y + 12 * zoom,
    });
  expect(await belongsToChild(outer.x + outer.width - 18 * zoom)).toBe(true);
  expect(await belongsToChild(outer.x + outer.width - 14 * zoom)).toBe(false);
}

export async function exerciseSpaceThingFooter(page: Page, placement: Locator, child: Locator) {
  const id = await placement.getAttribute('data-id');
  const parent = page.locator(`.react-flow__node[data-id="${id}"]`);
  const footer = parent.locator('.canvas-thing__body');
  const zoom = await parent.evaluate((node) =>
    node instanceof HTMLElement ? node.getBoundingClientRect().width / node.offsetWidth : 1,
  );
  const single = await boxOf(footer, 'single-line title footer');
  expect(single.height / zoom).toBeLessThan(50);
  await parent.getByRole('button', { name: /^Edit Title / }).click();
  const editor = parent.getByRole('textbox');
  await editor.fill('Architecture\nA second title line\nA third title line');
  await editor.press('ControlOrMeta+Enter');
  await expect(parent.getByRole('heading', { name: /Architecture/ })).toBeVisible();
  const multiple = await boxOf(footer, 'multiline title footer');
  expect(multiple.height).toBeGreaterThan(single.height + 15 * zoom);
  expect(multiple.height / zoom).toBeLessThan(90);
  const outer = await boxOf(parent, 'Space Thing');
  const at = await boxOf(child, 'embedded Thing');
  await page.mouse.move(at.x + 40 * zoom, at.y + 12 * zoom);
  await page.mouse.down();
  await page.mouse.move(outer.x + 60 * zoom, multiple.y + 30 * zoom, { steps: 16 });
  await page.mouse.up();
  // The visible Diagram reaches the actual footer; it no longer ends 100px up.
  // React Flow may pan near the viewport edge during this drag.
  const settledOuter = await boxOf(parent, 'Space Thing after dragging');
  const settledFooter = await boxOf(footer, 'footer after dragging');
  const x = settledOuter.x + 55 * zoom;
  expect(
    await child.evaluate((node, p) => node.contains(document.elementFromPoint(p.x, p.y)), {
      x,
      y: settledFooter.y - 2 * zoom,
    }),
  ).toBe(true);
  expect(
    await child.evaluate((node, p) => node.contains(document.elementFromPoint(p.x, p.y)), {
      x,
      y: settledFooter.y + 2 * zoom,
    }),
  ).toBe(false);
}

export async function exerciseFloatingThingDock(page: Page, parent: Locator) {
  const name = await parent.getByRole('article').getAttribute('aria-label');
  const dock = page.getByRole('toolbar', { name: `Thing ${name}`, exact: true });
  await parent.hover({ position: { x: 8, y: 80 } });
  const outer = await boxOf(parent, 'Space Thing');
  const zoom = await parent.evaluate((node) =>
    node instanceof HTMLElement ? node.getBoundingClientRect().width / node.offsetWidth : 1,
  );
  const panel = await boxOf(dock, 'floating dock');
  expect((panel.y - outer.y) / zoom).toBeCloseTo(12, 0);
  expect((outer.x + outer.width - panel.x - panel.width) / zoom).toBeCloseTo(12, 0);
  await dock.getByRole('button', { name: /^Diagram:/ }).click({ delay: 120 });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await dock.getByRole('button', { name: /^Actions for Thing/ }).click({ delay: 120 });
  await expect(page.getByRole('menuitem', { name: 'Rename', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(parent.locator('.thing-rail__kind')).toBeHidden();
}
