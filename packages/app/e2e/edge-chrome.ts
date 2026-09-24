import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Reading an Edge's Title and toolbar, shared by the application and Ladle
 * suites so the geometry reads cannot drift apart.
 */

export const edgeNamed = (page: Page, label: string): Locator =>
  page.locator(`.react-flow__edge[aria-label="${label}"]`);

/** An Edge's revealed toolbar, by the Edge's name: its Title, or `From → To`. */
export const edgeToolbar = (page: Page, name: string): Locator =>
  page.getByRole('toolbar', { name: `Edge ${name}`, exact: true });

/** The layer an Edge's Title and toolbar are drawn in. */
export async function edgeChrome(page: Page, edge: Locator): Promise<Locator> {
  const id = await edge.getAttribute('data-id');
  if (id === null) throw new Error('The Edge carries no React Flow id.');
  return page.locator(`[data-edge-chrome="${id}"]`);
}

/** A Title drawn at rest — a box, not yet a control — by the whole Title in its tooltip. */
export const restingTitle = (chrome: Locator, title: string): Locator =>
  chrome.locator(`span.edge-title[title="${title}"]`);

/** A point `fraction` along the Edge's drawn path, in screen pixels. */
export async function pointOnEdge(
  edge: Locator,
  fraction: number,
): Promise<{ x: number; y: number }> {
  return edge.locator('.react-flow__edge-path').evaluate((geometry, along) => {
    if (!(geometry instanceof SVGPathElement)) throw new Error('The Edge draws no path.');
    const transform = geometry.getScreenCTM();
    if (transform === null) throw new Error('The Edge has no screen transform.');
    const at = geometry
      .getPointAtLength(geometry.getTotalLength() * along)
      .matrixTransform(transform);
    return { x: at.x, y: at.y };
  }, fraction);
}

/** The straight distance between the drawn line's ends, in canvas units: what a resting Title is fitted against. */
export async function edgeSpan(page: Page, edge: Locator): Promise<number> {
  const [start, end] = await Promise.all([pointOnEdge(edge, 0), pointOnEdge(edge, 1)]);
  return Math.hypot(end.x - start.x, end.y - start.y) / (await canvasZoom(page));
}

export async function canvasZoom(page: Page): Promise<number> {
  const transform = await page
    .locator('.react-flow__viewport')
    .first()
    .evaluate((element) => getComputedStyle(element).transform);
  const scale = /matrix\(([-\d.e]+)/u.exec(transform)?.[1];
  expect(scale, 'the viewport carries a scale').toBeDefined();
  return Number(scale);
}

/** The widest a Title's box is drawn, in canvas units, read off its stylesheet. */
export const edgeTitleCeiling = (title: Locator): Promise<number> =>
  title.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue('--edge-title-ceiling')),
  );

export const isEllipsed = (text: Locator): Promise<boolean> =>
  text.evaluate((element) => element.scrollWidth > element.clientWidth);

/** Whether a press at the centre of `locator` would land inside it. */
export async function topmostIsWithin(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('The element has no box to press.');
  const handle = await locator.elementHandle();
  return page.evaluate(
    ([x, y, element]) => {
      const hit = document.elementFromPoint(x, y);
      return hit !== null && element?.contains(hit) === true;
    },
    [box.x + box.width / 2, box.y + box.height / 2, handle] as const,
  );
}
