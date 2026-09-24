import type { GraphId, MapId, ResourceId } from '@project/core';
import type { Space } from '@project/graph';
import { graphColor } from '@project/ui';
import { graphColorsByGraphId } from './colors';

/** A Graph as a Resources list row names it: its title and the colour the canvas draws it in. */
export interface MembershipGraph {
  readonly id: GraphId;
  readonly title: string;
  readonly color: string;
}

/**
 * A Resource's membership of one other Map, and the Graphs of **that Map**
 * with an Edge at it. Not a `ResourcePlacement` (`@project/core`): it holds no
 * rect, only that the Map has the Resource at all.
 *
 * The Graphs travel inside their Map rather than beside it because a Graph's
 * colour does not name it: two Maps' Graphs can share one. Add Map mints its
 * Graph in the palette's first slot (`space-authoring-operations.test.ts`,
 * "creates and selects an empty Map with one empty Active Graph"), so every Map
 * made that way starts on the same colour; and a stored Graph with no colour
 * takes a slot by its position across the whole Space (`graphColorsByGraphId`).
 * A colour is only readable next to the Map that owns it.
 */
export interface MapMembership {
  readonly mapId: MapId;
  readonly mapTitle: string;
  readonly graphs: readonly MembershipGraph[];
}

/** Each Resource's memberships of Maps other than the selected one, keyed by Resource. */
export type MapMemberships = ReadonlyMap<ResourceId, readonly MapMembership[]>;

const NO_MEMBERSHIPS: readonly MapMembership[] = [];

/**
 * Which Maps **other than** the selected one each Resource is in, in the Space's
 * declared Map order and each Map's authored Graph order.
 *
 * A Resource in no other Map is absent from the result rather than
 * mapped to an empty list, so `membershipsOf` is the one reader.
 */
export function otherMapMemberships(space: Space, selectedMapId: MapId): MapMemberships {
  const colors = graphColorsByGraphId(space);
  const memberships = new Map<ResourceId, MapMembership[]>();
  for (const map of space.maps) {
    if (map.id === selectedMapId) continue;
    for (const resource of space.resources) {
      if (map.positions[resource.id] === undefined) continue;
      const graphs = map.graphs
        .filter((graph) =>
          graph.edges.some((edge) => edge.from === resource.id || edge.to === resource.id),
        )
        .map((graph) => ({ id: graph.id, title: graph.title, color: graphColor(graph, colors) }));
      const membership = { mapId: map.id, mapTitle: map.title, graphs };
      const existing = memberships.get(resource.id);
      if (existing === undefined) memberships.set(resource.id, [membership]);
      else existing.push(membership);
    }
  }
  return memberships;
}

export const membershipsOf = (
  memberships: MapMemberships,
  resourceId: ResourceId,
): readonly MapMembership[] => memberships.get(resourceId) ?? NO_MEMBERSHIPS;

/** What a Map that places the Resource on none of its Graphs says in place of their titles. */
export const ON_NO_GRAPH = 'on no Graph';

/**
 * The membership as one sentence per Map, for the row's accessible description.
 * The tooltip draws the same sentence with a colour beside each Graph, which
 * `ResourcesPopover.test.tsx` ("names each Map in the tooltip in the very words
 * of the row’s description") holds, since a pointer and a screen reader should
 * not be told two different things.
 */
export const describeMembership = (membership: MapMembership): string =>
  `${membership.mapTitle}: ${
    membership.graphs.length === 0
      ? ON_NO_GRAPH
      : membership.graphs.map((graph) => graph.title).join(', ')
  }`;
