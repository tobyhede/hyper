/**
 * Diameter of a Thing's four Edge anchors, in canvas pixels.
 *
 * Declared once and consumed by the handle declaration, the rendered element and
 * the attachment geometry, because all three must agree: React Flow builds
 * `handleBounds` from the declaration, any forced remeasure rebuilds them from
 * the DOM, and `anchorPoint` puts the Edge's end on the rim of the same circle.
 * If these drift, an Edge attaches off-centre.
 */
export const AUTHORING_HANDLE_DIAMETER = 24;
