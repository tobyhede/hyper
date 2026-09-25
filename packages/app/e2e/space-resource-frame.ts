import { COLLAPSED_RESOURCE_SIZE } from '@project/core';
import { expect, type Locator, type Page } from '@playwright/test';
import {
  boxOf,
  createResourceControl,
  resourceControls,
  resourceToolbar,
  selectResource,
} from './graph';

/**
 * Put the Space Resource into portal Edit so its embedded Map can be authored.
 *
 * Edit is on the Resource's floating toolbar, drawn while it is selected (ADR 0102).
 */
export async function beginPortalEdit(page: Page, resource: Locator): Promise<void> {
  await resourceControls(page, resource);
  await (
    await resourceToolbar(page, resource)
  )
    .getByRole('button', { name: /^Edit Resource/ })
    .click({ delay: 120 });
  await expect(
    (await resourceToolbar(page, resource)).getByRole('button', { name: /^Done Resource/ }),
  ).toBeVisible();
}

/** Wheel the portal camera from the containing Resource's left inset. */
export async function zoomPortal(
  page: Page,
  resource: Locator,
  ticks: number,
  direction: 'in' | 'out',
): Promise<void> {
  const outer = await boxOf(resource, 'Open Space Resource');
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

const flowPixelSize = (resource: Locator) =>
  resource.evaluate((node) =>
    node instanceof HTMLElement
      ? { width: node.offsetWidth, height: node.offsetHeight }
      : { width: 0, height: 0 },
  );

const paintedOutsideWindow = async (parent: Locator): Promise<boolean> => {
  const parentId = await parent.getAttribute('data-id');
  if (parentId === null) throw new Error('Space Resource placement id missing');
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
 * Portal Edit frames authored coordinates. A Resource's box stays Closed Size, and
 * a Resource that leaves the window does not paint on the containing canvas.
 */
export async function exercisePortalEditHostCanvas(
  page: Page,
  parent: Locator,
  child: Locator,
): Promise<void> {
  await beginPortalEdit(page, parent);
  const before = await flowPixelSize(child);
  expect(before).toEqual(COLLAPSED_RESOURCE_SIZE);
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
export async function exerciseSpaceResourcePadding(page: Page, parent: Locator, child: Locator) {
  await beginPortalEdit(page, parent);
  const outer = await boxOf(parent, 'Space Resource');
  const inner = await boxOf(child, 'embedded Resource');
  // Derive canvas scale from the containing Resource, not from its projected bounds.
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
      const moved = await boxOf(child, 'embedded Resource at the top left');
      return [Math.round((moved.x - outer.x) / zoom), Math.round((moved.y - outer.y) / zoom)];
    })
    .toEqual([16, 16]);
  // Drag to the right edge. The visible portion ends at the same inset.
  const at = await boxOf(child, 'embedded Resource');
  await page.mouse.move(at.x + 40 * zoom, at.y + 12 * zoom);
  await page.mouse.down();
  await page.mouse.move(outer.x + outer.width - 20 * zoom, at.y + 110 * zoom, { steps: 16 });
  await page.mouse.up();
  const moved = await boxOf(child, 'embedded Resource at the right edge');
  const belongsToChild = (x: number) =>
    child.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), {
      x,
      y: moved.y + 12 * zoom,
    });
  expect(await belongsToChild(outer.x + outer.width - 18 * zoom)).toBe(true);
  expect(await belongsToChild(outer.x + outer.width - 14 * zoom)).toBe(false);
}

export async function exerciseSpaceResourceFooter(page: Page, placement: Locator, child: Locator) {
  const id = await placement.getAttribute('data-id');
  const parent = page.locator(`.react-flow__node[data-id="${id}"]`);
  const footer = parent.locator('.canvas-resource__body');
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
  const outer = await boxOf(parent, 'Space Resource');
  const at = await boxOf(child, 'embedded Resource');
  await beginPortalEdit(page, parent);
  await page.mouse.move(at.x + 40 * zoom, at.y + 12 * zoom);
  await page.mouse.down();
  await page.mouse.move(outer.x + 60 * zoom, multiple.y + 30 * zoom, { steps: 16 });
  await page.mouse.up();
  // The visible Map reaches the actual footer.
  // React Flow may pan near the viewport edge during this drag.
  const settledOuter = await boxOf(parent, 'Space Resource after dragging');
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
  if (id === null) throw new Error('Resource placement id missing');
  return page.locator(`.react-flow:visible .react-flow__edge:not([data-id^="${id}:"])`).count();
}

/** Edges the Space Resource's shown Graph draws inside the window. */
export async function embeddedGraphEdgeCount(page: Page, parent: Locator): Promise<number> {
  const id = await parent.getAttribute('data-id');
  if (id === null) throw new Error('Resource placement id missing');
  return page.locator(`.react-flow:visible .react-flow__edge[data-id^="${id}:"]`).count();
}

/** The size of a control, in whole screen pixels. */
const controlSize = async (control: Locator, label: string) => {
  const box = await boxOf(control, label);
  return { width: Math.round(box.width), height: Math.round(box.height) };
};

/**
 * A selected Resource's toolbar floats above its top-right corner (ADR 0102).
 *
 * Outside the Resource in the DOM and on screen, clear of the top anchor, the
 * Command Dock's control size at every zoom, and operable although the Open Space
 * Resource below it draws another Space's Resources.
 */
export async function exerciseResourceToolbarFloats(page: Page, parent: Locator) {
  const name = await parent.getByRole('article').getAttribute('aria-label');
  await selectResource(parent);
  const floating = await resourceToolbar(page, parent);
  const toolbar = floating.getByRole('toolbar', { name: `Resource ${name}`, exact: true });
  await expect(toolbar).toBeVisible();
  // Portalled out of the Resource, so nothing of it is drawn inside the node.
  await expect(parent.getByRole('toolbar')).toHaveCount(0);

  // An icon control on the Dock, measured against an icon control on the toolbar.
  const dockControl = createResourceControl(page, 'Markdown Resource');
  const actions = toolbar.getByRole('button', { name: /^Actions for Resource/ });
  const anchor = parent.locator('[data-handleid="authoring-source-top"]');

  const expectFloatsAboveCorner = async (when: string) => {
    const outer = await boxOf(parent, `Space Resource ${when}`);
    const panel = await boxOf(floating, `floating toolbar ${when}`);
    const top = await boxOf(anchor, `top anchor ${when}`);
    // Above the Resource and above its top anchor, which reaches past the border.
    expect(panel.y + panel.height).toBeLessThanOrEqual(outer.y);
    expect(panel.y + panel.height).toBeLessThanOrEqual(top.y);
    // Aligned to the Resource's right edge.
    expect(panel.x + panel.width).toBeCloseTo(outer.x + outer.width, 0);
    // The Dock's control size, whatever the canvas zoom.
    expect(await controlSize(actions, `toolbar control ${when}`)).toEqual(
      await controlSize(dockControl, 'Dock control'),
    );
  };

  // Measured on both sides of 100%: the zoom the canvas opens at, and past 1:1.
  const scaleOf = () =>
    parent.evaluate((node) =>
      node instanceof HTMLElement ? node.getBoundingClientRect().width / node.offsetWidth : 1,
    );
  const opening = await scaleOf();
  expect(opening).toBeLessThan(0.9);
  await expectFloatsAboveCorner(`at the opening zoom ${opening.toFixed(2)}`);
  // Operable while the embedded Map is drawn below it. Checked at the opening
  // zoom: zoomed in, the toolbar can land past the viewport edge.
  await expect(page.locator('.react-flow__node[data-id^="embedded:"]').first()).toBeVisible();
  await toolbar.getByRole('button', { name: /^Map:/ }).click({ delay: 120 });
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await actions.click({ delay: 120 });
  await expect(page.getByRole('menuitem', { name: 'Create Reference', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  await expect
    .poll(
      async () => {
        await zoomIn.click();
        await page.waitForTimeout(400);
        return scaleOf();
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(1.1);
  await expect(toolbar).toBeVisible();
  await expectFloatsAboveCorner(`zoomed in to ${(await scaleOf()).toFixed(2)}`);
}
