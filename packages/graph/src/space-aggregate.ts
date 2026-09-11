import type { UUID } from '@project/core';
import { loadSpaceSnapshot, type Space, type SpaceError } from './space';

/** The aggregate intake brand's carrier. */
const SPACE_AGGREGATE_INTAKE: unique symbol = Symbol('space-aggregate-intake');

/** Identity lookup over every Space accepted by complete aggregate intake. */
export interface SpaceAggregateLookup {
  readonly space: (id: UUID) => Space | undefined;
}

/** A complete, validated Meta-rooted collection of Spaces. */
export interface SpaceAggregate {
  readonly metaSpaceId: UUID;
  readonly spaces: readonly Space[];
  readonly lookup: SpaceAggregateLookup;
  readonly [SPACE_AGGREGATE_INTAKE]: true;
}

interface SpaceThingLocation {
  readonly spaceId: UUID;
  readonly thingId: UUID;
  readonly targetSpaceId: UUID;
}

export type SpaceAggregateError =
  | {
      readonly kind: 'invalid-space-snapshot';
      readonly snapshotIndex: number;
      readonly errors: readonly SpaceError[];
    }
  | {
      readonly kind: 'duplicate-space-id';
      readonly spaceId: UUID;
      readonly snapshotIndexes: readonly number[];
    }
  | {
      readonly kind: 'duplicate-thing-id';
      readonly thingId: UUID;
      readonly spaceIds: readonly UUID[];
    }
  | { readonly kind: 'meta-space-missing'; readonly metaSpaceId: UUID }
  | ({ readonly kind: 'space-thing-target-missing' } & SpaceThingLocation)
  | ({ readonly kind: 'space-thing-reference-cycle' } & SpaceThingLocation)
  | { readonly kind: 'ordinary-space-unreferenced'; readonly spaceId: UUID }
  | ({
      readonly kind: 'space-thing-diagram-missing';
      readonly diagramId: UUID;
    } & SpaceThingLocation)
  | ({ readonly kind: 'space-thing-graph-missing'; readonly graphId: UUID } & SpaceThingLocation)
  | ({
      readonly kind: 'space-thing-graph-outside-diagram';
      readonly diagramId: UUID;
      readonly graphId: UUID;
    } & SpaceThingLocation);

export type LoadSpaceAggregateResult =
  | { readonly ok: true; readonly aggregate: SpaceAggregate }
  | { readonly ok: false; readonly errors: readonly SpaceAggregateError[] };

export interface LoadSpaceAggregateInput {
  readonly metaSpaceId: UUID;
  readonly snapshots: readonly unknown[];
}

class LoadedSpaceAggregate implements SpaceAggregate {
  readonly [SPACE_AGGREGATE_INTAKE] = true as const;
  readonly metaSpaceId: UUID;
  readonly spaces: readonly Space[];
  readonly lookup: SpaceAggregateLookup;

  constructor(metaSpaceId: UUID, spaces: readonly Space[], lookup: SpaceAggregateLookup) {
    this.metaSpaceId = metaSpaceId;
    this.spaces = spaces;
    this.lookup = lookup;
  }
}

/** Load every snapshot through the single-Space intake, then index the collection. */
export function loadSpaceAggregate({
  metaSpaceId,
  snapshots,
}: LoadSpaceAggregateInput): LoadSpaceAggregateResult {
  const spaces: Space[] = [];
  const errors: SpaceAggregateError[] = [];
  snapshots.forEach((snapshot, snapshotIndex) => {
    const loaded = loadSpaceSnapshot(snapshot);
    if (loaded.ok) spaces.push(loaded.space);
    else errors.push({ kind: 'invalid-space-snapshot', snapshotIndex, errors: loaded.errors });
  });
  if (errors.length > 0) return { ok: false, errors };

  const snapshotIndexesBySpaceId = new Map<UUID, number[]>();
  spaces.forEach((space, snapshotIndex) => {
    const indexes = snapshotIndexesBySpaceId.get(space.id);
    if (indexes === undefined) snapshotIndexesBySpaceId.set(space.id, [snapshotIndex]);
    else indexes.push(snapshotIndex);
  });
  for (const [spaceId, snapshotIndexes] of snapshotIndexesBySpaceId) {
    if (snapshotIndexes.length > 1) {
      errors.push({ kind: 'duplicate-space-id', spaceId, snapshotIndexes });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const spaceIdsByThingId = new Map<UUID, UUID[]>();
  for (const space of spaces) {
    for (const thing of space.things) {
      const spaceIds = spaceIdsByThingId.get(thing.id);
      if (spaceIds === undefined) spaceIdsByThingId.set(thing.id, [space.id]);
      else spaceIds.push(space.id);
    }
  }
  for (const [thingId, spaceIds] of spaceIdsByThingId) {
    if (spaceIds.length > 1) errors.push({ kind: 'duplicate-thing-id', thingId, spaceIds });
  }
  if (errors.length > 0) return { ok: false, errors };

  const byId = new Map(spaces.map((space) => [space.id, space]));
  if (!byId.has(metaSpaceId)) {
    return { ok: false, errors: [{ kind: 'meta-space-missing', metaSpaceId }] };
  }
  for (const space of spaces) {
    for (const thing of space.things) {
      if (thing.kind !== 'space' || byId.has(thing.spaceId)) continue;
      errors.push({
        kind: 'space-thing-target-missing',
        spaceId: space.id,
        thingId: thing.id,
        targetSpaceId: thing.spaceId,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  for (const space of spaces) {
    for (const thing of space.things) {
      if (thing.kind !== 'space') continue;
      const target = byId.get(thing.spaceId);
      if (target === undefined) continue;
      // The Thing's own stored id, with no fallback to the target's
      // `defaultDiagram` (ADR 0079). A Space Thing selects a Diagram from the
      // moment it exists, so a `diagram` that resolves to nothing is a dangling
      // reference to a deleted Diagram rather than an unmade choice — which is
      // what makes reporting it right where reading through the target's own
      // opening selection used to be.
      const diagramId = thing.diagram;
      const resolvedDiagram = target.lookup.diagram(diagramId);
      if (resolvedDiagram === undefined) {
        errors.push({
          kind: 'space-thing-diagram-missing',
          spaceId: space.id,
          thingId: thing.id,
          targetSpaceId: target.id,
          diagramId,
        });
        continue;
      }
      if (target.lookup.graph(thing.graph) === undefined) {
        errors.push({
          kind: 'space-thing-graph-missing',
          spaceId: space.id,
          thingId: thing.id,
          targetSpaceId: target.id,
          graphId: thing.graph,
        });
        continue;
      }
      const subjectGraphs = resolvedDiagram.diagram.graphs;
      if (!subjectGraphs.some((graph) => graph.id === thing.graph)) {
        errors.push({
          kind: 'space-thing-graph-outside-diagram',
          spaceId: space.id,
          thingId: thing.id,
          targetSpaceId: target.id,
          diagramId,
          graphId: thing.graph,
        });
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const visitState = new Map<UUID, 'visiting' | 'visited'>();
  const visit = (space: Space): void => {
    visitState.set(space.id, 'visiting');
    for (const thing of space.things) {
      if (thing.kind !== 'space') continue;
      const target = byId.get(thing.spaceId);
      // Missing targets were returned above, so this branch only preserves the
      // type-level boundary between Map lookup and the validated topology.
      if (target === undefined) continue;
      const state = visitState.get(target.id);
      if (state === 'visiting') {
        errors.push({
          kind: 'space-thing-reference-cycle',
          spaceId: space.id,
          thingId: thing.id,
          targetSpaceId: target.id,
        });
      } else if (state === undefined) {
        visit(target);
      }
    }
    visitState.set(space.id, 'visited');
  };
  for (const space of spaces) {
    if (visitState.has(space.id)) continue;
    visit(space);
  }
  if (errors.length > 0) return { ok: false, errors };

  const referencedSpaceIds = new Set<UUID>();
  for (const space of spaces) {
    for (const thing of space.things) {
      if (thing.kind === 'space') referencedSpaceIds.add(thing.spaceId);
    }
  }
  for (const space of spaces) {
    if (space.id !== metaSpaceId && !referencedSpaceIds.has(space.id)) {
      errors.push({ kind: 'ordinary-space-unreferenced', spaceId: space.id });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    aggregate: new LoadedSpaceAggregate(metaSpaceId, spaces, {
      space: (id) => byId.get(id),
    }),
  };
}
