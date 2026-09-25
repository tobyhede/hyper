/**
 * The decisions of the coordinated Space Resource lifecycle: what a create,
 * link, delete or Map/Graph deletion changes across Spaces, and when it is
 * refused.
 *
 * Every function here is pure. It reads the Spaces it is handed — the
 * coordination's one aggregate read, overlaid with each live session's working
 * Space — and answers a plan; it never touches a session, a backend or
 * observable state. The session registry supplies the view and carries the
 * plan out (`session-registry.ts`).
 */
import {
  SPACE_FILE_VERSION,
  type Map,
  type MapPosition,
  type ResourceDocument,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import {
  initializeSpace,
  loadSpace,
  loadSpaceSnapshot,
  SnapshotEdit,
  type Space,
  type SpaceAggregateError,
} from '@project/graph';
import type { LoadedAggregate, LoadedSpace } from './backend';

export type SpaceResourceLifecycleChange =
  | { readonly kind: 'create'; readonly snapshot: SpaceSnapshot }
  /**
   * `update`'s snapshot is the participant's whole next value, not a delta to
   * apply later. Every plan decides it against the Spaces the coordination's
   * own read produced, with nothing suspending before the coordination
   * installs the result, so there is nothing left to recompute at commit time.
   */
  | { readonly kind: 'update'; readonly spaceId: UUID; readonly snapshot: SpaceSnapshot }
  | { readonly kind: 'delete'; readonly spaceId: UUID };

export type SpaceResourceChanges = readonly [
  SpaceResourceLifecycleChange,
  ...SpaceResourceLifecycleChange[],
];

/** The Space a change names. */
export const changedSpaceId = (change: SpaceResourceLifecycleChange): UUID =>
  change.kind === 'create' ? change.snapshot.id : change.spaceId;

/** What a Space Resource selects in the Space it shows: one Map and one of its Graphs. */
export interface SpaceResourceSelection {
  readonly map: UUID;
  readonly graph: UUID;
}

/**
 * Why a target supplied no Map and Graph for a Space Resource to select.
 *
 * `not-initialized` is the transient arm — a commit that failed can succeed on
 * the next attempt — while `missing` and `unreadable` are permanent for that
 * target and only another Space answers them.
 */
export type SpaceResourceTargetUnavailableReason =
  /** The Space is not there: deleted between the listing that offered it and this Edit. */
  | 'missing'
  /** Its stored state does not load as a valid Space, so nothing can be read off it. */
  | 'unreadable'
  /** It could not be given the Map it needs — the initializing commit did not land. */
  | 'not-initialized';

/** A target's selection, or why it has none. */
export type TargetSelection =
  | { readonly kind: 'selected'; readonly selection: SpaceResourceSelection }
  | { readonly kind: 'unavailable'; readonly reason: SpaceResourceTargetUnavailableReason };

export interface CreateSpaceResourceInput {
  readonly containingSpaceId: UUID;
  readonly mapId: UUID;
  readonly title: string;
  readonly position: MapPosition;
}
/**
 * Reference an existing Space. The selection is **not** a parameter (ADR 0079):
 * the target is made working and the Map it opens on, with that Map's Active
 * Graph, is what the Resource records. Choosing differently is an Edit on the
 * Resource afterwards (ADR 0068).
 */
export interface LinkSpaceResourceInput extends CreateSpaceResourceInput {
  readonly targetSpaceId: UUID;
}
export interface DeleteSpaceResourceInput {
  readonly containingSpaceId: UUID;
  readonly resourceId: UUID;
}
export interface DeleteReferencedMapInput {
  readonly targetSpaceId: UUID;
  readonly mapId: UUID;
  readonly preferredMapId: UUID | null;
}
export interface DeleteReferencedGraphInput {
  readonly targetSpaceId: UUID;
  readonly mapId: UUID;
  readonly graphId: UUID;
  readonly preferredGraphId: UUID | null;
}

/** Why a coordinated Space Resource lifecycle operation refused (ADR 0076). */
export type SpaceResourceRefusal =
  | { readonly code: 'map-not-found'; readonly mapId: UUID }
  | { readonly code: 'space-resource-not-found'; readonly resourceId: UUID }
  /**
   * A Reference Resource in the same Space still targets the Space Resource
   * (ADR 0070), named by `SnapshotEdit.deleteFromSpace` with the same code
   * Space Authoring's own `deleted-resource` refuses with.
   */
  | { readonly code: 'resource-has-references'; readonly referenceTitles: readonly string[] }
  | {
      readonly code: 'persistence-recovery-required';
      readonly spaceId: UUID;
      readonly recovery: SpaceResourceRecovery;
    }
  | { readonly code: 'aggregate-refused'; readonly errors: readonly SpaceAggregateError[] }
  /**
   * The aggregate read this Edit validates against failed, or answered
   * without a Space the Edit needs. `cause` is what the read threw (ADR 0057);
   * it is absent when the read answered but lacked the Space.
   */
  | { readonly code: 'persistence-read-failed'; readonly cause?: unknown }
  /**
   * The target could not be made working, so it supplies no Map and Graph for
   * the Resource to select (ADR 0079). Separate from `persistence-read-failed`,
   * which is about the Spaces this Edit validates against rather than the one
   * it was pointed at.
   */
  | {
      readonly code: 'space-resource-target-unavailable';
      readonly spaceId: UUID;
      readonly reason: SpaceResourceTargetUnavailableReason;
    };

/** The refused arm on its own, as a plan or a preparation answers it. */
export type SpaceResourceRefused = {
  readonly kind: 'refused';
  readonly refusal: SpaceResourceRefusal;
};

/** How a live Space that needs recovery is recovered. */
export type SpaceResourceRecovery = 'retry' | 'resolve-conflict';

/**
 * A plan's decision, made once from the Spaces as they stand after the
 * coordination's last wait.
 *
 * `open` names the stored Spaces the plan makes participants without a live
 * session; the coordination opens them before it prepares the commit.
 * `completion` is what the operation answers once the changes are installed.
 */
export type SpaceResourcePlanOutcome<C = undefined> =
  | { readonly kind: 'unchanged' }
  | SpaceResourceRefused
  | {
      readonly kind: 'changes';
      readonly changes: SpaceResourceChanges;
      readonly open: readonly LoadedSpace[];
      readonly completion: C;
    };

/**
 * The Spaces a plan reads. `spaces` is the coordination's one aggregate read
 * with each live session's working Space laid over its stored snapshot;
 * `aggregate` is that read unaltered.
 */
export interface SpaceResourcePlanningView {
  readonly spaces: ReadonlyMap<UUID, SpaceSnapshot>;
  readonly aggregate: LoadedAggregate;
  /** The Spaces with a live session. */
  readonly live: ReadonlySet<UUID>;
  /** Each live Space whose persistence needs recovery, in session order. */
  readonly recovery: ReadonlyMap<UUID, SpaceResourceRecovery>;
}

const refused = (refusal: SpaceResourceRefusal): SpaceResourceRefused => ({
  kind: 'refused',
  refusal,
});

const unavailableTarget = (reason: SpaceResourceTargetUnavailableReason): TargetSelection => ({
  kind: 'unavailable',
  reason,
});

const storedSnapshot = (aggregate: LoadedAggregate, id: UUID): LoadedSpace | undefined =>
  aggregate.spaces.find(({ snapshot }) => snapshot.id === id);

/**
 * What a Space Resource selects in a Space it is shown: the Map that Space
 * opens on, and that Map's Active Graph (ADR 0079, ADR 0026), both read off
 * `lookup.map` rather than re-derived.
 *
 * `undefined` is the type-level boundary between a snapshot that passed intake
 * and the ids read out of it: an initialized Space records a `defaultMap`, and
 * a Map owning no Graph fails intake before it can be asked.
 */
const selectionOf = (space: Space): SpaceResourceSelection | undefined => {
  if (space.defaultMap === undefined) return undefined;
  const resolved = space.lookup.map(space.defaultMap);
  return resolved === undefined
    ? undefined
    : { map: resolved.map.id, graph: resolved.activeGraph.id };
};

/**
 * A stored target read for what it opens on: `missing` when it is absent,
 * `unreadable` when it does not load, and `not-initialized` when it loads
 * without an opening Map.
 */
export const targetSelectionOf = (snapshot: SpaceSnapshot | undefined): TargetSelection => {
  if (snapshot === undefined) return unavailableTarget('missing');
  const loaded = loadSpaceSnapshot(snapshot);
  if (!loaded.ok) return unavailableTarget('unreadable');
  const selection = selectionOf(loaded.space);
  return selection === undefined
    ? unavailableTarget('not-initialized')
    : { kind: 'selected', selection };
};

export const targetUnavailable = (
  spaceId: UUID,
  reason: SpaceResourceTargetUnavailableReason,
): SpaceResourceRefused => refused({ code: 'space-resource-target-unavailable', spaceId, reason });

/** The refusal a Space that needs recovery answers, or `undefined` when it needs none. */
export const recoveryRefusal = (
  recovery: ReadonlyMap<UUID, SpaceResourceRecovery>,
  spaceId: UUID,
): SpaceResourceRefused | undefined => {
  const needed = recovery.get(spaceId);
  return needed === undefined
    ? undefined
    : refused({ code: 'persistence-recovery-required', spaceId, recovery: needed });
};

/**
 * Checks a creation answers before any wait: the containing Space must need no
 * recovery and must still own the named Map. Run before the target is made
 * working or any id is minted (ADR 0079). `working` reads a live Space.
 */
export const refuseBeforeCreating = (
  recovery: ReadonlyMap<UUID, SpaceResourceRecovery>,
  working: (spaceId: UUID) => SpaceSnapshot,
  input: CreateSpaceResourceInput,
): SpaceResourceRefused | undefined => {
  const containing = recoveryRefusal(recovery, input.containingSpaceId);
  if (containing !== undefined) return containing;
  const source = working(input.containingSpaceId);
  return (source.document.maps ?? []).some(({ id }) => id === input.mapId)
    ? undefined
    : refused({ code: 'map-not-found', mapId: input.mapId });
};

/**
 * {@link refuseBeforeCreating}, then the target: the Space this Edit reads its
 * selection from must not need recovery either. A merely
 * `rejected`, `refused` or divergent target is not refused — ADR 0076 lets it
 * keep taking part in its own Edits, and this one only reads what it stored.
 */
export const refuseBeforeLinking = (
  recovery: ReadonlyMap<UUID, SpaceResourceRecovery>,
  working: (spaceId: UUID) => SpaceSnapshot,
  input: LinkSpaceResourceInput,
): SpaceResourceRefused | undefined =>
  refuseBeforeCreating(recovery, working, input) ?? recoveryRefusal(recovery, input.targetSpaceId);

const snapshotFromSpace = (space: Space): SpaceSnapshot => {
  const document: SpaceSnapshot['document'] = {
    version: SPACE_FILE_VERSION,
    title: space.title,
  };
  if (space.maps.length > 0) document.maps = [...space.maps];
  if (space.defaultMap !== undefined) document.defaultMap = space.defaultMap;
  return {
    id: space.id,
    document,
    resources: space.resources.map(({ id, ...resourceDocument }) => ({
      id,
      document: resourceDocument,
    })),
  };
};

/** A new target Space and the selection it opens on. */
export interface InitializedTarget {
  readonly target: SpaceSnapshot;
  readonly selection: SpaceResourceSelection;
}

/**
 * A new Space titled `title`, run through the normal intake (ADR 0010), and the
 * Map and Graph it opens on, read back through the same rule a stored target
 * answers (ADR 0079). `newId` mints the Space's identities.
 */
export const initializeTarget = (title: string, newId: () => UUID): InitializedTarget => {
  const initialized = initializeSpace({ title, newId });
  const loaded = loadSpace(initialized.file, initialized.resourceFiles);
  if (!loaded.ok) throw new Error(loaded.errors.map(({ message }) => message).join('\n'));
  const selection = selectionOf(loaded.space);
  if (selection === undefined) throw new Error('An initialized Space supplied no Map to select');
  return { target: snapshotFromSpace(loaded.space), selection };
};

/**
 * Place a new Space Resource pointing at `targetSpaceId` into
 * `input.mapId` of `source`. The only refusal `createInMap` can answer for a
 * Space Resource is `map-not-found`: it has no Reference Target to check, so
 * any other code is a defect rather than an author's state.
 */
const createSpaceResource = (
  source: SpaceSnapshot,
  input: CreateSpaceResourceInput,
  resourceId: UUID,
  targetSpaceId: UUID,
  selection: SpaceResourceSelection,
): SpaceResourceRefused | { readonly kind: 'completed'; readonly snapshot: SpaceSnapshot } => {
  const document: ResourceDocument = {
    title: input.title,
    kind: 'space',
    spaceId: targetSpaceId,
    map: selection.map,
    graph: selection.graph,
  };
  const created = SnapshotEdit.createInMap(
    source,
    input.mapId,
    resourceId,
    document,
    input.position,
    'avoidingOverlap',
  );
  if (created.kind === 'refused') {
    if (created.refusal.code !== 'map-not-found') {
      throw new Error(`Space Resource creation refused unexpectedly: ${created.refusal.code}`);
    }
    return refused({ code: 'map-not-found', mapId: input.mapId });
  }
  if (created.kind !== 'completed') {
    throw new Error(`Space Resource creation through SnapshotEdit answered '${created.kind}'`);
  }
  return { kind: 'completed', snapshot: created.snapshot };
};

const containingSpace = (view: SpaceResourcePlanningView, spaceId: UUID): SpaceSnapshot => {
  const source = view.spaces.get(spaceId);
  if (source === undefined) throw new Error(`Space ${spaceId} has no live session`);
  return source;
};

/**
 * Create: a new target Space and a Space Resource in the containing Map that
 * selects it, as one Edit.
 */
export const planCreate = (
  view: SpaceResourcePlanningView,
  input: CreateSpaceResourceInput,
  prepared: InitializedTarget & { readonly resourceId: UUID },
): SpaceResourcePlanOutcome<UUID> => {
  const source = containingSpace(view, input.containingSpaceId);
  const created = createSpaceResource(
    source,
    input,
    prepared.resourceId,
    prepared.target.id,
    prepared.selection,
  );
  if (created.kind === 'refused') return created;
  return {
    kind: 'changes',
    changes: [
      { kind: 'update', spaceId: input.containingSpaceId, snapshot: created.snapshot },
      { kind: 'create', snapshot: prepared.target },
    ],
    open: [],
    completion: prepared.resourceId,
  };
};

/**
 * Link: a Space Resource in the containing Map selecting what the target opens
 * on, read from the coordination's aggregate — the same stored view the
 * pre-check judges — so a selection that moved since the target was made
 * working is the one this Edit records.
 */
export const planLink = (
  view: SpaceResourcePlanningView,
  input: LinkSpaceResourceInput,
  resourceId: UUID,
): SpaceResourcePlanOutcome<UUID> => {
  const source = containingSpace(view, input.containingSpaceId);
  const target = targetSelectionOf(storedSnapshot(view.aggregate, input.targetSpaceId)?.snapshot);
  if (target.kind === 'unavailable') return targetUnavailable(input.targetSpaceId, target.reason);
  const created = createSpaceResource(
    source,
    input,
    resourceId,
    input.targetSpaceId,
    target.selection,
  );
  if (created.kind === 'refused') return created;
  return {
    kind: 'changes',
    changes: [{ kind: 'update', spaceId: input.containingSpaceId, snapshot: created.snapshot }],
    open: [],
    completion: resourceId,
  };
};

/**
 * The one recovery rule for both cascading operations (ADR 0099): a
 * non-participant Space that needs recovery blocks the deletion when either
 * its stored snapshot or its working Space is affected by it. Its own eventual
 * retry or conflict resolution resubmits one of the two, and a deletion that
 * cannot see it can remove what that attempt still needs.
 */
const recoveryBlockedBy = (
  view: SpaceResourcePlanningView,
  exempt: ReadonlySet<UUID>,
  affects: (snapshot: SpaceSnapshot) => boolean,
): SpaceResourceRefused | undefined => {
  for (const id of view.recovery.keys()) {
    if (exempt.has(id)) continue;
    const stored = storedSnapshot(view.aggregate, id)?.snapshot;
    const working = view.spaces.get(id);
    if ((stored !== undefined && affects(stored)) || (working !== undefined && affects(working))) {
      return recoveryRefusal(view.recovery, id);
    }
  }
  return undefined;
};

const spaceResourceEdges = (snapshot: SpaceSnapshot): ReadonlyMap<UUID, UUID> => {
  const edges = new Map<UUID, UUID>();
  for (const candidate of snapshot.resources) {
    if (candidate.document.kind === 'space') edges.set(candidate.id, candidate.document.spaceId);
  }
  return edges;
};

/**
 * The Spaces a Space Resource deletion cascades to, in deletion order: the
 * target when nothing else references it, then each Space it alone referenced,
 * never the Meta Space.
 *
 * The containing Space is read as `edited`, its one changed working Space (ADR
 * 0097); every other Space is read as stored. A Space's uncommitted local Edit
 * is not what the repository judges this commit against, so a reference it
 * removed still counts and a reference it added does not yet.
 */
export const cascadeDeletion = (
  aggregate: LoadedAggregate,
  edited: SpaceSnapshot,
  targetSpaceId: UUID,
): readonly UUID[] => {
  const edgesById = new Map<UUID, ReadonlyMap<UUID, UUID>>(
    aggregate.spaces.map(({ snapshot }) => [snapshot.id, spaceResourceEdges(snapshot)]),
  );
  edgesById.set(edited.id, spaceResourceEdges(edited));
  const inbound = new Map<UUID, number>();
  for (const id of edgesById.keys()) inbound.set(id, 0);
  for (const edges of edgesById.values())
    for (const childSpaceId of edges.values())
      inbound.set(childSpaceId, (inbound.get(childSpaceId) ?? 0) + 1);
  const deleted: UUID[] = [];
  const pending: UUID[] =
    targetSpaceId === aggregate.metaSpaceId || (inbound.get(targetSpaceId) ?? 0) !== 0
      ? []
      : [targetSpaceId];
  for (const id of pending) {
    if (deleted.includes(id)) continue;
    const edges = edgesById.get(id);
    if (edges === undefined) continue;
    deleted.push(id);
    for (const childSpaceId of edges.values()) {
      const count = (inbound.get(childSpaceId) ?? 0) - 1;
      inbound.set(childSpaceId, count);
      if (childSpaceId !== aggregate.metaSpaceId && count === 0) pending.push(childSpaceId);
    }
  }
  return deleted;
};

/**
 * Delete: remove the Space Resource from its containing Space and delete every
 * Space the removal leaves unreferenced ({@link cascadeDeletion}).
 */
export const planDelete = (
  view: SpaceResourcePlanningView,
  input: DeleteSpaceResourceInput,
): SpaceResourcePlanOutcome => {
  const source = containingSpace(view, input.containingSpaceId);
  const resource = source.resources.find(({ id }) => id === input.resourceId);
  if (resource?.document.kind !== 'space') {
    return refused({ code: 'space-resource-not-found', resourceId: input.resourceId });
  }
  // `resource-not-found` cannot occur for an id `source.resources` was just
  // found to hold, so `resource-has-references` is the only refusal here.
  const deletion = SnapshotEdit.deleteFromSpace(source, input.resourceId);
  if (deletion.kind === 'refused') {
    if (deletion.refusal.code !== 'resource-has-references') {
      throw new Error(`Space Resource deletion refused unexpectedly: ${deletion.refusal.code}`);
    }
    return refused(deletion.refusal);
  }
  if (deletion.kind !== 'completed') {
    throw new Error(`Space Resource deletion through SnapshotEdit answered '${deletion.kind}'`);
  }
  const deleted = cascadeDeletion(view.aggregate, deletion.snapshot, resource.document.spaceId);
  for (const id of deleted) {
    const recovery = recoveryRefusal(view.recovery, id);
    if (recovery !== undefined) return recovery;
  }
  const deletedIds = new Set(deleted);
  const blocked = recoveryBlockedBy(
    view,
    new Set([input.containingSpaceId, ...deleted]),
    (snapshot) =>
      [...spaceResourceEdges(snapshot).values()].some((targetId) => deletedIds.has(targetId)),
  );
  if (blocked !== undefined) return blocked;
  return {
    kind: 'changes',
    changes: [
      { kind: 'update', spaceId: input.containingSpaceId, snapshot: deletion.snapshot },
      ...deleted.map((spaceId) => ({ kind: 'delete' as const, spaceId })),
    ],
    open: deleted.flatMap((id) => {
      const loaded = storedSnapshot(view.aggregate, id);
      return loaded !== undefined && !view.live.has(id) ? [loaded] : [];
    }),
    completion: undefined,
  };
};

type ContextDeletionCandidate =
  { readonly kind: 'not-deletable' } | { readonly kind: 'deletable'; readonly targetMap: Map };

/**
 * Whether `target` still has another Map or Graph to fall back to once
 * `input` names one for deletion.
 */
const contextDeletionCandidate = (
  target: SpaceSnapshot,
  input: DeleteReferencedMapInput | DeleteReferencedGraphInput,
): ContextDeletionCandidate => {
  const targetMap = target.document.maps?.find(({ id }) => id === input.mapId);
  const notDeletable =
    targetMap === undefined ||
    ('preferredMapId' in input
      ? (target.document.maps?.length ?? 0) <= 1
      : targetMap.graphs.length <= 1 || !targetMap.graphs.some(({ id }) => id === input.graphId));
  return notDeletable ? { kind: 'not-deletable' } : { kind: 'deletable', targetMap };
};

/**
 * Checks a Map/Graph deletion answers before any read: recovery on the target,
 * then whether the named Map or Graph is still a deletion candidate on the
 * target's working Space — already gone, or the last one, is `unchanged`.
 */
export const precheckContextDeletion = (
  recovery: ReadonlyMap<UUID, SpaceResourceRecovery>,
  working: (spaceId: UUID) => SpaceSnapshot,
  input: DeleteReferencedMapInput | DeleteReferencedGraphInput,
): { readonly kind: 'proceed' } | { readonly kind: 'unchanged' } | SpaceResourceRefused => {
  const refusal = recoveryRefusal(recovery, input.targetSpaceId);
  if (refusal !== undefined) return refusal;
  return contextDeletionCandidate(working(input.targetSpaceId), input).kind === 'not-deletable'
    ? { kind: 'unchanged' }
    : { kind: 'proceed' };
};

const replaceSpaceResourceSelection = (
  snapshot: SpaceSnapshot,
  targetSpaceId: UUID,
  matches: (document: Extract<ResourceDocument, { kind: 'space' }>) => boolean,
  selection: SpaceResourceSelection,
  resetFraming: boolean,
): SpaceSnapshot => ({
  ...snapshot,
  resources: snapshot.resources.map((resource) => {
    if (
      resource.document.kind !== 'space' ||
      resource.document.spaceId !== targetSpaceId ||
      !matches(resource.document)
    )
      return resource;
    const document = { ...resource.document, map: selection.map, graph: selection.graph };
    if (resetFraming) delete document.framing;
    return { ...resource, document };
  }),
});

/** The Map and Graph a context deletion leaves selected in the target. */
export interface ContextDeletionSelection {
  readonly mapId: UUID;
  readonly graphId: UUID;
}

/**
 * Map/Graph deletion: remove the Map or Graph from the target and move every
 * Space Resource that selected it to the successor — the preferred one when it
 * survives, else the first that does.
 *
 * The successor is chosen from what this plan reads, so one removed since the
 * precheck is simply not chosen. Every other Space that selects the deleted
 * context is read as stored (ADR 0097); its own uncommitted Edit reconciles
 * itself. Recovery is checked on every participant, and the shared recovery
 * rule run, before any is opened, so a refusal leaves no new session behind.
 */
export const planContextDeletion = (
  view: SpaceResourcePlanningView,
  input: DeleteReferencedMapInput | DeleteReferencedGraphInput,
): SpaceResourcePlanOutcome<ContextDeletionSelection> => {
  const target = view.spaces.get(input.targetSpaceId);
  if (target === undefined) return refused({ code: 'persistence-read-failed' });
  const candidate = contextDeletionCandidate(target, input);
  if (candidate.kind === 'not-deletable') return { kind: 'unchanged' };
  const { targetMap } = candidate;
  const deletingMap = 'preferredMapId' in input;
  const maps = target.document.maps ?? [];

  const replacementMap = deletingMap
    ? (maps.find(({ id }) => id === input.preferredMapId && id !== input.mapId) ??
      maps.find(({ id }) => id !== input.mapId))
    : targetMap;
  const replacementGraph = deletingMap
    ? (replacementMap?.graphs.find(({ id }) => id === replacementMap.activeGraph) ??
      replacementMap?.graphs[0])
    : (targetMap.graphs.find(({ id }) => id === input.preferredGraphId && id !== input.graphId) ??
      targetMap.graphs.find(({ id }) => id !== input.graphId));
  if (replacementMap === undefined || replacementGraph === undefined) return { kind: 'unchanged' };

  const selectsDeletedContext = (document: ResourceDocument): boolean =>
    document.kind === 'space' &&
    document.spaceId === input.targetSpaceId &&
    (deletingMap
      ? document.map === input.mapId
      : document.map === input.mapId && document.graph === input.graphId);
  const affectedBy = (snapshot: SpaceSnapshot): boolean =>
    snapshot.resources.some(({ document }) => selectsDeletedContext(document));
  const affected = view.aggregate.spaces.map(({ snapshot }) => snapshot).filter(affectedBy);
  const participantIds = new Set([input.targetSpaceId, ...affected.map(({ id }) => id)]);
  for (const id of participantIds) {
    const recovery = recoveryRefusal(view.recovery, id);
    if (recovery !== undefined) return recovery;
  }
  const blocked = recoveryBlockedBy(view, participantIds, affectedBy);
  if (blocked !== undefined) return blocked;
  const open: LoadedSpace[] = [];
  for (const id of participantIds) {
    if (view.live.has(id)) continue;
    const loaded = storedSnapshot(view.aggregate, id);
    if (loaded === undefined) return refused({ code: 'persistence-read-failed' });
    open.push(loaded);
  }

  const targetDocument = {
    ...target.document,
    maps: maps
      .filter(({ id }) => !deletingMap || id !== input.mapId)
      .map((map) =>
        !deletingMap && map.id === input.mapId
          ? {
              ...map,
              activeGraph:
                map.activeGraph === input.graphId ? replacementGraph.id : map.activeGraph,
              graphs: map.graphs.filter(({ id }) => id !== input.graphId),
            }
          : map,
      ),
  };
  if (deletingMap && target.document.defaultMap === input.mapId) {
    targetDocument.defaultMap = replacementMap.id;
  }
  const selection = { map: replacementMap.id, graph: replacementGraph.id };
  // A participant commits its working Space, so the rewrite applies to that
  // reading — `spaces` holds it for a live session and the stored snapshot
  // for one this plan opens.
  const referenceChanges = affected
    .filter((snapshot) => snapshot.id !== input.targetSpaceId)
    .map((snapshot): SpaceResourceLifecycleChange => ({
      kind: 'update',
      spaceId: snapshot.id,
      snapshot: replaceSpaceResourceSelection(
        view.spaces.get(snapshot.id) ?? snapshot,
        input.targetSpaceId,
        selectsDeletedContext,
        selection,
        deletingMap,
      ),
    }));
  return {
    kind: 'changes',
    changes: [
      {
        kind: 'update',
        spaceId: input.targetSpaceId,
        snapshot: { ...target, document: targetDocument },
      },
      ...referenceChanges,
    ],
    open,
    completion: { mapId: replacementMap.id, graphId: replacementGraph.id },
  };
};
