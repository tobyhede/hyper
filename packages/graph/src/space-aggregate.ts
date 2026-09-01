import { FLOW_SPACE_VIEW_ID, type UUID } from '@project/core';
import { computedViewSubject } from './computed-view';
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

interface SpaceCardLocation {
  readonly spaceId: UUID;
  readonly cardId: UUID;
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
      readonly kind: 'duplicate-card-id';
      readonly cardId: UUID;
      readonly spaceIds: readonly UUID[];
    }
  | { readonly kind: 'meta-space-missing'; readonly metaSpaceId: UUID }
  | ({ readonly kind: 'space-card-target-missing' } & SpaceCardLocation)
  | ({ readonly kind: 'space-card-reference-cycle' } & SpaceCardLocation)
  | { readonly kind: 'ordinary-space-unreferenced'; readonly spaceId: UUID }
  | ({
      readonly kind: 'space-card-space-view-missing';
      readonly spaceViewId: UUID;
    } & SpaceCardLocation)
  | ({ readonly kind: 'space-card-graph-missing'; readonly graphId: UUID } & SpaceCardLocation)
  | ({
      readonly kind: 'space-card-graph-outside-space-view';
      readonly spaceViewId: UUID;
      readonly graphId: UUID;
    } & SpaceCardLocation);

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

  const spaceIdsByCardId = new Map<UUID, UUID[]>();
  for (const space of spaces) {
    for (const card of space.cards) {
      const spaceIds = spaceIdsByCardId.get(card.id);
      if (spaceIds === undefined) spaceIdsByCardId.set(card.id, [space.id]);
      else spaceIds.push(space.id);
    }
  }
  for (const [cardId, spaceIds] of spaceIdsByCardId) {
    if (spaceIds.length > 1) errors.push({ kind: 'duplicate-card-id', cardId, spaceIds });
  }
  if (errors.length > 0) return { ok: false, errors };

  const byId = new Map(spaces.map((space) => [space.id, space]));
  if (!byId.has(metaSpaceId)) {
    return { ok: false, errors: [{ kind: 'meta-space-missing', metaSpaceId }] };
  }
  for (const space of spaces) {
    for (const card of space.cards) {
      if (card.kind !== 'space' || byId.has(card.spaceId)) continue;
      errors.push({
        kind: 'space-card-target-missing',
        spaceId: space.id,
        cardId: card.id,
        targetSpaceId: card.spaceId,
      });
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  for (const space of spaces) {
    for (const card of space.cards) {
      if (card.kind !== 'space') continue;
      const target = byId.get(card.spaceId);
      if (target === undefined) continue;
      const spaceViewId = card.spaceView ?? target.defaultRenderer ?? FLOW_SPACE_VIEW_ID;
      const computedSubject = computedViewSubject(target, spaceViewId);
      const resolvedLayout =
        computedSubject === undefined ? target.lookup.layout(spaceViewId) : undefined;
      if (computedSubject === undefined && resolvedLayout === undefined) {
        errors.push({
          kind: 'space-card-space-view-missing',
          spaceId: space.id,
          cardId: card.id,
          targetSpaceId: target.id,
          spaceViewId,
        });
        continue;
      }
      if (card.graph === undefined) continue;
      if (target.lookup.graph(card.graph) === undefined) {
        errors.push({
          kind: 'space-card-graph-missing',
          spaceId: space.id,
          cardId: card.id,
          targetSpaceId: target.id,
          graphId: card.graph,
        });
        continue;
      }
      const subjectGraphs = computedSubject?.graphs ?? resolvedLayout?.layout.graphs ?? [];
      if (!subjectGraphs.some((graph) => graph.id === card.graph)) {
        errors.push({
          kind: 'space-card-graph-outside-space-view',
          spaceId: space.id,
          cardId: card.id,
          targetSpaceId: target.id,
          spaceViewId,
          graphId: card.graph,
        });
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  const visitState = new Map<UUID, 'visiting' | 'visited'>();
  const visit = (space: Space): void => {
    visitState.set(space.id, 'visiting');
    for (const card of space.cards) {
      if (card.kind !== 'space') continue;
      const target = byId.get(card.spaceId);
      // Missing targets were returned above, so this branch only preserves the
      // type-level boundary between Map lookup and the validated topology.
      if (target === undefined) continue;
      const state = visitState.get(target.id);
      if (state === 'visiting') {
        errors.push({
          kind: 'space-card-reference-cycle',
          spaceId: space.id,
          cardId: card.id,
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
    for (const card of space.cards) {
      if (card.kind === 'space') referencedSpaceIds.add(card.spaceId);
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
