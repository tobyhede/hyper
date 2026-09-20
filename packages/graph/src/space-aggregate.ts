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

interface SpaceResourceLocation {
  readonly spaceId: UUID;
  readonly resourceId: UUID;
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
      readonly kind: 'duplicate-resource-id';
      readonly resourceId: UUID;
      readonly spaceIds: readonly UUID[];
    }
  | { readonly kind: 'meta-space-missing'; readonly metaSpaceId: UUID }
  | ({ readonly kind: 'space-resource-target-missing' } & SpaceResourceLocation)
  | ({ readonly kind: 'space-resource-reference-cycle' } & SpaceResourceLocation)
  | { readonly kind: 'ordinary-space-unreferenced'; readonly spaceId: UUID }
  | ({
      readonly kind: 'space-resource-map-missing';
      readonly mapId: UUID;
    } & SpaceResourceLocation)
  | ({
      readonly kind: 'space-resource-graph-missing';
      readonly graphId: UUID;
    } & SpaceResourceLocation)
  | ({
      readonly kind: 'space-resource-graph-outside-map';
      readonly mapId: UUID;
      readonly graphId: UUID;
    } & SpaceResourceLocation);

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

  const spaceIdsByResourceId = new Map<UUID, UUID[]>();
  for (const space of spaces) {
    for (const resource of space.resources) {
      const spaceIds = spaceIdsByResourceId.get(resource.id);
      if (spaceIds === undefined) spaceIdsByResourceId.set(resource.id, [space.id]);
      else spaceIds.push(space.id);
    }
  }
  for (const [resourceId, spaceIds] of spaceIdsByResourceId) {
    if (spaceIds.length > 1) errors.push({ kind: 'duplicate-resource-id', resourceId, spaceIds });
  }
  if (errors.length > 0) return { ok: false, errors };

  const byId = new Map(spaces.map((space) => [space.id, space]));
  if (!byId.has(metaSpaceId)) {
    return { ok: false, errors: [{ kind: 'meta-space-missing', metaSpaceId }] };
  }
  for (const space of spaces) {
    for (const resource of space.resources) {
      if (resource.kind !== 'space' || byId.has(resource.spaceId)) continue;
      errors.push({
        kind: 'space-resource-target-missing',
        spaceId: space.id,
        resourceId: resource.id,
        targetSpaceId: resource.spaceId,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  for (const space of spaces) {
    for (const resource of space.resources) {
      if (resource.kind !== 'space') continue;
      const target = byId.get(resource.spaceId);
      if (target === undefined) continue;
      // The Resource's own stored id, with no fallback to the target's
      // `defaultMap` (ADR 0079). A Space Resource selects a Map from the
      // moment it exists, so a `map` that resolves to nothing is a dangling
      // reference to a deleted Map rather than an unmade choice — which is
      // what makes reporting it right where reading through the target's own
      // opening selection used to be.
      const mapId = resource.map;
      const resolvedMap = target.lookup.map(mapId);
      if (resolvedMap === undefined) {
        errors.push({
          kind: 'space-resource-map-missing',
          spaceId: space.id,
          resourceId: resource.id,
          targetSpaceId: target.id,
          mapId,
        });
        continue;
      }
      if (target.lookup.graph(resource.graph) === undefined) {
        errors.push({
          kind: 'space-resource-graph-missing',
          spaceId: space.id,
          resourceId: resource.id,
          targetSpaceId: target.id,
          graphId: resource.graph,
        });
        continue;
      }
      const subjectGraphs = resolvedMap.map.graphs;
      if (!subjectGraphs.some((graph) => graph.id === resource.graph)) {
        errors.push({
          kind: 'space-resource-graph-outside-map',
          spaceId: space.id,
          resourceId: resource.id,
          targetSpaceId: target.id,
          mapId,
          graphId: resource.graph,
        });
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const visitState = new Map<UUID, 'visiting' | 'visited'>();
  const visit = (space: Space): void => {
    visitState.set(space.id, 'visiting');
    for (const resource of space.resources) {
      if (resource.kind !== 'space') continue;
      const target = byId.get(resource.spaceId);
      // Missing targets were returned above, so this branch only preserves the
      // type-level boundary between Map lookup and the validated topology.
      if (target === undefined) continue;
      const state = visitState.get(target.id);
      if (state === 'visiting') {
        errors.push({
          kind: 'space-resource-reference-cycle',
          spaceId: space.id,
          resourceId: resource.id,
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
    for (const resource of space.resources) {
      if (resource.kind === 'space') referencedSpaceIds.add(resource.spaceId);
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
