import type { Locator } from '@playwright/test';

/**
 * What a Closed Resource's drawn outline covers, read in the browser from the
 * outline's own geometry rather than from the stylesheet.
 *
 * `touchesSideMidpoints` asks, for each side of the Resource's rect, whether a
 * point one unit in from that side's midpoint is inside the outline's fill — so
 * an outline that stood in from any side would answer false. `fillsCorner`
 * asks the same of the top-left corner, which only the rectangle fills.
 * `holdsTitleAndGlyph` asks whether every corner of the Title's box and the kind
 * glyph is inside the fill. The rectangle draws no outline: its outline is the
 * Resource's own border, and it answers from the rect itself.
 */
export interface DrawnOutline {
  readonly shape: string | null;
  readonly size: readonly [number, number];
  readonly touchesSideMidpoints: boolean;
  readonly fillsCorner: boolean;
  readonly holdsTitleAndGlyph: boolean;
}

/** The outline a `.canvas-resource` element draws. */
export const drawnOutline = (resource: Locator): Promise<DrawnOutline> =>
  resource.evaluate((element): DrawnOutline => {
    const shape = element.getAttribute('data-resource-shape');
    const size = [
      element instanceof HTMLElement ? element.offsetWidth : 0,
      element instanceof HTMLElement ? element.offsetHeight : 0,
    ] as const;
    const outer = element.getBoundingClientRect();
    const svg = element.querySelector('.canvas-resource__outline');
    const drawing = svg?.firstElementChild;
    const contents = [
      element.querySelector('.canvas-resource__body'),
      element.querySelector('.resource-rail__kind'),
    ];

    const inside: (x: number, y: number) => boolean =
      svg instanceof SVGSVGElement && drawing instanceof SVGGeometryElement
        ? (x, y) => {
            const box = svg.viewBox.baseVal;
            const point = new DOMPoint(
              ((x - outer.left) / outer.width) * box.width,
              ((y - outer.top) / outer.height) * box.height,
            );
            return drawing.isPointInFill(point);
          }
        : (x, y) => x >= outer.left && x <= outer.right && y >= outer.top && y <= outer.bottom;

    const midX = outer.left + outer.width / 2;
    const midY = outer.top + outer.height / 2;
    const touchesSideMidpoints = [
      inside(midX, outer.top + 1),
      inside(outer.right - 1, midY),
      inside(midX, outer.bottom - 1),
      inside(outer.left + 1, midY),
    ].every(Boolean);

    const holdsTitleAndGlyph = contents.every((content) => {
      if (content === null) return false;
      const box = content.getBoundingClientRect();
      return [
        inside(box.left + 1, box.top + 1),
        inside(box.right - 1, box.top + 1),
        inside(box.right - 1, box.bottom - 1),
        inside(box.left + 1, box.bottom - 1),
      ].every(Boolean);
    });

    return {
      shape,
      size,
      touchesSideMidpoints,
      fillsCorner: inside(outer.left + 2, outer.top + 2),
      holdsTitleAndGlyph,
    };
  });
