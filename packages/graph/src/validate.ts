import { uuidSchema, type Resource, type Map, type UUID } from '@project/core';
import { repeatedGraphEdges } from './graph-edges';

/**
 * The resources and maps a reference check reads. Structural so it accepts both
 * a freshly parsed space file (inside `loadSpace`) and an already-built
 * `Space`. `maps` and `defaultMap` are optional: a space may declare
 * neither and open in an automatic view (ADR 0025).
 *
 * There is no `graphs` here, and that is the whole of ADR 0040 in one shape: a
 * graph is reached through the map that owns it, so a check written over a
 * space-level collection could not ask the question that matters — whether
 * an edge endpoint is a resource of *that* map.
 */
export interface Referenceable {
  readonly id: UUID;
  readonly resources: readonly Resource[];
  readonly maps?: readonly Map[] | undefined;
  readonly defaultMap?: UUID | undefined;
}

/**
 * Why a Space failed its reference check.
 *
 * The membership kinds name **ownership** (ADR 0040): a Map's position keys are
 * its Resource membership, and every Edge of an owned Graph is closed over
 * exactly that set. A reference that fails has two kinds rather than one "does
 * not resolve" — the Resource or Graph does not exist at all, or it exists and
 * belongs somewhere else. They are different mistakes and lead an author to
 * different places, which is the whole reason for the split.
 */
export type SpaceReferenceErrorKind =
  | 'duplicate-resource-id'
  | 'duplicate-graph-id'
  | 'duplicate-map-id'
  /** A Map's position names a Resource the Space does not hold. */
  | 'map-member-missing-resource'
  /** A Map opens active on a Graph no Map in the Space owns. */
  | 'map-active-graph-missing'
  /** A Map opens active on a Graph another Map owns. */
  | 'map-active-graph-outside-map'
  /** An Edge endpoint names a Resource the Space does not hold. */
  | 'graph-edge-missing-resource'
  /** An Edge endpoint names a Space Resource that is not a member of its own Map. */
  | 'graph-edge-resource-outside-map'
  | 'unresolved-default-map'
  | 'duplicate-graph-edge'
  | 'unresolved-reference-target'
  | 'reference-targets-self'
  | 'reference-targets-reference'
  | 'reference-target-must-own-content'
  | 'space-resource-reference-cycle';

/**
 * One failed cross-reference. Named for the space whose references it is about,
 * beside `ResourceFileError` and inside `SpaceError` — and deliberately not
 * `ReferenceError`, which is a JavaScript global that any file importing the
 * bare name would lose.
 */
export interface SpaceReferenceError {
  kind: SpaceReferenceErrorKind;
  /** The id that failed to resolve or was duplicated. */
  ref: string;
  /** Human-readable description, useful for surfacing in the UI or CLI. */
  message: string;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes];
}

/** Where one occurrence of a graph id sits: the map owning it, and its index there. */
interface GraphOccurrence {
  readonly map: Map;
  readonly index: number;
}

/**
 * Check every cross-reference resolves. Returns an empty array when the space is
 * internally consistent. Runs inside `loadSpace` over the freshly parsed file.
 *
 * **One failed reference earns one diagnosis.** Independent faults accumulate —
 * an author fixing a space wants all of them — but a single bad reference never
 * cascades into several kinds reporting the same fault from different angles.
 * That is why the endpoint and Active Graph checks below each choose between two
 * kinds rather than reporting both, and why a repeated graph id is one error
 * naming every occurrence rather than one error per occurrence after the first.
 *
 * Output is deterministic for the same input, and repeated facts keep authored
 * encounter order. The order of the category passes themselves carries no
 * meaning: read `kind` and `ref`, not position.
 */
export function validateReferences(space: Referenceable): SpaceReferenceError[] {
  const errors: SpaceReferenceError[] = [];

  const resourceById = new Map(space.resources.map((r) => [r.id, r]));
  const resourceIds = new Set(space.resources.map((r) => r.id));

  for (const id of duplicates(space.resources.map((r) => r.id))) {
    errors.push({
      kind: 'duplicate-resource-id',
      ref: id,
      message: `Duplicate resource id "${id}"`,
    });
  }

  const maps = space.maps ?? [];
  for (const id of duplicates(maps.map((m) => m.id))) {
    errors.push({ kind: 'duplicate-map-id', ref: id, message: `Duplicate map id "${id}"` });
  }

  // A graph id is unique across the **space**, although one map owns it
  // (ADR 0045). The flatten a space-subject view draws keys colour and
  // activation on the id alone, and the lookup intake builds would drop one of a
  // pair in silence while both stayed in the collection.
  //
  // Every occurrence is collected before anything is reported, because the fault
  // is the *id*, not its second appearance: an id used four times is one resource
  // wrong with the document, and the message that helps an author is the list of
  // where to look. Same-map repeats and cross-map ones are the same kind
  // for the same reason — they differ only in where the fix goes.
  const occurrencesByGraphId = new Map<string, GraphOccurrence[]>();
  for (const map of maps) {
    map.graphs.forEach((graph, index) => {
      const occurrences = occurrencesByGraphId.get(graph.id);
      if (occurrences === undefined) occurrencesByGraphId.set(graph.id, [{ map, index }]);
      else occurrences.push({ map, index });
    });
  }
  for (const [graphId, occurrences] of occurrencesByGraphId) {
    if (occurrences.length < 2) continue;
    const where = occurrences.map(({ map, index }) => `map "${map.id}" graph ${index}`).join(', ');
    errors.push({
      kind: 'duplicate-graph-id',
      ref: graphId,
      message: `Duplicate graph id "${graphId}" at ${where}`,
    });
  }

  for (const map of maps) {
    // A map's position keys **are** its resource membership (ADR 0040). They may
    // omit resources — a resource the map leaves out is simply not in this map — but
    // may not name a resource that does not exist, a position left behind by a
    // deleted resource (ADR 0025).
    //
    // A key naming a missing resource still joins `members`, which is what keeps
    // this the *only* fault reported for it: an edge into that resource is then a
    // consequence of this fault rather than a second one.
    const members = new Set<string>();
    for (const key of Object.keys(map.positions)) {
      const resourceId = uuidSchema.parse(key);
      members.add(resourceId);
      if (!resourceIds.has(resourceId)) {
        errors.push({
          kind: 'map-member-missing-resource',
          ref: resourceId,
          message: `Map "${map.id}" holds a position for resource "${resourceId}", which the space does not hold`,
        });
      }
    }

    // Every edge endpoint of an owned graph names a resource **in that map** —
    // one rule, and the two kinds below are two readings of failing it rather
    // than two rules. An endpoint naming no resource at all is a dangling reference;
    // one naming a resource another map holds is a closure failure, and telling
    // an author which they have is the difference between hunting for a deleted
    // resource and adding a member.
    for (const graph of map.graphs) {
      // Asked once, up front, and read inside the loop below so a graph's
      // diagnostics still arrive in edge order rather than in two passes.
      const repeats = repeatedGraphEdges(graph.edges);
      graph.edges.forEach((edge, index) => {
        for (const end of ['from', 'to'] as const) {
          if (members.has(edge[end])) continue;
          errors.push(
            resourceIds.has(edge[end])
              ? {
                  kind: 'graph-edge-resource-outside-map',
                  ref: edge[end],
                  message: `Graph "${graph.id}" edge ${index} names "${edge[end]}" as its ${end}, which is a resource of the space but not a member of its map "${map.id}"`,
                }
              : {
                  kind: 'graph-edge-missing-resource',
                  ref: edge[end],
                  message: `Graph "${graph.id}" edge ${index} names "${edge[end]}" as its ${end}, which the space does not hold`,
                },
          );
        }

        const firstIndex = repeats.get(index);
        if (firstIndex !== undefined) {
          const ref = `${edge.from} → ${edge.to}`;
          errors.push({
            kind: 'duplicate-graph-edge',
            ref,
            message: `Graph "${graph.id}" repeats edge ${ref} at index ${index} (first at index ${firstIndex})`,
          });
        }
      });
    }

    // A map also points at one graph — the one that opens active (ADR 0026)
    // — and it must be one the map **owns**. Split the same way the endpoints
    // above are: a graph nothing in the space owns is missing, while one a
    // second map owns exists and is simply not this map's to open on.
    const activeGraph = map.activeGraph;
    if (activeGraph !== undefined && !map.graphs.some((g) => g.id === activeGraph)) {
      errors.push(
        occurrencesByGraphId.has(activeGraph)
          ? {
              kind: 'map-active-graph-outside-map',
              ref: activeGraph,
              message: `Map "${map.id}" opens active on graph "${activeGraph}", which another map owns`,
            }
          : {
              kind: 'map-active-graph-missing',
              ref: activeGraph,
              message: `Map "${map.id}" opens active on graph "${activeGraph}", which no map in the space owns`,
            },
      );
    }
  }

  // `defaultMap` names a declared Map and nothing else.
  if (space.defaultMap !== undefined) {
    const declared = new Set(maps.map((m) => m.id));
    if (!declared.has(space.defaultMap)) {
      errors.push({
        kind: 'unresolved-default-map',
        ref: space.defaultMap,
        message: `defaultMap "${space.defaultMap}" does not name a declared Map`,
      });
    }
  }

  for (const resource of space.resources) {
    if (resource.kind !== 'reference') continue;
    if (resource.target === resource.id) {
      errors.push({
        kind: 'reference-targets-self',
        ref: resource.id,
        message: `Reference Resource "${resource.id}" points at itself`,
      });
      continue;
    }
    const target = resourceById.get(resource.target);
    if (!target) {
      errors.push({
        kind: 'unresolved-reference-target',
        ref: resource.target,
        message: `Reference Resource "${resource.id}" targets missing resource "${resource.target}"`,
      });
      continue;
    }
    if (target.kind === 'reference') {
      errors.push({
        kind: 'reference-targets-reference',
        ref: resource.target,
        message: `Reference Resource "${resource.id}" targets reference "${resource.target}"; referencing is a single hop`,
      });
      continue;
    }
  }

  for (const resource of space.resources) {
    if (resource.kind !== 'space' || resource.spaceId !== space.id) continue;
    errors.push({
      kind: 'space-resource-reference-cycle',
      ref: resource.spaceId,
      message: `Space Resource "${resource.id}" targets its own Space "${resource.spaceId}"`,
    });
  }

  return errors;
}
