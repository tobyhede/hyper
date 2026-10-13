import { spaceReferences, spaceSelectionProblem, type UUID } from '@project/core';
import {
  declaredSpaceReferences,
  missingSpaceReferences,
  spaceReferenceCycles,
  unrootedSpaces,
  type SpaceReference,
} from './declared-references';
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

/** Why a Space Resource's selection does not resolve in its target, in the shape its kind's own check answers. */
type SpaceSelectionProblem = NonNullable<ReturnType<typeof spaceSelectionProblem>>;

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
  | ({ readonly kind: 'space-reference-missing' } & SpaceResourceLocation)
  | ({ readonly kind: 'space-reference-cycle' } & SpaceResourceLocation)
  | { readonly kind: 'ordinary-space-unreferenced'; readonly spaceId: UUID }
  | (SpaceSelectionProblem & SpaceResourceLocation);

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
  const declared = declaredSpaceReferences(
    spaces.map((space) => ({
      id: space.id,
      resources: space.resources.map((resource) => ({ id: resource.id, document: resource })),
    })),
  );
  const located =
    (kind: 'space-reference-missing' | 'space-reference-cycle') =>
    ({ spaceId, resourceId, targetSpaceId }: SpaceReference): SpaceAggregateError => ({
      kind,
      spaceId,
      resourceId,
      targetSpaceId,
    });
  errors.push(...missingSpaceReferences(declared).map(located('space-reference-missing')));
  if (errors.length > 0) return { ok: false, errors };

  for (const space of spaces) {
    for (const resource of space.resources) {
      for (const targetSpaceId of spaceReferences(resource)) {
        const target = byId.get(targetSpaceId);
        // Missing targets were returned above, so this only keeps the type-level
        // boundary between Map lookup and the validated topology.
        if (target === undefined) continue;
        const problem = spaceSelectionProblem(resource, {
          mapGraphIds: (mapId) => target.lookup.map(mapId)?.map.graphs.map((graph) => graph.id),
          hasGraph: (graphId) => target.lookup.graph(graphId) !== undefined,
        });
        if (problem === undefined) continue;
        errors.push({ ...problem, spaceId: space.id, resourceId: resource.id, targetSpaceId });
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  errors.push(...spaceReferenceCycles(declared).map(located('space-reference-cycle')));
  if (errors.length > 0) return { ok: false, errors };

  for (const spaceId of unrootedSpaces(declared, metaSpaceId)) {
    errors.push({ kind: 'ordinary-space-unreferenced', spaceId });
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    aggregate: new LoadedSpaceAggregate(metaSpaceId, spaces, {
      space: (id) => byId.get(id),
    }),
  };
}
