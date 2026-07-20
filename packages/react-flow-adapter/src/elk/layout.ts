import type { LayoutOptions } from 'elkjs/lib/elk.bundled.js';

/**
 * ELK "layered" options for a left→right graph.
 * Reference: https://www.eclipse.org/elk/reference/algorithms/org-eclipse-elk-layered.html
 *
 * These came from React Flow's elkjs multiple-handles example and have not yet
 * been audited — see `.scratch/layout-seam/issues/05-audit-default-layout-options.md`,
 * which measured most of them as inert on the shapes that ship today.
 */
export const DEFAULT_ELK_LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.spacing.nodeNodeBetweenLayers': '160',
  'elk.spacing.nodeNode': '80',
  'elk.spacing.portPort': '18',
};

export const PORT_ID_SEPARATOR = '##';

/**
 * ELK port ids must be unique across the whole graph, but a handle id
 * (`<routeId>::out`) is the *same* on every card the route passes through.
 * Handing ELK the bare handle id leaves it unable to tell which card an edge
 * attaches to, so it resolves arbitrarily and the layout collapses — badly
 * enough to mislay even a single route. Namespacing by card id is what makes the
 * endpoint unambiguous. The render layer never sees these; `elkLayout` strips the
 * prefix back off, so ports keep their bare ids.
 */
export const elkPortId = (cardId: string, handleId: string): string =>
  `${cardId}${PORT_ID_SEPARATOR}${handleId}`;
