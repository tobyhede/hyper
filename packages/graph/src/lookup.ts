import type {
  ContentVia,
  Resource,
  ResourceContent,
  ResourceId,
  Graph,
  GraphId,
  Map,
  UUID,
} from '@project/core';
import type { Space } from './space';

/**
 * Contextual entity resolution over a validated Space.
 *
 * A Map owns its Graphs (ADR 0040) and `space.graphs` is a flatten across
 * every Map, so an id taken off that collection has lost the one
 * resource ownership adds — which Map's Resources its Edges are closed over, and
 * which Map an Edit to it belongs in. Every answer here therefore arrives
 * with its context already resolved, rather than as a bare value a caller has to
 * go looking for the rest of.
 *
 * The values are built once, during intake, and closed over by
 * {@link SpaceLookup}. Nothing outside this module can reach the Maps behind it,
 * which is what makes "the index" something a Space *has* rather than a set of
 * parallel collections every caller may read, index a second way, or disagree
 * with.
 */

/**
 * A Map, and the Graph it opens active on.
 *
 * The Active Graph is resolved once, here, rather than at each reader: it is the
 * Graph the Map names, or its first (ADR 0040). Resolving it does **not**
 * fill the authored optional — `map` is the exact authored value, so a
 * snapshot or an export written from it preserves the absence.
 */
export interface ResolvedMap {
  /** The exact authored value in `space.maps`. */
  readonly map: Map;
  /** The exact owned Graph: the authored choice, or the first-Graph fallback. */
  readonly activeGraph: Graph;
}

/** A Graph, and the Map that owns it. */
export interface OwnedGraph {
  /** The exact nested value, also present in `space.graphs`. */
  readonly graph: Graph;
  /** The canonical contextual value `lookup.map` answers for its owner. */
  readonly owner: ResolvedMap;
}

/**
 * The one interface for identity lookup over a Space. O(1), total over the
 * Space's own entities, and canonical: two calls with one id answer the same
 * value, and a Graph's `owner` is the very value its owning Map's id resolves
 * to.
 */
export interface SpaceLookup {
  resource(id: ResourceId): Resource | undefined;
  map(id: UUID): ResolvedMap | undefined;
  graph(id: GraphId): OwnedGraph | undefined;
}

/** A Resource that owns its content: every kind but a Reference Resource. */
type ContentOwner = Exclude<Resource, { kind: 'reference' }>;

function ownedContent(resource: ContentOwner, via: ContentVia): ResourceContent {
  switch (resource.kind) {
    case 'markdown':
      return { kind: 'markdown', source: resource.body, via };
    case 'image':
      return { kind: 'image', url: resource.url, via };
    case 'space':
      return {
        kind: 'space',
        view: {
          spaceId: resource.spaceId,
          map: resource.map,
          graph: resource.graph,
          framing: resource.framing,
        },
        via,
      };
    case 'ur':
      return { kind: 'ur', via };
  }
}

/**
 * What `resource` draws as its content. Markdown, Image, Space and Ur Resources
 * answer their own with `via: 'self'`; a Reference Resource answers its
 * Target's with `via: 'reference'`, following one hop (ADR 0009).
 *
 * Total: it takes the Resource rather than an id, so there is nothing to not
 * find. `unresolved` answers the two states intake refuses and the lookup's
 * type cannot rule out: a missing Target, and a Target that is itself a
 * Reference Resource.
 */
export function resolveResourceContent(space: Space, resource: Resource): ResourceContent {
  if (resource.kind !== 'reference') return ownedContent(resource, 'self');
  const target = space.lookup.resource(resource.target);
  if (target === undefined || target.kind === 'reference') {
    return { kind: 'unresolved', via: 'reference' };
  }
  return ownedContent(target, 'reference');
}

/**
 * The one failure building the lookup can meet, and it is not one a document can
 * reach: `positionedMapSchema` requires at least one Graph, and every Space
 * arrives through that parse.
 *
 * It exists because `min(1)` does not reach the type — `noUncheckedIndexedAccess`
 * widens the first read to `| undefined` — so a total function needs an answer
 * for a state no document is in. Reporting it as a shape failure naming the
 * Map says exactly what the schema would have, in the one place still able to
 * observe it, rather than inventing a Graph or asserting the read away.
 */
type SpaceLookupResult =
  | { readonly ok: true; readonly lookup: SpaceLookup }
  | { readonly ok: false; readonly mapWithoutGraph: UUID };

/**
 * Build the lookup over an already reference-checked Space.
 *
 * Order matters: every `ResolvedMap` is built first, so the `OwnedGraph`
 * values below can close over the *same* value the owner's id answers with. Two
 * passes rather than one is what makes `lookup.graph(id)?.owner ===
 * lookup.map(ownerId)` hold as identity rather than as equality.
 */
export function buildSpaceLookup(input: {
  readonly resources: readonly Resource[];
  readonly maps: readonly Map[];
}): SpaceLookupResult {
  const resolvedMaps = new Map<UUID, ResolvedMap>();
  for (const m of input.maps) {
    const activeGraph = m.graphs.find((graph) => graph.id === m.activeGraph) ?? m.graphs[0];
    if (activeGraph === undefined) return { ok: false, mapWithoutGraph: m.id };
    resolvedMaps.set(m.id, { map: m, activeGraph });
  }

  const ownedGraphs = new Map<GraphId, OwnedGraph>();
  for (const owner of resolvedMaps.values()) {
    for (const graph of owner.map.graphs) {
      ownedGraphs.set(graph.id, { graph, owner });
    }
  }

  const resources = new Map<ResourceId, Resource>(
    input.resources.map((resource) => [resource.id, resource]),
  );
  return {
    ok: true,
    lookup: {
      resource: (id) => resources.get(id),
      map: (id) => resolvedMaps.get(id),
      graph: (id) => ownedGraphs.get(id),
    },
  };
}
