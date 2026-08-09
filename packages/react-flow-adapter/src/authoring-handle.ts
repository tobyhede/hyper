/** Diameter of the graph-authoring handles, in canvas pixels. */
export const AUTHORING_HANDLE_DIAMETER = 24;

/**
 * Diameter of a per-graph overview port, in canvas pixels.
 *
 * Declared once and consumed by both the handle declaration and the rendered
 * element, because the two must agree: React Flow builds `handleBounds` from the
 * declaration, and any forced remeasure rebuilds them from the DOM. If these
 * drift, an Edge attaches off-centre the moment something remeasures.
 */
export const GRAPH_PORT_DIAMETER = 11;
