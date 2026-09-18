import {
  SPACE_FILE_VERSION,
  type Diagram,
  type ThingDocument,
  type DiagramPosition,
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
import { decideCommit } from './commit-decision';
import { createWorkingSpaceLoader } from './working-space';
import type {
  CommitResult,
  LoadedAggregate,
  LoadedSpace,
  SpaceBackend,
  SpaceChange,
} from './backend';
import {
  openManagedSpaceSession,
  type ManagedSpaceSession,
  type SpaceSession,
  type SpaceSessionOptions,
} from './session';

type SpaceThingLifecycleChange =
  | { readonly kind: 'create'; readonly snapshot: SpaceSnapshot }
  /**
   * `update`'s snapshot is the participant's whole next value, not a delta to
   * apply later. Every `plan` decides it against the Spaces its own wait
   * produced (`SpaceThingCoordinatedOperation`), with nothing suspending
   * before the coordination installs the result, so there is nothing left to
   * recompute at commit time: the value is carried directly rather than a
   * closure that would derive it again from whatever the participant's
   * working snapshot happens to be when the closure runs.
   */
  | { readonly kind: 'update'; readonly spaceId: UUID; readonly snapshot: SpaceSnapshot }
  | { readonly kind: 'delete'; readonly spaceId: UUID };

/**
 * A coordinated operation's decision, made once from the Spaces as they stand
 * after the coordination's last wait (`.scratch/snapshot-edits/spec.md`,
 * "Coordinated operations decide after their last wait").
 *
 * `changes` never admits a Promise: `plan` runs synchronously, immediately
 * after the coordination's own aggregate read and with nothing suspending
 * before its result is installed, which is what makes a plan-level refusal
 * trustworthy against the Spaces `prepare` waited to see.
 */
type SpaceThingPlanOutcome =
  | { readonly kind: 'unchanged' }
  | SpaceThingRefused
  | {
      readonly kind: 'changes';
      readonly changes: readonly [SpaceThingLifecycleChange, ...SpaceThingLifecycleChange[]];
    };

/**
 * What `prepare` answers before the coordination's own aggregate read and
 * `plan`. `proceed` carries whatever `prepare` resolved during its waits —
 * target initialization, minted ids and the like — so `plan` receives it
 * directly rather than through a closure-captured variable. An operation with
 * nothing to carry parameterizes this with `undefined`.
 */
type SpaceThingPreparationOutcome<P> =
  | { readonly kind: 'proceed'; readonly prepared: P }
  | { readonly kind: 'unchanged' }
  | SpaceThingRefused;

/**
 * A coordinated operation in the `prepare`/`plan` shape: `prepare` is async and
 * holds every wait an operation needs before its decision — target
 * initialization, id minting and the like — and answers what it resolved as
 * `prepared`. The coordination performs its own aggregate read after
 * `prepare` and before `plan` regardless, so `prepare` need not read the
 * aggregate itself merely to decide. `plan` is synchronous, reads the Spaces
 * as `prepare`'s wait left them, takes `prepared` as its third argument, runs
 * the `SnapshotEdit` operations it needs and answers `changes`, `unchanged` or
 * a refusal — never a Promise, so nothing can suspend between the decision
 * and the coordination installing it.
 *
 * The only shape a coordinated operation is authored in: create, link, Space
 * Thing deletion, Diagram/Graph deletion and a coordinated recovery retry's
 * replay (`startRecovery`, below) all reach the coordination through this.
 */
interface SpaceThingCoordinatedOperation<P = undefined> {
  readonly prepare: () => Promise<SpaceThingPreparationOutcome<P>>;
  readonly plan: (
    spaces: ReadonlyMap<UUID, SpaceSnapshot>,
    aggregate: LoadedAggregate,
    prepared: P,
  ) => SpaceThingPlanOutcome;
}

type SpaceThingCoordinationResult =
  | CommitResult
  | { readonly kind: 'persistence-read-failed' }
  /** A refusal `plan` answered, installed the same way as the other two. */
  | SpaceThingRefused;

export interface ProvisionalSpaceSession {
  readonly kind: 'provisional';
  readonly snapshot: SpaceSnapshot;
}

export type SpaceSessionRegistryEntry =
  { readonly kind: 'session'; readonly session: SpaceSession } | ProvisionalSpaceSession;

export interface SpaceSessionRegistry {
  readonly open: (loaded: LoadedSpace) => SpaceSession;
  /**
   * Resolve once this Space holds no work the registry still owes the backend:
   * no commit in flight, no coordination it participates in, and nothing queued
   * behind a paused turn. An owner waits on this before leaving or retiring a
   * Space, because each of those three states hides authored work that
   * `persistence.kind` alone reports as `settled`.
   */
  readonly waitUntilRetirable: (spaceId: UUID) => Promise<void>;
  /**
   * Retire one idle live session after its owner has completed safe closing,
   * answering whether it was retired.
   *
   * The check and the retirement are one synchronous step because they cannot
   * be two: a coordination can take its turn in the microtask between an
   * owner's {@link waitUntilRetirable} resolving and its call to this, and a
   * session that has become a coordination participant must not vanish from
   * under it. `false` says exactly that happened — wait again and retry.
   */
  readonly release: (spaceId: UUID) => boolean;
  readonly session: (spaceId: UUID) => SpaceSession | undefined;
  readonly entry: (spaceId: UUID) => SpaceSessionRegistryEntry | undefined;
  readonly spaceThings: (newId: () => UUID) => SpaceThingLifecycle;
}

/** What a Space Thing selects in the Space it shows: one Diagram and one of its Graphs. */
interface SpaceThingSelection {
  readonly diagram: UUID;
  readonly graph: UUID;
}

/**
 * Why a target supplied no Diagram and Graph for a Space Thing to select.
 *
 * Three rather than one, because the move that answers them differs even though
 * the pane offers the same two. `not-initialized` is the transient arm — a
 * commit that failed can succeed on the next attempt — while `missing` and
 * `unreadable` are permanent for that target and only another Space answers
 * them. A single code would have told an author facing a failed commit
 * something that reads like a dead end.
 */
export type SpaceThingTargetUnavailableReason =
  /** The Space is not there: deleted between the listing that offered it and this Edit. */
  | 'missing'
  /** Its stored state does not load as a valid Space, so nothing can be read off it. */
  | 'unreadable'
  /** It could not be given the Diagram it needs — the initializing commit did not land. */
  | 'not-initialized';

/** A target's selection, or why it has none. */
type TargetSelection =
  | { readonly kind: 'selected'; readonly selection: SpaceThingSelection }
  | { readonly kind: 'unavailable'; readonly reason: SpaceThingTargetUnavailableReason };

export interface CreateSpaceThingInput {
  readonly containingSpaceId: UUID;
  readonly diagramId: UUID;
  readonly title: string;
  readonly position: DiagramPosition;
}
/**
 * Reference an existing Space. The selection is **not** a parameter (ADR 0079).
 *
 * A Space Thing stores a Diagram and a Graph of its target from the moment it
 * exists, and where those come from is this module's rule rather than a
 * caller's: the target is made working — which durably initializes a stored
 * diagramless Space — and the Diagram it opens on, with that Diagram's Active
 * Graph, is what the Thing records. A caller holding a `SpaceSummary` has
 * neither id to offer, and the pane that chooses a target shows no selector,
 * so an optional override here would be a seam nothing could fill honestly.
 * Choosing differently is an Edit on the Thing afterwards (ADR 0068).
 */
export interface LinkSpaceThingInput extends CreateSpaceThingInput {
  readonly targetSpaceId: UUID;
}
export interface DeleteSpaceThingInput {
  readonly containingSpaceId: UUID;
  readonly thingId: UUID;
}
export interface DeleteReferencedDiagramInput {
  readonly targetSpaceId: UUID;
  readonly diagramId: UUID;
  readonly preferredDiagramId: UUID | null;
}
export interface DeleteReferencedGraphInput {
  readonly targetSpaceId: UUID;
  readonly diagramId: UUID;
  readonly graphId: UUID;
  readonly preferredGraphId: UUID | null;
}
/** Why a coordinated Space Thing lifecycle operation refused (ADR 0076). */
export type SpaceThingRefusal =
  | { readonly code: 'diagram-not-found'; readonly diagramId: UUID }
  | { readonly code: 'space-thing-not-found'; readonly thingId: UUID }
  /**
   * Deleting this Space Thing is refused because a Reference Thing in the same Space
   * still targets it (ADR 0070), named by `SnapshotEdit.deleteFromSpace`.
   * Mapped from the same `thing-has-references` code Space Authoring's own
   * `deleted-thing` refuses with, and presented with the same wording.
   */
  | { readonly code: 'thing-has-references'; readonly referenceTitles: readonly string[] }
  | {
      readonly code: 'persistence-recovery-required';
      readonly spaceId: UUID;
      readonly recovery: 'retry' | 'resolve-conflict';
    }
  | { readonly code: 'aggregate-refused'; readonly errors: readonly SpaceAggregateError[] }
  | { readonly code: 'persistence-read-failed' }
  /**
   * The target could not be made working, so it supplies no Diagram and
   * Graph for the Thing to select (ADR 0079).
   *
   * One code carrying {@link SpaceThingTargetUnavailableReason}, rather
   * than three codes: what the Edit did is identical in all three — it did
   * not begin — and only the advice differs, which is what a reason is
   * for. It stays separate from `persistence-read-failed`, which is about
   * the Spaces this Edit validates against rather than the one it was
   * pointed at.
   */
  | {
      readonly code: 'space-thing-target-unavailable';
      readonly spaceId: UUID;
      readonly reason: SpaceThingTargetUnavailableReason;
    };

/** The Edit did not land, said the two ways every operation here can say it. */
type SpaceThingLifecycleUnsettled =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: SpaceThingRefusal };

/**
 * What an operation that authors a Space Thing answers: the Thing it made.
 *
 * **Split from {@link SpaceThingDeletionResult} rather than carrying an optional
 * id on one shared arm.** Both `create` and `link` mint the Thing's id locally,
 * so the value exists the moment the result is built, and `delete` creates no
 * Thing to name. An optional field on one `completed` arm would put "is it
 * there?" at every call site — which is the cost the surface was already paying
 * when it inferred the id from a before/after set difference instead.
 */
export type SpaceThingCreationResult =
  { readonly kind: 'completed'; readonly thingId: UUID } | SpaceThingLifecycleUnsettled;

/** What deletion answers: that it landed, and nothing a caller could continue at. */
export type SpaceThingDeletionResult =
  { readonly kind: 'completed' } | SpaceThingLifecycleUnsettled;

/** What context deletion answers so navigation can follow the coordinated choice. */
export type SpaceThingContextDeletionResult =
  | { readonly kind: 'completed'; readonly diagramId: UUID; readonly graphId: UUID }
  | SpaceThingLifecycleUnsettled;

export interface SpaceThingLifecycle {
  readonly create: (input: CreateSpaceThingInput) => Promise<SpaceThingCreationResult>;
  readonly link: (input: LinkSpaceThingInput) => Promise<SpaceThingCreationResult>;
  readonly delete: (input: DeleteSpaceThingInput) => Promise<SpaceThingDeletionResult>;
  readonly deleteDiagram: (
    input: DeleteReferencedDiagramInput,
  ) => Promise<SpaceThingContextDeletionResult>;
  readonly deleteGraph: (
    input: DeleteReferencedGraphInput,
  ) => Promise<SpaceThingContextDeletionResult>;
}

/**
 * What a Space Thing selects in a Space it is shown: the Diagram that Space
 * opens on, and that Diagram's Active Graph (ADR 0079, ADR 0026).
 *
 * The Active Graph is not re-derived here. `lookup.diagram` already answers a
 * `ResolvedDiagram` carrying the exact owned Graph — the authored choice, or
 * the first-Graph fallback — and resolving it in a second place is how the two
 * would come to disagree. So the only question left is whether the Space has an
 * opening Diagram at all.
 *
 * `undefined` is therefore the type-level boundary between a snapshot that
 * passed intake and the ids read out of it, not a state an author can produce:
 * an initialized Space records a `defaultDiagram`, and a Diagram owning no
 * Graph fails `buildSpaceLookup` before it can be asked.
 */
const selectionOf = (space: Space): SpaceThingSelection | undefined => {
  if (space.defaultDiagram === undefined) return undefined;
  const resolved = space.lookup.diagram(space.defaultDiagram);
  return resolved === undefined
    ? undefined
    : { diagram: resolved.diagram.id, graph: resolved.activeGraph.id };
};

const unavailableTarget = (reason: SpaceThingTargetUnavailableReason): TargetSelection => ({
  kind: 'unavailable',
  reason,
});

/**
 * A Space that loaded, read for what it opens on.
 *
 * A Space with no opening Diagram reaches here only as `not-initialized`: for a
 * stored target that is the arm the working load was supposed to close and did
 * not, and for a live one it is a session opened by some path other than the
 * working load — the deletion cascade opens participants directly. Neither is
 * an author's doing, and neither leaves anything to select.
 */
const selectionOfLoaded = (space: Space): TargetSelection => {
  const selection = selectionOf(space);
  return selection === undefined
    ? unavailableTarget('not-initialized')
    : { kind: 'selected', selection };
};

const clone = <T>(value: T): T => structuredClone(value);
const completed = { kind: 'completed' } as const;
/**
 * The refused arm on its own: the shape a `prepare` or `plan` answers as a
 * value (`SpaceThingPlanOutcome`, `SpaceThingPreparationOutcome`,
 * `SpaceThingCoordinationResult`).
 */
type SpaceThingRefused = { readonly kind: 'refused'; readonly refusal: SpaceThingRefusal };

/**
 * The completion a creating operation built when it minted its Thing's id.
 *
 * **`undefined` here is a programming error rather than an outcome.** Both
 * bodies mint the id on the one path that returns a change list, and every path
 * that returns without one assigns its refusal first — which the caller has
 * already answered by the time this is reached. So there is no third thing to
 * say, and saying `unchanged` would name an outcome neither operation produces.
 */
const completedCreation = (completion: SpaceThingCreationResult | undefined) => {
  if (completion === undefined) throw new Error('A completed Space Thing Edit named no Thing');
  return completion;
};
/**
 * Every `create`, `link`, `delete` and `deleteDiagram`/`deleteGraph` call
 * answers a coordination result the same way: `undefined` when it committed,
 * so the caller's own success value applies, or the one refusal it maps to
 * otherwise.
 */
const asSpaceThingRefusal = (
  result: SpaceThingCoordinationResult,
): SpaceThingRefused | undefined => {
  if (result.kind === 'persistence-read-failed') {
    return { kind: 'refused', refusal: { code: 'persistence-read-failed' } };
  }
  if (result.kind === 'aggregate-refused') {
    return { kind: 'refused', refusal: { code: 'aggregate-refused', errors: result.errors } };
  }
  if (result.kind === 'refused') return result;
  return undefined;
};
/**
 * `create` and `link`'s shared `plan` step: place a new Space Thing document
 * pointing at `targetSpaceId` into `containingDiagramId` of `source`, mapping
 * `SnapshotEdit.createInDiagram`'s outcome into `plan`'s vocabulary.
 *
 * The only refusal `createInDiagram` can answer here is `diagram-not-found`
 * — `thing-not-found` and `thing-has-references` belong to `deleteFromSpace`.
 */
const planSpaceThingCreation = (
  source: SpaceSnapshot,
  containingDiagramId: UUID,
  thingId: UUID,
  targetSpaceId: UUID,
  title: string,
  selection: SpaceThingSelection,
  position: DiagramPosition,
): SpaceThingRefused | { readonly kind: 'completed'; readonly snapshot: SpaceSnapshot } => {
  const document: ThingDocument = {
    title,
    kind: 'space',
    spaceId: targetSpaceId,
    diagram: selection.diagram,
    graph: selection.graph,
  };
  const created = SnapshotEdit.createInDiagram(
    source,
    containingDiagramId,
    thingId,
    document,
    position,
    'avoidingOverlap',
  );
  if (created.kind === 'refused') {
    if (created.refusal.code !== 'diagram-not-found') {
      throw new Error(`Space Thing creation refused unexpectedly: ${created.refusal.code}`);
    }
    return {
      kind: 'refused',
      refusal: { code: 'diagram-not-found', diagramId: containingDiagramId },
    };
  }
  if (created.kind !== 'completed') {
    throw new Error(`Space Thing creation through SnapshotEdit answered '${created.kind}'`);
  }
  return { kind: 'completed', snapshot: created.snapshot };
};
/**
 * Whether `target` still has another Diagram or Graph to fall back to once
 * `input` names one for deletion — the one question `deleteContext`'s
 * `prepare` and `plan` both ask of the Spaces they each read.
 *
 * Carries `targetDiagram` but not the `deletingDiagram` discriminant itself:
 * a caller that goes on to read `input.preferredDiagramId` or
 * `input.graphId` needs TypeScript's own `'preferredDiagramId' in input`
 * narrowing on its own copy of that check, which reading a boolean back out
 * of this function's return value cannot carry across the call.
 */
type ContextDeletionCandidate =
  | { readonly kind: 'not-deletable' }
  | { readonly kind: 'deletable'; readonly targetDiagram: Diagram };

const contextDeletionCandidate = (
  target: SpaceSnapshot,
  input: DeleteReferencedDiagramInput | DeleteReferencedGraphInput,
): ContextDeletionCandidate => {
  const targetDiagram = target.document.diagrams?.find(({ id }) => id === input.diagramId);
  const notDeletable =
    targetDiagram === undefined ||
    ('preferredDiagramId' in input
      ? (target.document.diagrams?.length ?? 0) <= 1
      : targetDiagram.graphs.length <= 1 ||
        !targetDiagram.graphs.some(({ id }) => id === input.graphId));
  return notDeletable ? { kind: 'not-deletable' } : { kind: 'deletable', targetDiagram };
};
const snapshotFromSpace = (space: Space): SpaceSnapshot => {
  const document: SpaceSnapshot['document'] = {
    version: SPACE_FILE_VERSION,
    title: space.title,
  };
  if (space.diagrams.length > 0) document.diagrams = [...space.diagrams];
  if (space.defaultDiagram !== undefined) document.defaultDiagram = space.defaultDiagram;
  return {
    id: space.id,
    document,
    things: space.things.map(({ id, ...thingDocument }) => ({ id, document: thingDocument })),
  };
};
const replaceSpaceThingSelection = (
  snapshot: SpaceSnapshot,
  targetSpaceId: UUID,
  matches: (document: Extract<ThingDocument, { kind: 'space' }>) => boolean,
  diagram: UUID,
  graph: UUID,
  resetFraming: boolean,
): SpaceSnapshot => ({
  ...snapshot,
  things: snapshot.things.map((thing) => {
    if (
      thing.document.kind !== 'space' ||
      thing.document.spaceId !== targetSpaceId ||
      !matches(thing.document)
    )
      return thing;
    const document = { ...thing.document, diagram, graph };
    if (resetFraming) delete document.framing;
    return { ...thing, document };
  }),
});

const protocolFailure = (
  message: string,
): Extract<CommitResult, { kind: 'permanent-failure' }> => ({
  kind: 'permanent-failure',
  code: 'protocol',
  message,
});

export function createSpaceSessionRegistry(
  backend: SpaceBackend,
  options: SpaceSessionOptions = {},
): SpaceSessionRegistry {
  const sessions = new Map<UUID, ManagedSpaceSession>();
  const provisional = new Map<UUID, ProvisionalSpaceSession>();
  const uncommittedCreates = new Set<UUID>();
  let lifecycleTail = Promise.resolve();
  let persistenceBarrier = false;
  /**
   * Coordinations that hold a turn, whether or not they have started one.
   *
   * A coordination takes its `lifecycleTail` slot synchronously and raises
   * `persistenceBarrier` only after awaiting the turn ahead of it, so between
   * the two the barrier reports nothing while a coordination is already
   * committed to running. Retiring a session in that window takes a
   * participant out from under it, and it fails deriving its changes rather
   * than refusing. Counting the turn is what closes the window, because the
   * count moves in the same synchronous step that takes the slot.
   */
  let coordinationTurns = 0;

  const open = (loaded: LoadedSpace): SpaceSession => {
    const id = loaded.snapshot.id;
    const existing = sessions.get(id);
    if (existing !== undefined) return existing.session;
    if (provisional.has(id)) throw new Error(`Space ${id} is still provisional`);
    const managed = openManagedSpaceSession(backend, loaded, options);
    if (persistenceBarrier) managed.pausePersistence();
    sessions.set(id, managed);
    return managed.session;
  };

  /**
   * The aggregate read every coordinated operation needs before its
   * decision. Called once, before `plan` runs, so that call is "the
   * coordination's own aggregate read" the spec names.
   *
   * Answers the aggregate alone, not a candidate merged with live sessions:
   * an `async` function's own return is one microtask away from its awaiter,
   * and a live session's `working` state is read by the awaiter's own
   * synchronous continuation instead, so nothing can land between capturing
   * it and `plan` deciding from it.
   */
  const loadCoordinationAggregate = async (): Promise<
    | { readonly kind: 'loaded'; readonly aggregate: LoadedAggregate }
    | { readonly kind: 'read-failed'; readonly message: string }
  > => {
    try {
      const result = await backend.loadAggregate();
      if (result.kind === 'uninitialized') throw new Error('The repository is uninitialized');
      return { kind: 'loaded', aggregate: result.aggregate };
    } catch (error) {
      return {
        kind: 'read-failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const runSpaceThingCoordination = async <P>(
    operation: SpaceThingCoordinatedOperation<P>,
    installed: (result?: SpaceThingCoordinationResult) => void,
    /**
     * Whether this turn is `recovery.retry`/`keepLocal` resubmitting a change
     * set an earlier turn already decided and pre-checked, rather than a fresh
     * Space Thing lifecycle operation.
     *
     * A retry still reads the aggregate — the barrier still waits, and a read
     * failure still answers `persistence-read-failed` — it skips only
     * `decideCommit`. A retry replays an earlier turn's already-decided change
     * set — no new target selection, no new reference count, nothing the
     * pre-check exists to catch — so running it buys nothing and, against
     * `MemorySpaceBackend`'s test double, actively costs: a queued
     * `conflict`/failure result installs the acknowledged revision `session.ts`
     * recorded onto the *session*, but never writes it into the backend's own
     * stored copy, so this turn's read would return the original revision and
     * the pre-check would answer a conflict of its own. The real backend
     * already re-validates every commit, retry or not (ADR 0095), so skipping
     * this turn's redundant pre-check loses no safety.
     */
    isRetry = false,
  ): Promise<SpaceThingCoordinationResult> => {
    const previous = lifecycleTail;
    let releaseTurn = (): void => undefined;
    lifecycleTail = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    coordinationTurns += 1;
    await previous;
    persistenceBarrier = true;
    for (const managed of sessions.values()) managed.pausePersistence();
    try {
      // The barrier waits only for whatever is already in flight (ADR
      // 0076): pausing before this wait is what bounds it — a commit that
      // completes with further queued work settles to idle instead of
      // chaining into the next one (session.ts), so local work queued once
      // the barrier is up stays queued for after this turn rather than
      // being drained into it.
      await Promise.all([...sessions.values()].map((managed) => managed.waitForIdle()));

      const prepared = await operation.prepare();
      if (prepared.kind === 'unchanged') {
        installed();
        return { kind: 'committed', revisions: [], deletedSpaceIds: [] };
      }
      if (prepared.kind === 'refused') {
        installed(prepared);
        return prepared;
      }
      const loaded = await loadCoordinationAggregate();
      if (loaded.kind === 'read-failed') {
        installed({ kind: 'persistence-read-failed' });
        return protocolFailure(`The coordinated persistence read threw: ${loaded.message}`);
      }
      const aggregate = loaded.aggregate;
      const candidate = new Map(
        aggregate.spaces.map((space) => [space.snapshot.id, clone(space.snapshot)]),
      );
      for (const [id, managed] of sessions) {
        candidate.set(id, clone(managed.session.getState().working));
      }
      // Nothing suspends between this and installing `planned`'s result: the
      // rest of this function, down to `installed(...)` below, runs to
      // completion without an `await` standing between them.
      const planned = operation.plan(candidate, aggregate, prepared.prepared);
      if (planned.kind === 'unchanged') {
        installed();
        return { kind: 'committed', revisions: [], deletedSpaceIds: [] };
      }
      if (planned.kind === 'refused') {
        installed(planned);
        return planned;
      }
      const changes = planned.changes;

      const ids = changes.map((change) =>
        change.kind === 'create' ? change.snapshot.id : change.spaceId,
      );
      if (new Set(ids).size !== ids.length) {
        throw new Error('A coordinated commit may name each Space only once');
      }

      const participants = new Map<UUID, ManagedSpaceSession>();
      for (const change of changes) {
        if (change.kind === 'create') {
          const created = change.snapshot.id;
          if (sessions.has(created) && !uncommittedCreates.has(created)) {
            throw new Error(`Space ${created} already has a live session`);
          }
          const existing = sessions.get(created);
          if (existing !== undefined) participants.set(created, existing);
          continue;
        }
        const managed = sessions.get(change.spaceId);
        if (managed === undefined) throw new Error(`Space ${change.spaceId} has no live session`);
        participants.set(change.spaceId, managed);
      }

      const ensureCreateParticipants = (): void => {
        for (const change of changes) {
          if (change.kind !== 'create' || participants.has(change.snapshot.id)) continue;
          const session = open({
            snapshot: clone(change.snapshot),
            revision: 0n,
            exportedRevision: null,
          });
          const managed = sessions.get(change.snapshot.id);
          if (session !== managed?.session) throw new Error('Created session disappeared');
          participants.set(change.snapshot.id, managed);
          uncommittedCreates.add(change.snapshot.id);
        }
      };

      /**
       * The exact request this turn sends — computed once, synchronously,
       * before anything below touches a participant's session, and spent
       * twice: as the pre-check's `request` and, unchanged, as the actual
       * `backend.commit` request. An `update` carries `plan`'s decided
       * snapshot, which is also what `prepareCoordinatedCommit` installs as
       * the participant's working Space, so the two cannot disagree. Building
       * it before {@link ensureCreateParticipants} runs is safe because a
       * `create` participant with no session yet falls back to the planned
       * snapshot either way.
       */
      const backendChange = (change: SpaceThingLifecycleChange): SpaceChange => {
        if (change.kind === 'create') {
          const managed = participants.get(change.snapshot.id);
          return {
            kind: 'create',
            spaceId: change.snapshot.id,
            snapshot: clone(managed?.session.getState().working ?? change.snapshot),
          };
        }
        const { spaceId } = change;
        const managed = participants.get(spaceId);
        if (managed === undefined) throw new Error(`Space ${spaceId} lost its live session`);
        const state = managed.session.getState();
        return change.kind === 'delete'
          ? { kind: 'delete', spaceId, expectedRevision: state.acknowledgedRevision }
          : {
              kind: 'update',
              spaceId,
              snapshot: clone(change.snapshot),
              expectedRevision: state.acknowledgedRevision,
            };
      };
      const [firstChange, ...remainingChanges] = changes;
      const backendChanges: [SpaceChange, ...SpaceChange[]] = [
        backendChange(firstChange),
        ...remainingChanges.map(backendChange),
      ];

      /*
       * The pre-commit verdict is the same judge the repository runs (ADR
       * 0095, ADR 0097): `stored` is this turn's one aggregate read, sorted
       * the way every backend's own `commit` sorts it, so an
       * `invalid-space-snapshot` refusal would name the same Space either way.
       * Spaces the Edit does not change are therefore judged as stored and
       * participants as what the commit sends — never a non-participant's
       * uncommitted working Space, which the repository will not see.
       *
       * Skipped on a retry — see {@link isRetry}.
       */
      const preCheck = isRetry
        ? undefined
        : decideCommit(
            { changes: backendChanges },
            aggregate.metaSpaceId,
            [...aggregate.spaces].sort((left, right) =>
              left.snapshot.id < right.snapshot.id ? -1 : 1,
            ),
          );
      if (preCheck?.kind === 'answer' && preCheck.result.kind === 'aggregate-refused') {
        const refusal = { kind: 'aggregate-refused', errors: preCheck.result.errors } as const;
        installed(refusal);
        return refusal;
      }
      if (preCheck?.kind === 'answer' && preCheck.result.kind === 'rejected') {
        // Unreachable through this registry: the duplicate-naming check above
        // and `backendChange`'s own construction already guarantee a
        // self-consistent request, and `aggregate.metaSpaceId` is always
        // defined once `loadAggregate` answers `loaded` — decideCommit's
        // remaining `rejected` reasons (a repeated Space, a mismatched
        // snapshot, or no Meta) cannot fire from a request built this way.
        throw new Error(
          `decideCommit rejected a well-formed coordinated commit: ${preCheck.result.message}`,
        );
      }

      ensureCreateParticipants();

      const baselines = new Map(
        [...participants].flatMap(([id, managed]) => {
          if (uncommittedCreates.has(id)) return [];
          const state = managed.session.getState();
          return [
            [id, { snapshot: clone(state.working), revision: state.acknowledgedRevision }] as const,
          ];
        }),
      );
      /**
       * What a coordinated retry replays for one participant, decided once
       * when recovery starts (`startRecovery`, below). `create` and `delete`
       * already carry everything the retried commit needs; `update` names
       * only the participant, because "commit this Space's current working
       * snapshot" only becomes true once the retried coordination's own
       * aggregate read has produced it — so the retry's own `plan` resolves
       * the value below, rather than this recipe carrying a value or a
       * closure that would derive one.
       */
      type SpaceThingRetryItem =
        | { readonly kind: 'create'; readonly snapshot: SpaceSnapshot }
        | { readonly kind: 'update'; readonly spaceId: UUID }
        | { readonly kind: 'delete'; readonly spaceId: UUID };
      const toRetryItem = (change: SpaceThingLifecycleChange): SpaceThingRetryItem =>
        change.kind === 'update' ? { kind: 'update', spaceId: change.spaceId } : change;
      let conflictCurrents = new Map<UUID, LoadedSpace | undefined>();
      let recoveryStarted = false;
      const startRecovery = (recoverConflict: boolean): void => {
        if (recoveryStarted) return;
        recoveryStarted = true;
        const retryItems = changes.flatMap((change): SpaceThingRetryItem[] => {
          if (!recoverConflict) return [toRetryItem(change)];
          const id = change.kind === 'create' ? change.snapshot.id : change.spaceId;
          if (!conflictCurrents.has(id)) return [toRetryItem(change)];
          const current = conflictCurrents.get(id);
          if (change.kind === 'create' && current !== undefined) {
            return [{ kind: 'update', spaceId: id }];
          }
          if (change.kind === 'update' && current === undefined) {
            const snapshot = participants.get(id)?.session.getState().working;
            if (snapshot === undefined) return [];
            uncommittedCreates.add(id);
            return [{ kind: 'create', snapshot }];
          }
          if (change.kind === 'delete' && current === undefined) {
            participants.get(id)?.completeCoordinatedDeletion();
            sessions.delete(id);
            return [];
          }
          return [toRetryItem(change)];
        });
        const [firstItem, ...remainingItems] = retryItems;
        if (firstItem === undefined) return;
        void coordinateSpaceThing(
          {
            // No wait of its own: every retried item was already decided above,
            // synchronously, from the failed attempt's own state. Only `update`
            // has anything left to resolve, and `plan` resolves it against the
            // Spaces the *retried* coordination's own aggregate read produces.
            prepare: () => Promise.resolve({ kind: 'proceed', prepared: undefined } as const),
            plan: (spaces) => {
              const resolve = (item: SpaceThingRetryItem): SpaceThingLifecycleChange => {
                if (item.kind !== 'update') return item;
                const snapshot = spaces.get(item.spaceId);
                if (snapshot === undefined)
                  throw new Error(`Space ${item.spaceId} lost its live session`);
                return { kind: 'update', spaceId: item.spaceId, snapshot };
              };
              return {
                kind: 'changes',
                changes: [resolve(firstItem), ...remainingItems.map(resolve)],
              };
            },
          },
          true,
        );
      };
      const recovery = {
        retry: (): void => {
          startRecovery(false);
        },
        keepLocal: (): void => {
          startRecovery(true);
        },
        acceptRemote: (): void => {
          if (recoveryStarted) return;
          recoveryStarted = true;
          for (const [id, managed] of participants) {
            const current = conflictCurrents.get(id);
            const baseline = baselines.get(id);
            if (conflictCurrents.has(id) && current === undefined) {
              managed.completeCoordinatedDeletion();
              sessions.delete(id);
            } else if (current !== undefined)
              managed.restoreCoordinatedCommit(current.snapshot, current.revision);
            else if (baseline !== undefined)
              managed.restoreCoordinatedCommit(baseline.snapshot, baseline.revision);
            else {
              managed.completeCoordinatedDeletion();
              sessions.delete(id);
            }
          }
          for (const managed of participants.values()) managed.notifyCoordinatedCommit();
        },
      };

      const begun: ManagedSpaceSession[] = [];
      const dropProvisionalCreates = (): void => {
        for (const change of changes) {
          if (change.kind === 'create') provisional.delete(change.snapshot.id);
        }
      };
      /* A throw carries no `CommitResult`, and participants still need one. */
      const unwind = (message: string): void => {
        dropProvisionalCreates();
        const failure = protocolFailure(`The coordinated commit threw: ${message}`);
        for (const managed of begun) {
          managed.setCoordinatedRecovery(recovery);
          managed.failCoordinatedCommit(failure);
        }
        for (const managed of begun) managed.notifyCoordinatedCommit();
      };

      for (const change of changes) {
        if (change.kind !== 'create') continue;
        provisional.set(change.snapshot.id, {
          kind: 'provisional',
          snapshot: clone(change.snapshot),
        });
      }

      /*
       * Everything from the first coordinated preparation on runs under this,
       * because from there every participant is `coordinating` and only an
       * answer clears it. A throw is not an answer, and left alone it is
       * permanent: `submit`, `retry` and `resolveConflict` all early-return
       * while `coordinating` holds, so the Space could never save again. Two
       * throws are real. `beginCoordinatedCommit` rejects a participant that
       * started an ordinary commit inside the wait above — the awaits between
       * participants are suspension points an edit can land in. And `commit`
       * itself may reject: the shipped backends answer transport failure with a
       * value, but nothing in the seam requires that.
       */
      try {
        for (const change of changes) {
          const managed = participants.get(
            change.kind === 'create' ? change.snapshot.id : change.spaceId,
          );
          if (managed === undefined) continue;
          managed.prepareCoordinatedCommit(
            change.kind === 'update'
              ? change.snapshot
              : change.kind === 'create'
                ? managed.session.getState().working
                : undefined,
          );
          begun.push(managed);
        }
        for (const managed of begun) managed.publishCoordinatedCommit();
        installed();
      } catch (error) {
        unwind(error instanceof Error ? error.message : String(error));
        throw error;
      }

      // The pre-check acts only on `aggregate-refused`, above (and the
      // unreachable `rejected` throw, also above); a `conflict` or `write`
      // verdict still reaches the backend as normal, so it is the
      // repository's own answer — not the pre-check's guess at it — that
      // carries the current state a conflict names.
      let result: CommitResult;
      try {
        result = await backend.commit({ changes: backendChanges });
      } catch (error) {
        unwind(error instanceof Error ? error.message : String(error));
        throw error;
      }
      if (result.kind === 'committed') {
        const revisions = new Map(
          result.revisions.map(({ spaceId, revision }) => [spaceId, revision]),
        );
        const deleted = new Set(result.deletedSpaceIds);
        const expectedRevisions = changes.flatMap((change) =>
          change.kind === 'delete'
            ? []
            : [change.kind === 'create' ? change.snapshot.id : change.spaceId],
        );
        const expectedDeleted = changes.flatMap((change) =>
          change.kind === 'delete' ? [change.spaceId] : [],
        );
        const malformed =
          revisions.size !== result.revisions.length ||
          deleted.size !== result.deletedSpaceIds.length ||
          expectedRevisions.length !== result.revisions.length ||
          expectedDeleted.length !== result.deletedSpaceIds.length ||
          expectedRevisions.some((id) => !revisions.has(id)) ||
          expectedDeleted.some((id) => !deleted.has(id));
        if (malformed) {
          dropProvisionalCreates();
          const failure = protocolFailure('Commit result omitted a coordinated Space result');
          for (const managed of participants.values()) {
            managed.setCoordinatedRecovery(recovery);
            managed.failCoordinatedCommit(failure);
          }
          for (const managed of participants.values()) managed.notifyCoordinatedCommit();
          return failure;
        }

        for (const change of changes) {
          const id = change.kind === 'create' ? change.snapshot.id : change.spaceId;
          if (change.kind === 'delete') {
            const managed = participants.get(id);
            managed?.completeCoordinatedDeletion();
            sessions.delete(id);
            continue;
          }
          const revision = revisions.get(id);
          if (revision === undefined) throw new Error('Validated revision disappeared');
          if (change.kind === 'create') {
            provisional.delete(id);
            uncommittedCreates.delete(id);
            participants.get(id)?.acknowledgeCoordinatedCommit(revision);
          } else {
            uncommittedCreates.delete(id);
            participants.get(id)?.acknowledgeCoordinatedCommit(revision);
          }
        }
        for (const managed of participants.values()) managed.notifyCoordinatedCommit();
        return result;
      }

      dropProvisionalCreates();

      if (result.kind === 'conflict') {
        const conflicts = new Map(
          result.conflicts.map(({ spaceId, current }) => [spaceId, current]),
        );
        conflictCurrents = conflicts;
        for (const [id, managed] of participants) {
          managed.setCoordinatedRecovery(recovery);
          // A participant the conflict did not name reverts to its baseline,
          // which is exactly the branch `recovery.acceptRemote` takes for it.
          managed.conflictCoordinatedCommit({
            current: conflicts.get(id),
            baseline: conflicts.has(id) ? undefined : baselines.get(id)?.snapshot,
          });
        }
        for (const managed of participants.values()) managed.notifyCoordinatedCommit();
        return result;
      }

      for (const managed of participants.values()) {
        managed.setCoordinatedRecovery(recovery);
        managed.failCoordinatedCommit(result);
      }
      for (const managed of participants.values()) managed.notifyCoordinatedCommit();
      return result;
    } finally {
      persistenceBarrier = false;
      coordinationTurns -= 1;
      for (const managed of sessions.values()) managed.resumePersistence();
      releaseTurn();
    }
  };

  /**
   * Run a coordinated operation in the `prepare`/`plan` shape (see
   * {@link SpaceThingCoordinatedOperation}) — the only shape there is. Space
   * Thing create, link, deletion, Diagram/Graph deletion and a coordinated
   * recovery retry's replay (`startRecovery`) all call this.
   */
  const coordinateSpaceThing = async <P>(
    operation: SpaceThingCoordinatedOperation<P>,
    isRetry = false,
  ): Promise<SpaceThingCoordinationResult> => {
    const installation = Promise.withResolvers<SpaceThingCoordinationResult>();
    void runSpaceThingCoordination(
      operation,
      (result) =>
        installation.resolve(result ?? { kind: 'committed', revisions: [], deletedSpaceIds: [] }),
      isRetry,
    ).catch(installation.reject);
    return installation.promise;
  };

  const spaceThings = (newId: () => UUID): SpaceThingLifecycle => {
    const loadWorkingSpace = createWorkingSpaceLoader(backend, newId);
    /**
     * Make the target working, then read the selection it opens on.
     *
     * **Inside `prepare`, and after the containing Space's own checks.** Those
     * two placements are the whole of what keeps this honest: a turn is claimed
     * synchronously by the call this sits in, so a Space cannot be released out
     * from under the Edit, and an Edit the containing Space has already refused
     * initializes nothing and mints no id — which is what an empty id source in
     * `refuses %s when its containing Diagram is absent` holds it to.
     *
     * Initialization is its own durable single-Space commit, issued while the
     * coordination's barrier is raised, and that is deliberate rather than a
     * leak through it. The barrier stops a *session* committing over the
     * topology Edit; this commit belongs to a Space with no live session to
     * pause, since opening a Space is the working load that initializes it.
     * The target is never a participant of the Edit this prepares (ADR 0097):
     * it supplies a selection to read, not content to write, so its own
     * initializing commit — landing before the coordination's one aggregate
     * read — is not a second write this coordination's own commit could race.
     * That read comes after `prepare` returns, so it sees the initialized
     * target, and `plan` reads the selection from it rather than from here.
     *
     * **A failure after this point leaves the target initialized and makes no
     * Thing, and that is accepted rather than repaired.** An aggregate refusal,
     * a conflict or a commit failure all land after `prepare` has returned, so
     * the Diagram and Graph minted here outlive the Edit that asked for them.
     * What is left behind is not debris: ADR 0079 already has a Space gain its
     * Diagram the first time anything works with it, so this is the state the
     * author would have reached by merely opening that Space. It is also
     * idempotent — a second attempt finds `defaultDiagram` recorded, mints
     * nothing, commits nothing and selects the same pair — which is what makes
     * retrying the refused Edit clean rather than cumulative. Folding the
     * initialization into the coordinated Edit instead would buy atomicity at
     * the price of a second initializer beside `working-space.ts`, and ADR 0079
     * puts that boundary in one place.
     *
     * The one thing that makes that commit legal is a carve-out the adapters
     * already share: a diagramless ordinary Space is necessarily *unreferenced*
     * — intake refuses a Space Thing whose target supplies no Diagram — so
     * initialization's own commit would otherwise be refused for leaving it
     * unreferenced. `baselineUnreferenced` forgives exactly the Space that was
     * already unreferenced before the commit, which is why the only window in
     * which a diagramless Space can gain a Diagram and a first reference is
     * this one.
     *
     * Nothing holds the target still between this and the Edit, and nothing
     * needs to: the selection is validated against the whole aggregate inside
     * the coordination, so a Diagram deleted in the gap is refused as
     * `space-thing-diagram-missing` rather than stored.
     *
     * **Read as stored, even for an open target session (ADR 0097).** The
     * target is not a participant of this Edit, so its selection is read from
     * storage — never from a live session's `working`, which can name a
     * Graph or Diagram that never committed, or that a failed attempt already
     * withdrew. `recoveryRefusal` on the target, called by `link` before
     * this, is what a `failed`/`conflicted` target answers instead; a
     * `rejected`, `refused` or merely divergent one still reads its last-stored
     * selection here; either way this Edit never adopts content the
     * repository has not actually accepted.
     */
    const workingTargetSelection = async (targetSpaceId: UUID): Promise<TargetSelection> => {
      let stored: LoadedSpace | undefined;
      try {
        stored = await loadWorkingSpace(targetSpaceId);
      } catch {
        // Every throw out of the loader lands here, not only the one the arm is
        // named for. `working-space.ts` throws when the initializing commit did
        // not land, when a conflict names the Space without returning its
        // current state, when a committed initialization reports no revision,
        // and when a non-empty Diagram list loses its first value; a rejected
        // `loadSpace` reaches here too. They are one refusal because the author
        // has one move for all of them — the target has no selection to give
        // and the next attempt may find one — and `not-initialized` is what
        // says so. The distinction they would otherwise draw is between kinds
        // of repository fault, which no row in a target list answers.
        //
        // The error itself is dropped rather than reported: this registry takes
        // no reporter, and threading one in for this arm alone would put a
        // diagnostic seam on the lifecycle that the opening path — where these
        // same throws are raised and where a reader looks for them — already
        // owns.
        return unavailableTarget('not-initialized');
      }
      if (stored === undefined) return unavailableTarget('missing');
      const loaded = loadSpaceSnapshot(stored.snapshot);
      return loaded.ok ? selectionOfLoaded(loaded.space) : unavailableTarget('unreadable');
    };
    const working = (id: UUID): SpaceSnapshot => {
      const session = sessions.get(id)?.session;
      if (session === undefined) throw new Error(`Space ${id} has no live session`);
      return session.getState().working;
    };
    const recoveryRefusal = (spaceId: UUID): SpaceThingRefused | undefined => {
      const persistence = sessions.get(spaceId)?.session.getState().persistence;
      if (persistence?.kind === 'failed') {
        return {
          kind: 'refused',
          refusal: { code: 'persistence-recovery-required', spaceId, recovery: 'retry' },
        };
      }
      if (persistence?.kind === 'conflicted') {
        return {
          kind: 'refused',
          refusal: {
            code: 'persistence-recovery-required',
            spaceId,
            recovery: 'resolve-conflict',
          },
        };
      }
      return undefined;
    };
    /**
     * The one recovery rule for both cascading operations (ADR 0097): a
     * non-participant session that needs recovery blocks a Space Thing
     * delete, or a Diagram/Graph delete, when it — in either its stored
     * snapshot or its working Space — references a Space the deletion
     * would remove, or holds a Space Thing selecting the Diagram or Graph
     * being deleted. Neither reading alone is trustworthy on its own: a
     * `failed` edit that added the reference or selection has not reached
     * storage, and one that removed it has not left storage either —
     * either way, that session's own eventual retry or conflict resolution
     * resubmits whichever of the two turns out to be its true next
     * attempt, and a deletion that cannot see it can delete the Space, or
     * the Diagram or Graph, that attempt still needs. `recoveryRefusal`
     * answers `undefined` for a `rejected` or `refused` session, so it is not checked
     * here — its work is already permanently refused, and this deletion
     * strands nothing further from it.
     */
    const recoveryBlockedBy = (
      aggregate: LoadedAggregate,
      exempt: ReadonlySet<UUID>,
      affects: (snapshot: SpaceSnapshot) => boolean,
    ): SpaceThingRefused | undefined => {
      for (const [id, managed] of sessions) {
        if (exempt.has(id)) continue;
        const recovery = recoveryRefusal(id);
        if (recovery === undefined) continue;
        const stored = aggregate.spaces.find(({ snapshot }) => snapshot.id === id)?.snapshot;
        if (
          (stored !== undefined && affects(stored)) ||
          affects(managed.session.getState().working)
        )
          return recovery;
      }
      return undefined;
    };
    /**
     * `prepare` holds the containing Diagram's early-exit check — which must
     * run, and refuse, before the target is made working or any id is minted
     * (ADR 0079) — and every wait this operation needs: making the target
     * working, which durably initializes a stored diagramless Space, and
     * minting the Thing's id once that succeeds. `plan` runs
     * `SnapshotEdit.createInDiagram` against the Spaces the coordination's own
     * aggregate read just produced, so a containing Diagram deleted during
     * that read is what the decision sees rather than something re-applied
     * afterward.
     */
    const link = async (input: LinkSpaceThingInput): Promise<SpaceThingCreationResult> => {
      let completion: SpaceThingCreationResult | undefined;
      type LinkPrepared = { readonly thingId: UUID };
      const result = await coordinateSpaceThing<LinkPrepared>({
        prepare: async (): Promise<SpaceThingPreparationOutcome<LinkPrepared>> => {
          const recovery = recoveryRefusal(input.containingSpaceId);
          if (recovery !== undefined) return recovery;
          const source = working(input.containingSpaceId);
          if (!(source.document.diagrams ?? []).some(({ id }) => id === input.diagramId)) {
            return {
              kind: 'refused',
              refusal: { code: 'diagram-not-found', diagramId: input.diagramId },
            };
          }
          // The target itself, next and still before initialization: the Space
          // this Edit takes content from must not need recovery either (ADR
          // 0095) — a `failed` or `conflicted` target answers here, by name,
          // rather than by whatever its last-good stored selection happens to
          // be. A merely `rejected`, `refused` or divergent target is not refused here —
          // ADR 0076 lets it keep participating in *its own* Edits, and this
          // one only reads its stored selection rather than writing it.
          const targetRecovery = recoveryRefusal(input.targetSpaceId);
          if (targetRecovery !== undefined) return targetRecovery;
          // Last, and deliberately: an Edit the containing Space has already
          // refused must not initialize the Space it was pointed at, and must
          // not mint the two identities doing so would spend.
          const target = await workingTargetSelection(input.targetSpaceId);
          if (target.kind === 'unavailable') {
            return {
              kind: 'refused',
              refusal: {
                code: 'space-thing-target-unavailable',
                spaceId: input.targetSpaceId,
                reason: target.reason,
              },
            };
          }
          return { kind: 'proceed', prepared: { thingId: newId() } };
        },
        plan: (spaces, aggregate, data) => {
          const source = spaces.get(input.containingSpaceId);
          if (source === undefined) {
            throw new Error(`Space ${input.containingSpaceId} has no live session`);
          }
          // The selection `prepare` read, read again from the coordination's one
          // aggregate read — the same stored view the pre-check judges — so a
          // selection that moved between the two is the one this Edit records.
          const stored = aggregate.spaces.find(
            ({ snapshot }) => snapshot.id === input.targetSpaceId,
          );
          const reloaded = stored === undefined ? undefined : loadSpaceSnapshot(stored.snapshot);
          const target: TargetSelection =
            reloaded === undefined
              ? unavailableTarget('missing')
              : reloaded.ok
                ? selectionOfLoaded(reloaded.space)
                : unavailableTarget('unreadable');
          if (target.kind === 'unavailable') {
            return {
              kind: 'refused',
              refusal: {
                code: 'space-thing-target-unavailable',
                spaceId: input.targetSpaceId,
                reason: target.reason,
              },
            };
          }
          const created = planSpaceThingCreation(
            source,
            input.diagramId,
            data.thingId,
            input.targetSpaceId,
            input.title,
            target.selection,
            input.position,
          );
          if (created.kind === 'refused') return created;
          completion = { kind: 'completed', thingId: data.thingId };
          return {
            kind: 'changes',
            changes: [
              { kind: 'update', spaceId: input.containingSpaceId, snapshot: created.snapshot },
            ],
          };
        },
      });
      const refusal = asSpaceThingRefusal(result);
      if (refusal !== undefined) return refusal;
      return completedCreation(completion);
    };
    /**
     * `prepare` holds only the early exits that need no read — recovery, and
     * whether the named Diagram/Graph is even still a deletion candidate on
     * the target's own live session, which saves the read for the ordinary
     * case where it plainly is not (already gone, or the last one). `plan`
     * re-asks that same question, and then chooses the successor, the
     * affected Spaces and every reference rewrite, from the Spaces the
     * coordination's one aggregate read just produced — so a successor
     * removed during that read is not baked into a closure that outlives it:
     * `plan` simply does not choose it. Re-choosing from what `plan` sees is
     * the answer, not a new refusal: the only ways a chosen successor can
     * fail to exist by the time `plan` looks are "some other Diagram/Graph is
     * still available" (re-chosen) and "none is" (keep-last, already
     * `unchanged`) — there is no state fresh data can show `plan` that isn't
     * one of those two.
     */
    const deleteContext = async (
      input: DeleteReferencedDiagramInput | DeleteReferencedGraphInput,
    ): Promise<SpaceThingContextDeletionResult> => {
      let selection: { diagramId: UUID; graphId: UUID } | undefined;
      const result = await coordinateSpaceThing({
        prepare: (): Promise<SpaceThingPreparationOutcome<undefined>> => {
          const recovery = recoveryRefusal(input.targetSpaceId);
          if (recovery !== undefined) return Promise.resolve(recovery);
          const target = working(input.targetSpaceId);
          const candidate = contextDeletionCandidate(target, input);
          return Promise.resolve(
            candidate.kind === 'not-deletable'
              ? { kind: 'unchanged' }
              : { kind: 'proceed', prepared: undefined },
          );
        },
        plan: (spaces, aggregate) => {
          const target = spaces.get(input.targetSpaceId);
          if (target === undefined) {
            return { kind: 'refused', refusal: { code: 'persistence-read-failed' } };
          }
          const candidate = contextDeletionCandidate(target, input);
          if (candidate.kind === 'not-deletable') return { kind: 'unchanged' };
          const { targetDiagram } = candidate;
          const deletingDiagram = 'preferredDiagramId' in input;

          const replacementDiagram = deletingDiagram
            ? ((target.document.diagrams ?? []).find(
                ({ id }) => id === input.preferredDiagramId && id !== input.diagramId,
              ) ?? (target.document.diagrams ?? []).find(({ id }) => id !== input.diagramId))
            : targetDiagram;
          const replacementGraph = deletingDiagram
            ? (replacementDiagram?.graphs.find(({ id }) => id === replacementDiagram.activeGraph) ??
              replacementDiagram?.graphs[0])
            : (targetDiagram.graphs.find(
                ({ id }) => id === input.preferredGraphId && id !== input.graphId,
              ) ?? targetDiagram.graphs.find(({ id }) => id !== input.graphId));
          if (replacementDiagram === undefined || replacementGraph === undefined)
            return { kind: 'unchanged' };

          // Every *other* Space that selects this target's Diagram/Graph is
          // read as stored (ADR 0097): it is not yet a known participant, and
          // if a live session's own uncommitted Edit already moved its
          // selection away, that Edit's own future commit is what reconciles
          // it — this scan only avoids leaving a *stored* reference dangling.
          // The target itself is `spaces`' reading, its working Space when a
          // live session holds it, since its own structure is what this Edit
          // changes.
          const selectsDeletedContext = (document: ThingDocument): boolean =>
            document.kind === 'space' &&
            document.spaceId === input.targetSpaceId &&
            (deletingDiagram
              ? document.diagram === input.diagramId
              : document.diagram === input.diagramId && document.graph === input.graphId);
          const affected = aggregate.spaces
            .map(({ snapshot }) => snapshot)
            .filter((snapshot) =>
              snapshot.things.some(({ document }) => selectsDeletedContext(document)),
            );
          const participantIds = new Set([input.targetSpaceId, ...affected.map(({ id }) => id)]);
          // Every participant's own recovery is checked, and the one shared
          // rule below is run, before any of them is opened: a refusal from
          // either must leave no new session behind it in the registry.
          for (const id of participantIds) {
            const recovery = recoveryRefusal(id);
            if (recovery !== undefined) return recovery;
          }
          // The one recovery rule (ADR 0097), shared with `delete`'s cascade:
          // a non-participant session that needs recovery is not made a
          // participant here either, and blocks the deletion when either its
          // stored snapshot or its working Space still selects the Diagram
          // or Graph being deleted — its own eventual retry or conflict
          // resolution resubmits one of the two, and deleting the context
          // out from under it would strand that attempt forever, refused
          // with `space-thing-diagram-missing`/`space-thing-graph-missing`
          // naming a context that no longer exists.
          const recoveryBlock = recoveryBlockedBy(aggregate, participantIds, (snapshot) =>
            snapshot.things.some(({ document }) => selectsDeletedContext(document)),
          );
          if (recoveryBlock !== undefined) return recoveryBlock;
          for (const id of participantIds) {
            if (sessions.has(id)) continue;
            const loaded = aggregate.spaces.find(({ snapshot }) => snapshot.id === id);
            if (loaded === undefined) {
              return { kind: 'refused', refusal: { code: 'persistence-read-failed' } };
            }
            open(loaded);
          }
          const targetDocument = {
            ...target.document,
            diagrams: (target.document.diagrams ?? [])
              .filter(({ id }) => !deletingDiagram || id !== input.diagramId)
              .map((diagram) =>
                !deletingDiagram && diagram.id === input.diagramId
                  ? {
                      ...diagram,
                      activeGraph:
                        diagram.activeGraph === input.graphId
                          ? replacementGraph.id
                          : diagram.activeGraph,
                      graphs: diagram.graphs.filter(({ id }) => id !== input.graphId),
                    }
                  : diagram,
              ),
          };
          if (deletingDiagram && target.document.defaultDiagram === input.diagramId) {
            targetDocument.defaultDiagram = replacementDiagram.id;
          }
          const targetChange: SpaceThingLifecycleChange = {
            kind: 'update',
            spaceId: input.targetSpaceId,
            snapshot: { ...target, document: targetDocument },
          };
          // A participant commits its working Space, so the rewrite applies to
          // that reading — `spaces` holds it for a live session and the stored
          // snapshot for one opened just above.
          const referenceChanges = affected
            .filter((snapshot) => snapshot.id !== input.targetSpaceId)
            .map((snapshot): SpaceThingLifecycleChange => ({
              kind: 'update',
              spaceId: snapshot.id,
              snapshot: replaceSpaceThingSelection(
                spaces.get(snapshot.id) ?? snapshot,
                input.targetSpaceId,
                selectsDeletedContext,
                replacementDiagram.id,
                replacementGraph.id,
                deletingDiagram,
              ),
            }));
          selection = { diagramId: replacementDiagram.id, graphId: replacementGraph.id };
          return { kind: 'changes', changes: [targetChange, ...referenceChanges] };
        },
      });
      const refusal = asSpaceThingRefusal(result);
      if (refusal !== undefined) return refusal;
      return selection !== undefined ? { kind: 'completed', ...selection } : { kind: 'unchanged' };
    };
    return {
      /**
       * `prepare` holds the containing Diagram's early-exit check and every
       * wait this operation needs — minting the new target Space's
       * identities and running it through the normal on-disk intake (ADR
       * 0010), then minting the Thing's id. `plan` runs
       * `SnapshotEdit.createInDiagram` against the Spaces the coordination's
       * own aggregate read just produced, so a containing Diagram deleted
       * during that read is what the decision sees rather than something
       * re-applied afterward.
       */
      create: async (input) => {
        let completion: SpaceThingCreationResult | undefined;
        type CreatePrepared = {
          readonly target: SpaceSnapshot;
          readonly selection: SpaceThingSelection;
          readonly thingId: UUID;
        };
        const result = await coordinateSpaceThing<CreatePrepared>({
          prepare: (): Promise<SpaceThingPreparationOutcome<CreatePrepared>> => {
            const recovery = recoveryRefusal(input.containingSpaceId);
            if (recovery !== undefined) return Promise.resolve(recovery);
            const source = working(input.containingSpaceId);
            if (!(source.document.diagrams ?? []).some(({ id }) => id === input.diagramId)) {
              return Promise.resolve({
                kind: 'refused',
                refusal: { code: 'diagram-not-found', diagramId: input.diagramId },
              });
            }
            const initialized = initializeSpace({ title: input.title, newId });
            const loaded = loadSpace(initialized.file, initialized.thingFiles);
            if (!loaded.ok) throw new Error(loaded.errors.map(({ message }) => message).join('\n'));
            const target = snapshotFromSpace(loaded.space);
            // The Diagram and Graph the initializer just minted, read back
            // through the same rule a stored target answers rather than off
            // the file it wrote (ADR 0079). A new Space is complete, so the
            // boundary below is type-level: `initializeSpace` authors a
            // `defaultDiagram` owning one Graph, and the intake above has
            // already accepted it.
            const selection = selectionOf(loaded.space);
            if (selection === undefined)
              throw new Error('An initialized Space supplied no Diagram to select');
            return Promise.resolve({
              kind: 'proceed',
              prepared: { target, selection, thingId: newId() },
            });
          },
          plan: (spaces, _aggregate, data) => {
            const source = spaces.get(input.containingSpaceId);
            if (source === undefined) {
              throw new Error(`Space ${input.containingSpaceId} has no live session`);
            }
            const created = planSpaceThingCreation(
              source,
              input.diagramId,
              data.thingId,
              data.target.id,
              input.title,
              data.selection,
              input.position,
            );
            if (created.kind === 'refused') return created;
            completion = { kind: 'completed', thingId: data.thingId };
            return {
              kind: 'changes',
              changes: [
                { kind: 'update', spaceId: input.containingSpaceId, snapshot: created.snapshot },
                { kind: 'create', snapshot: data.target },
              ],
            };
          },
        });
        const refusal = asSpaceThingRefusal(result);
        if (refusal !== undefined) return refusal;
        return completedCreation(completion);
      },
      link,
      deleteDiagram: deleteContext,
      deleteGraph: deleteContext,
      /**
       * `prepare` holds only the one early exit that saves work without
       * needing the Spaces as they stand — a containing Space already
       * needing recovery cannot accept this Edit regardless of what the
       * cascade turns out to be. Everything that decides — is this id a
       * Space Thing, does a Reference Thing still target it, and which target Spaces
       * the deletion cascades to — runs in `plan`, against the Spaces the
       * coordination's own aggregate read just produced, so a Reference Thing or a
       * reference arriving during that read is what the decision sees
       * rather than something re-applied afterward.
       */
      delete: async (input) => {
        const result = await coordinateSpaceThing({
          // No wait of its own: the coordination's own aggregate read is what
          // `plan` decides against, so the only early exit worth taking here
          // is one that needs no read at all.
          prepare: () =>
            Promise.resolve<SpaceThingPreparationOutcome<undefined>>(
              recoveryRefusal(input.containingSpaceId) ?? { kind: 'proceed', prepared: undefined },
            ),
          plan: (spaces, aggregate) => {
            const source = spaces.get(input.containingSpaceId);
            if (source === undefined) {
              throw new Error(`Space ${input.containingSpaceId} has no live session`);
            }
            const thing = source.things.find(({ id }) => id === input.thingId);
            if (thing?.document.kind !== 'space') {
              return {
                kind: 'refused',
                refusal: { code: 'space-thing-not-found', thingId: input.thingId },
              };
            }
            // The only refusal `deleteFromSpace` can answer here is
            // `thing-has-references` — `thing-not-found` cannot occur for an id
            // `source.things` was just found to hold, so meeting it would be
            // a broken invariant.
            const deletion = SnapshotEdit.deleteFromSpace(source, input.thingId);
            if (deletion.kind === 'refused') {
              if (deletion.refusal.code !== 'thing-has-references') {
                throw new Error(
                  `Space Thing deletion refused unexpectedly: ${deletion.refusal.code}`,
                );
              }
              return { kind: 'refused', refusal: deletion.refusal };
            }
            if (deletion.kind !== 'completed') {
              throw new Error(
                `Space Thing deletion through SnapshotEdit answered '${deletion.kind}'`,
              );
            }
            /**
             * The reference edges a deletion cascade walks: the containing
             * Space read as its one edited working Space (the definite
             * participant, ADR 0097); every other Space read as **stored** —
             * the coordination's one aggregate read, never a live session's
             * working Space.
             *
             * A Space's own uncommitted local Edit is not yet what the
             * repository will judge this commit against (`decideCommit`, over
             * `stored` and only the participants' changes), so counting it here
             * would decide the cascade against a candidate this Edit does not
             * actually produce. Reading stored is what keeps the two judges
             * agreeing: a reference-removing Edit that is `failed` and
             * uncommitted still leaves the reference in storage, so a sibling
             * delete correctly finds one remaining reference and does not
             * cascade through it; a reference-*adding* Edit that has not yet
             * committed is, by the same reading, not yet a reference either, so
             * it does not save a target this Edit's own commit would otherwise
             * leave unreferenced — `decideCommit`'s own
             * `ordinary-space-unreferenced` check would refuse that outcome
             * regardless of what this cascade decided.
             */
            const spaceThingEdges = (snapshot: SpaceSnapshot): ReadonlyMap<UUID, UUID> => {
              const edges = new Map<UUID, UUID>();
              for (const candidate of snapshot.things) {
                if (candidate.document.kind === 'space')
                  edges.set(candidate.id, candidate.document.spaceId);
              }
              return edges;
            };
            const edgesById = new Map<UUID, ReadonlyMap<UUID, UUID>>(
              aggregate.spaces.map(({ snapshot }) => [snapshot.id, spaceThingEdges(snapshot)]),
            );
            edgesById.set(input.containingSpaceId, spaceThingEdges(deletion.snapshot));
            const inbound = new Map<UUID, number>();
            for (const id of edgesById.keys()) inbound.set(id, 0);
            for (const edges of edgesById.values())
              for (const targetSpaceId of edges.values())
                inbound.set(targetSpaceId, (inbound.get(targetSpaceId) ?? 0) + 1);
            const deleted: UUID[] = [];
            const pending: UUID[] =
              thing.document.spaceId === aggregate.metaSpaceId ||
              (inbound.get(thing.document.spaceId) ?? 0) !== 0
                ? []
                : [thing.document.spaceId];
            for (const id of pending) {
              if (deleted.includes(id)) continue;
              const edges = edgesById.get(id);
              if (edges === undefined) continue;
              deleted.push(id);
              for (const childSpaceId of edges.values()) {
                const count = (inbound.get(childSpaceId) ?? 0) - 1;
                inbound.set(childSpaceId, count);
                if (childSpaceId !== aggregate.metaSpaceId && count === 0)
                  pending.push(childSpaceId);
              }
            }
            for (const id of deleted) {
              const recovery = recoveryRefusal(id);
              if (recovery !== undefined) return recovery;
            }
            // The one recovery rule (ADR 0097), shared with `deleteContext`:
            // a non-participant session that needs recovery blocks the
            // deletion when either its stored snapshot or its working Space
            // still references a Space this cascade would delete — its own
            // eventual retry or conflict resolution resubmits one of the
            // two, and deleting the target out from under it would strand
            // that attempt with a dangling reference forever.
            const deletedIds = new Set(deleted);
            const recoveryBlock = recoveryBlockedBy(
              aggregate,
              new Set([input.containingSpaceId, ...deleted]),
              (snapshot) =>
                [...spaceThingEdges(snapshot).values()].some((targetId) =>
                  deletedIds.has(targetId),
                ),
            );
            if (recoveryBlock !== undefined) return recoveryBlock;
            // A live session for every cascade target, so the participants
            // step right after `plan` returns finds one instead of throwing
            // `has no live session`.
            for (const id of deleted) {
              const loaded = aggregate.spaces.find(({ snapshot }) => snapshot.id === id);
              if (loaded !== undefined && !sessions.has(id)) open(loaded);
            }
            return {
              kind: 'changes',
              changes: [
                {
                  kind: 'update',
                  spaceId: input.containingSpaceId,
                  snapshot: deletion.snapshot,
                },
                ...deleted.map((spaceId) => ({ kind: 'delete' as const, spaceId })),
              ],
            };
          },
        });
        const refusal = asSpaceThingRefusal(result);
        if (refusal !== undefined) return refusal;
        return completed;
      },
    };
  };

  const waitUntilRetirable = async (spaceId: UUID): Promise<void> => {
    for (;;) {
      const managed = sessions.get(spaceId);
      if (managed === undefined) return;
      // A coordination holds a turn, so queued work cannot drain and the
      // participant set must not change under it. Wait the turn out: its
      // `finally` lowers the barrier and resumes, which is what lets the
      // queued snapshot become an in-flight commit this loop can then await.
      if (coordinationTurns > 0) {
        await lifecycleTail;
        continue;
      }
      if (managed.isIdle() && !managed.hasQueuedWork()) return;
      await managed.waitForIdle();
    }
  };

  const registry: SpaceSessionRegistry = {
    open,
    waitUntilRetirable,
    release: (spaceId) => {
      const managed = sessions.get(spaceId);
      if (managed === undefined) return true;
      if (coordinationTurns > 0) return false;
      if (!managed.isIdle() || managed.hasQueuedWork()) return false;
      managed.setCoordinatedRecovery(undefined);
      sessions.delete(spaceId);
      uncommittedCreates.delete(spaceId);
      return true;
    },
    session: (spaceId) => sessions.get(spaceId)?.session,
    entry: (spaceId) => {
      const managed = sessions.get(spaceId);
      if (managed !== undefined) return { kind: 'session', session: managed.session };
      return provisional.get(spaceId);
    },
    spaceThings,
  };
  return registry;
}
