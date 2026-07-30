import type { LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import type { CardId } from '@project/core';

/**
 * ELK "layered" options for a left→right graph.
 * Reference: https://www.eclipse.org/elk/reference/algorithms/org-eclipse-elk-layered.html
 *
 * Each option is here for one of three reasons — a rule the domain requires, an
 * explicit statement of an ELK default, or cosmetic tuning. Say which when adding
 * one. See `.scratch/layout-seam/issues/05-audit-default-layout-options.md`.
 */
export const DEFAULT_ELK_LAYOUT_OPTIONS: LayoutOptions = {
  // The strategy itself: a layered graph is what a route-driven space is.
  'elk.algorithm': 'layered',

  // Explicit statement of ELK's default (layered routes orthogonally), now that
  // the app actually *draws* ELK's routed geometry rather than discarding it and
  // letting React Flow bezier between the handles. Cyclic routes and routes that
  // disagree on shared-card order can both produce back-edges; this routes them
  // as channels around the cards rather than self-curling stubs. See
  // `.scratch/layout-seam/issues/03-render-elk-edge-routing.md`.
  'elk.edgeRouting': 'ORTHOGONAL',

  // Explicit statement of ELK's default. Inert — removing it gives byte-identical
  // geometry — but it states the left-to-right reading axis a route follows.
  'elk.direction': 'RIGHT',

  // Explicit statement of ELK's default, and a measured choice (issue 08).
  // BRANDES_KOEPF lays a 2-route space out with *zero* vertical deviation in the
  // rails; NETWORK_SIMPLEX introduces some. Above ~3 routes sharing a spine that
  // reverses and NETWORK_SIMPLEX wins by 20-25%, but by then neither is straight,
  // so the win is marginal where BRANDES_KOEPF's is qualitative. Revisit if real
  // spaces routinely carry four or more routes.
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',

  // Cosmetic, tuned to the 260x146 card. `nodeNode: 80` came from React Flow's
  // *plain* elkjs example, not the multiple-handles one the README cites.
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
 * endpoint unambiguous. The render layer never sees these; `elkStrategy` strips the
 * prefix back off, so ports keep their bare ids.
 */
export const elkPortId = (cardId: CardId, handleId: string): string =>
  `${cardId}${PORT_ID_SEPARATOR}${handleId}`;
