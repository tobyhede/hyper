/**
 * How much of an Edge a Title may cover at rest: fitted to the line less the
 * arrowhead so it does not cover the joined Resources, capped at the ceiling, and
 * dropped entirely when it cannot hold about three characters and an ellipsis.
 *
 * All in canvas units with no zoom rule, so an Edge decides the same at every zoom.
 */

/** The widest a Title's box is ever drawn, at rest or revealed: a Title is a line, not a paragraph. */
export const EDGE_TITLE_CEILING = 224;

/** What a Title at rest leaves clear of its Edge's span: the arrowhead, and a margin either side. */
export const EDGE_TITLE_CLEARANCE = 28;

/**
 * The box's width beyond its text: 10px padding and a 3px border each side
 * (`edge-title.css`). The border matches the Active Graph's `strokeWidth: 3`,
 * held by `packages/react-flow-adapter/test/projection.test.ts`.
 */
export const EDGE_TITLE_BOX_CHROME = 26;

/** The least text width a Title at rest is drawn with: about three 12px characters and an ellipsis. */
export const EDGE_TITLE_LEAST_TEXT = 34;

/** Whether a Title draws at rest on an Edge, and how wide its box may be if it does. */
export type EdgeTitleRoom =
  { readonly kind: 'none' } | { readonly kind: 'fitted'; readonly width: number };

/** The room a Title has at rest on an Edge whose drawn line spans `span` canvas units. */
export function edgeTitleRoom(span: number): EdgeTitleRoom {
  const width = Math.min(EDGE_TITLE_CEILING, span - EDGE_TITLE_CLEARANCE);
  return width - EDGE_TITLE_BOX_CHROME < EDGE_TITLE_LEAST_TEXT
    ? { kind: 'none' }
    : { kind: 'fitted', width };
}
