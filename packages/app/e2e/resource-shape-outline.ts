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
 * glyph is inside the fill. `wholeTitleLines` asks whether every drawn Title
 * Line lies wholly inside the heading and the body's content box, so none is
 * cut partway. The rectangle draws no outline: its outline is the Resource's
 * own border, and it answers from the rect itself.
 */
export interface DrawnOutline {
  readonly shape: string | null;
  readonly size: readonly [number, number];
  readonly touchesSideMidpoints: boolean;
  readonly fillsCorner: boolean;
  readonly holdsTitleAndGlyph: boolean;
  readonly wholeTitleLines: boolean;
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
    const drawing = svg?.querySelector('.canvas-resource__outline-edge');
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

    const body = element.querySelector('.canvas-resource__body');
    const heading = element.querySelector('.canvas-resource__title-heading');
    const wholeTitleLines =
      body !== null &&
      heading !== null &&
      (() => {
        const bodyBox = body.getBoundingClientRect();
        const bodyStyle = getComputedStyle(body);
        const room = {
          top: bodyBox.top + Number.parseFloat(bodyStyle.paddingTop),
          bottom: bodyBox.bottom - Number.parseFloat(bodyStyle.paddingBottom),
        };
        const headingBox = heading.getBoundingClientRect();
        return [...heading.querySelectorAll('.canvas-resource__title-line')].every((line) => {
          const box = line.getBoundingClientRect();
          if (box.height === 0) return true;
          return [room, headingBox].every(
            (clip) => box.top >= clip.top - 0.5 && box.bottom <= clip.bottom + 0.5,
          );
        });
      })();

    return {
      shape,
      size,
      touchesSideMidpoints,
      fillsCorner: inside(outer.left + 2, outer.top + 2),
      holdsTitleAndGlyph,
      wholeTitleLines,
    };
  });

/**
 * How a Closed Resource's selection ring and edge are drawn against its Shape,
 * read in the browser from the drawn strokes.
 *
 * `ringFollowsOutline` asks whether the ring is drawn as a stroke of the
 * outline's own geometry, standing beyond the edge at the top side's midpoint,
 * and not as a ring around the rect: the rect casts no box shadow and the ring
 * does not reach the rect's corner. `ringShown` is whether a ring is drawn at
 * all, `edge` is the edge's stroke, and `rectBorder` whether the rect draws a
 * border of its own.
 */
export interface OutlineTreatment {
  readonly ringShown: boolean;
  readonly ringFollowsOutline: boolean;
  readonly edge: 'dotted' | 'solid';
  readonly rectBorder: boolean;
}

/** The selection ring and edge a `.canvas-resource` element with a drawn Shape draws. */
export const outlineTreatment = (resource: Locator): Promise<OutlineTreatment> =>
  resource.evaluate((element): OutlineTreatment => {
    const style = getComputedStyle(element);
    const svg = element.querySelector('.canvas-resource__outline');
    const ring = svg?.querySelector('.canvas-resource__outline-ring');
    const edge = svg?.querySelector('.canvas-resource__outline-edge');
    if (
      !(svg instanceof SVGSVGElement) ||
      !(ring instanceof SVGGeometryElement) ||
      !(edge instanceof SVGGeometryElement)
    ) {
      throw new Error('no drawn outline');
    }
    const outer = element.getBoundingClientRect();
    const box = svg.viewBox.baseVal;
    // Four units, in the outline's own, beyond the top midpoint and the corner.
    const aboveMidpoint = new DOMPoint(box.width / 2, -4);
    const beyondCorner = new DOMPoint(-4, -4);
    const ringShown = getComputedStyle(ring).display !== 'none';
    const dashes = getComputedStyle(edge).strokeDasharray;
    return {
      ringShown,
      ringFollowsOutline:
        ringShown &&
        style.boxShadow === 'none' &&
        outer.width > 0 &&
        ring.isPointInStroke(aboveMidpoint) &&
        !edge.isPointInStroke(aboveMidpoint) &&
        !ring.isPointInStroke(beyondCorner),
      edge: dashes === 'none' || dashes === '' ? 'solid' : 'dotted',
      rectBorder: style.borderTopStyle !== 'none' && Number.parseFloat(style.borderTopWidth) > 0,
    };
  });
