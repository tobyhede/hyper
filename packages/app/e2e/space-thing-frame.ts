import { COLLAPSED_THING_SIZE } from '@project/core';
import { expect, type Locator, type Page } from '@playwright/test';
import { boxOf } from './graph';

/** Put the Space Thing into portal Edit so its embedded Diagram can be authored. */
export async function beginPortalEdit(page: Page, thing: Locator): Promise<void> {
  const id = await thing.getAttribute('data-id');
  if (id === null) throw new Error('Thing placement id missing');
  await thing.hover({ position: { x: 8, y: 80 } });
  await page
    .locator(`[data-thing-rail-for="${id}"]`)
    .getByTestId('canvas-thing-actions')
    .getByRole('button', { name: /^Edit Thing/ })
    .click({ delay: 120 });
}

/** Wheel the portal camera from the containing Thing's left inset. */
export async function zoomPortal(
  page: Page,
  thing: Locator,
  ticks: number,
  direction: 'in' | 'out',
): Promise<void> {
  const outer = await boxOf(thing, 'Open Space Thing');
  const child = page.locator('.react-flow__node[data-id^="embedded:"]').first();
  const before = await child.evaluate((node) =>
    node instanceof HTMLElement ? node.style.transform : '',
  );
  await page.mouse.move(outer.x + 8, outer.y + outer.height / 2);
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, direction === 'in' ? -120 : 120);
  }
  await expect
    .poll(async () =>
      child.evaluate((node) => (node instanceof HTMLElement ? node.style.transform : '')),
    )
    .not.toBe(before);
  await expect
    .poll(async () => {
      const first = await child.evaluate((node) =>
        node instanceof HTMLElement ? node.style.transform : '',
      );
      await page.waitForTimeout(180);
      const second = await child.evaluate((node) =>
        node instanceof HTMLElement ? node.style.transform : '',
      );
      return first === second;
    })
    .toBe(true);
}

const flowPixelSize = (thing: Locator) =>
  thing.evaluate((node) =>
    node instanceof HTMLElement
      ? { width: node.offsetWidth, height: node.offsetHeight }
      : { width: 0, height: 0 },
  );

const paintedOutsideWindow = async (parent: Locator): Promise<boolean> => {
  const parentId = await parent.getAttribute('data-id');
  if (parentId === null) throw new Error('Space Thing placement id missing');
  return parent.evaluate((node, id) => {
    if (!(node instanceof HTMLElement)) return true;
    const box = node.getBoundingClientRect();
    const samples = [
      { x: box.left - 16, y: box.top + box.height / 2 },
      { x: box.right + 16, y: box.top + box.height / 2 },
      { x: box.left + box.width / 2, y: box.top - 16 },
      { x: box.left + box.width / 2, y: box.bottom + 16 },
    ];
    for (const sample of samples) {
      if (
        sample.x < 0 ||
        sample.y < 0 ||
        sample.x > window.innerWidth ||
        sample.y > window.innerHeight
      ) {
        continue;
      }
      const hit = document.elementFromPoint(sample.x, sample.y);
      const embedded = hit?.closest('.react-flow__node[data-id^="embedded:"]');
      if (
        embedded instanceof HTMLElement &&
        embedded.dataset['id']?.startsWith(`embedded:${id}:`)
      ) {
        return true;
      }
    }
    return false;
  }, parentId);
};

/**
 * Portal Edit frames authored coordinates. A Thing's box stays Closed Size, and
 * a Thing that leaves the window does not paint on the containing canvas.
 */
export async function exercisePortalEditHostCanvas(
  page: Page,
  parent: Locator,
  child: Locator,
): Promise<void> {
  await beginPortalEdit(page, parent);
  const before = await flowPixelSize(child);
  expect(before).toEqual(COLLAPSED_THING_SIZE);
  expect(await paintedOutsideWindow(parent)).toBe(false);

  await zoomPortal(page, parent, 6, 'in');
  expect(await flowPixelSize(child)).toEqual(before);
  expect(await paintedOutsideWindow(parent)).toBe(false);

  await zoomPortal(page, parent, 16, 'in');
  expect(await paintedOutsideWindow(parent)).toBe(false);
  await zoomPortal(page, parent, 22, 'out');
  expect(await paintedOutsideWindow(parent)).toBe(false);
  expect(await flowPixelSize(child)).toEqual(before);
}

/** Measure the visible embedding through the browser, independent of projection constants. */
export async function exerciseSpaceThingPadding(page: Page, parent: Locator, child: Locator) {
  await beginPortalEdit(page, parent);
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
  await beginPortalEdit(page, parent);
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

/**
 * Edges the visible host Graph owns.
 *
 * Remapped embedded Edges are prefixed with the parent id. Every open Space
 * stays mounted (`OpenSpacesApplication`), so an unscoped `.react-flow__edge`
 * also hits the hidden target canvas.
 */
export async function hostGraphEdgeCount(page: Page, parent: Locator): Promise<number> {
  const id = await parent.getAttribute('data-id');
  if (id === null) throw new Error('Thing placement id missing');
  return page.locator(`.react-flow:visible .react-flow__edge:not([data-id^="${id}:"])`).count();
}

/** Edges the Space Thing's shown Graph draws inside the window. */
export async function embeddedGraphEdgeCount(page: Page, parent: Locator): Promise<number> {
  const id = await parent.getAttribute('data-id');
  if (id === null) throw new Error('Thing placement id missing');
  return page.locator(`.react-flow:visible .react-flow__edge[data-id^="${id}:"]`).count();
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
  await expect(dock.locator('.thing-rail__kind')).toBeHidden();
}
