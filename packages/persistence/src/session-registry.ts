import type { SpaceSnapshot, UUID } from '@project/core';
import { decideCommit } from './commit-decision';
import {
  CoordinatedCommit,
  planReplay,
  type CoordinationSpaces,
  type SpaceResourceReplay,
  type SpaceResourceReplayItem,
} from './coordinated-commit';
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
import {
  initializeTarget,
  planContextDeletion,
  planCreate,
  planDelete,
  planLink,
  precheckContextDeletion,
  recoveryRefusal,
  refuseBeforeCreating,
  refuseBeforeLinking,
  targetSelectionOf,
  targetUnavailable,
  type CreateSpaceResourceInput,
  type DeleteReferencedGraphInput,
  type DeleteReferencedMapInput,
  type DeleteSpaceResourceInput,
  type InitializedTarget,
  type LinkSpaceResourceInput,
  type SpaceResourcePlanningView,
  type SpaceResourcePlanOutcome,
  type SpaceResourceRecovery,
  type SpaceResourceRefusal,
  type SpaceResourceRefused,
  type TargetSelection,
} from './space-resource-planning';

export type {
  CreateSpaceResourceInput,
  DeleteReferencedGraphInput,
  DeleteReferencedMapInput,
  DeleteSpaceResourceInput,
  LinkSpaceResourceInput,
  SpaceResourceRefusal,
  SpaceResourceTargetUnavailableReason,
} from './space-resource-planning';

/**
 * What `prepare` answers before the coordination's own aggregate read and
 * `plan`. `proceed` carries whatever `prepare` resolved during its waits —
 * target initialization, minted ids and the like — so `plan` receives it
 * directly. An operation with nothing to carry parameterizes this with
 * `undefined`.
 */
type SpaceResourcePreparationOutcome<P> =
  | { readonly kind: 'proceed'; readonly prepared: P }
  | { readonly kind: 'unchanged' }
  | SpaceResourceRefused;

/**
 * A coordinated operation in the `prepare`/`plan` shape: `prepare` is async and
 * holds every wait an operation needs before its decision. The coordination
 * performs its own aggregate read after `prepare` and before `plan`
 * regardless. `plan` is synchronous and pure (`space-resource-planning.ts`),
 * reads the Spaces as `prepare`'s wait left them, and answers `changes`,
 * `unchanged` or a refusal — never a Promise, so nothing can suspend between
 * the decision and the coordination installing it.
 *
 * The only shape a coordinated operation is authored in: create, link, Space
 * Resource deletion, Map/Graph deletion and a recovery's replay all reach the
 * coordination through this.
 */
interface SpaceResourceCoordinatedOperation<P, C> {
  readonly prepare: () => Promise<SpaceResourcePreparationOutcome<P>>;
  readonly plan: (view: SpaceResourcePlanningView, prepared: P) => SpaceResourcePlanOutcome<C>;
}

/** What a coordination answers its operation once the outcome is installed. */
type SpaceResourceCoordinationResult<C> =
  | { readonly kind: 'installed'; readonly completion: C }
  | { readonly kind: 'unchanged' }
  | SpaceResourceRefused;

type Coordinate = <P, C>(
  operation: SpaceResourceCoordinatedOperation<P, C>,
) => Promise<SpaceResourceCoordinationResult<C>>;

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
  readonly spaceResources: (newId: () => UUID) => SpaceResourceLifecycle;
}

/** The Edit did not land, said the two ways every operation here can say it. */
type SpaceResourceLifecycleUnsettled =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: SpaceResourceRefusal };

/**
 * What an operation that authors a Space Resource answers: the Resource it made.
 *
 * Split from {@link SpaceResourceDeletionResult} rather than carrying an
 * optional id on one shared arm: both `create` and `link` mint the Resource's
 * id locally, so the value exists the moment the result is built, and
 * `delete` creates no Resource to name.
 */
export type SpaceResourceCreationResult =
  { readonly kind: 'completed'; readonly resourceId: UUID } | SpaceResourceLifecycleUnsettled;

/** What deletion answers: that it landed, and nothing a caller could continue at. */
export type SpaceResourceDeletionResult =
  { readonly kind: 'completed' } | SpaceResourceLifecycleUnsettled;

/** What context deletion answers so navigation can follow the coordinated choice. */
export type SpaceResourceContextDeletionResult =
  | { readonly kind: 'completed'; readonly mapId: UUID; readonly graphId: UUID }
  | SpaceResourceLifecycleUnsettled;

export interface SpaceResourceLifecycle {
  readonly create: (input: CreateSpaceResourceInput) => Promise<SpaceResourceCreationResult>;
  readonly link: (input: LinkSpaceResourceInput) => Promise<SpaceResourceCreationResult>;
  readonly delete: (input: DeleteSpaceResourceInput) => Promise<SpaceResourceDeletionResult>;
  readonly deleteMap: (
    input: DeleteReferencedMapInput,
  ) => Promise<SpaceResourceContextDeletionResult>;
  readonly deleteGraph: (
    input: DeleteReferencedGraphInput,
  ) => Promise<SpaceResourceContextDeletionResult>;
}

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Every live session the registry holds, the Spaces created but not yet
 * acknowledged, and the provisional entries a creation shows while its commit
 * is in flight. While the persistence barrier is raised, every session —
 * including one opened under it — has its persistence paused.
 */
class LiveSpaces implements CoordinationSpaces {
  readonly #backend: SpaceBackend;
  readonly #options: SpaceSessionOptions;
  readonly #sessions = new Map<UUID, ManagedSpaceSession>();
  readonly #provisional = new Map<UUID, ProvisionalSpaceSession>();
  readonly #uncommittedCreates = new Set<UUID>();
  #barrier = false;

  constructor(backend: SpaceBackend, options: SpaceSessionOptions) {
    this.#backend = backend;
    this.#options = options;
  }

  open(loaded: LoadedSpace): SpaceSession {
    const id = loaded.snapshot.id;
    const existing = this.#sessions.get(id);
    if (existing !== undefined) return existing.session;
    if (this.#provisional.has(id)) throw new Error(`Space ${id} is still provisional`);
    const managed = openManagedSpaceSession(this.#backend, loaded, this.#options);
    if (this.#barrier) managed.pausePersistence();
    this.#sessions.set(id, managed);
    return managed.session;
  }

  session(spaceId: UUID): ManagedSpaceSession | undefined {
    return this.#sessions.get(spaceId);
  }

  entry(spaceId: UUID): SpaceSessionRegistryEntry | undefined {
    const managed = this.#sessions.get(spaceId);
    if (managed !== undefined) return { kind: 'session', session: managed.session };
    return this.#provisional.get(spaceId);
  }

  /** Retire an idle session holding no queued work, answering whether it was retired. */
  retire(spaceId: UUID): boolean {
    const managed = this.#sessions.get(spaceId);
    if (managed === undefined) return true;
    if (!managed.isIdle() || managed.hasQueuedWork()) return false;
    managed.setCoordinatedRecovery(undefined);
    this.#sessions.delete(spaceId);
    this.#uncommittedCreates.delete(spaceId);
    return true;
  }

  raiseBarrier(): void {
    this.#barrier = true;
    for (const managed of this.#sessions.values()) managed.pausePersistence();
  }

  lowerBarrier(): void {
    this.#barrier = false;
    for (const managed of this.#sessions.values()) managed.resumePersistence();
  }

  /** Resolve once every session has nothing in flight. */
  async waitForIdle(): Promise<void> {
    await Promise.all([...this.#sessions.values()].map((managed) => managed.waitForIdle()));
  }

  /** Each live Space whose persistence needs recovery, in session order. */
  recoveryNeeded(): ReadonlyMap<UUID, SpaceResourceRecovery> {
    const needed = new Map<UUID, SpaceResourceRecovery>();
    for (const [id, managed] of this.#sessions) {
      const { kind } = managed.session.getState().persistence;
      if (kind === 'failed') needed.set(id, 'retry');
      else if (kind === 'conflicted') needed.set(id, 'resolve-conflict');
    }
    return needed;
  }

  working(spaceId: UUID): SpaceSnapshot {
    const managed = this.#sessions.get(spaceId);
    if (managed === undefined) throw new Error(`Space ${spaceId} has no live session`);
    return managed.session.getState().working;
  }

  /** What a plan reads: the aggregate with each live session's working Space laid over it. */
  view(aggregate: LoadedAggregate): SpaceResourcePlanningView {
    const spaces = new Map(aggregate.spaces.map(({ snapshot }) => [snapshot.id, clone(snapshot)]));
    for (const [id, managed] of this.#sessions) {
      spaces.set(id, clone(managed.session.getState().working));
    }
    return {
      spaces,
      aggregate,
      live: new Set(this.#sessions.keys()),
      recovery: this.recoveryNeeded(),
    };
  }

  isUncommittedCreate(spaceId: UUID): boolean {
    return this.#uncommittedCreates.has(spaceId);
  }

  openCreated(snapshot: SpaceSnapshot): ManagedSpaceSession {
    const session = this.open({ snapshot, revision: 0n, exportedRevision: null });
    const managed = this.#sessions.get(snapshot.id);
    if (session !== managed?.session) throw new Error('Created session disappeared');
    this.#uncommittedCreates.add(snapshot.id);
    return managed;
  }

  markUncommittedCreate(spaceId: UUID): void {
    this.#uncommittedCreates.add(spaceId);
  }

  holdProvisional(snapshot: SpaceSnapshot): void {
    this.#provisional.set(snapshot.id, { kind: 'provisional', snapshot });
  }

  dropProvisional(spaceId: UUID): void {
    this.#provisional.delete(spaceId);
  }

  clearUncommittedCreate(spaceId: UUID): void {
    this.#uncommittedCreates.delete(spaceId);
  }

  evict(spaceId: UUID): void {
    this.#sessions.delete(spaceId);
    this.#uncommittedCreates.delete(spaceId);
  }
}

/**
 * The queue coordinations take turns in. A turn is claimed synchronously and
 * counted from that moment, before the turn ahead of it has finished, so a
 * session cannot be retired from under a coordination that has claimed a
 * turn but not yet raised the barrier.
 */
interface CoordinationTurn {
  /** Resolves when the turn ahead has finished. */
  readonly ready: Promise<void>;
  /** End the turn: stop counting it, run `then`, and let the next turn start. */
  readonly finish: (then: () => void) => void;
}

class CoordinationTurns {
  #tail = Promise.resolve();
  #held = 0;

  /** Whether any coordination holds or awaits a turn. */
  get held(): boolean {
    return this.#held > 0;
  }

  /** Resolves when the most recently claimed turn has finished. */
  get settled(): Promise<void> {
    return this.#tail;
  }

  claim(): CoordinationTurn {
    const ready = this.#tail;
    const done = Promise.withResolvers<undefined>();
    this.#tail = done.promise;
    this.#held += 1;
    return {
      ready,
      finish: (then) => {
        this.#held -= 1;
        then();
        done.resolve(undefined);
      },
    };
  }
}

interface Coordinator {
  readonly backend: SpaceBackend;
  readonly spaces: LiveSpaces;
  readonly turns: CoordinationTurns;
  readonly replay: SpaceResourceReplay;
}

/**
 * The aggregate read every coordinated operation needs before its decision,
 * called once per turn. It answers the aggregate alone: live sessions'
 * working Spaces are laid over it by the caller's own synchronous
 * continuation, so nothing can land between reading them and `plan` deciding.
 */
const readAggregate = async (
  backend: SpaceBackend,
): Promise<
  | { readonly kind: 'loaded'; readonly aggregate: LoadedAggregate }
  | { readonly kind: 'read-failed'; readonly cause: unknown }
> => {
  try {
    const result = await backend.loadAggregate();
    if (result.kind === 'uninitialized') throw new Error('The repository is uninitialized');
    return { kind: 'loaded', aggregate: result.aggregate };
  } catch (error) {
    return { kind: 'read-failed', cause: error };
  }
};

/**
 * The pre-commit verdict, from the same judge the repository runs (ADR 0095,
 * ADR 0097) over this turn's one aggregate read: Spaces the Edit does not
 * change are judged as stored and participants as what the commit sends. It
 * acts only on `aggregate-refused`; a `conflict` or `write` verdict still
 * reaches the backend, whose own answer carries the current state a conflict
 * names.
 */
const precheckRefusal = (
  request: readonly [SpaceChange, ...SpaceChange[]],
  aggregate: LoadedAggregate,
): SpaceResourceRefused | undefined => {
  const decided = decideCommit({ changes: request }, aggregate.metaSpaceId, aggregate.spaces);
  if (decided.kind !== 'answer') return undefined;
  if (decided.result.kind === 'aggregate-refused') {
    return {
      kind: 'refused',
      refusal: { code: 'aggregate-refused', errors: decided.result.errors },
    };
  }
  if (decided.result.kind === 'rejected') {
    // `CoordinatedCommit` builds a self-consistent request naming each Space
    // once, and a loaded aggregate always names its Meta, so none of
    // decideCommit's `rejected` reasons can fire.
    throw new Error(
      `decideCommit rejected a well-formed coordinated commit: ${decided.result.message}`,
    );
  }
  return undefined;
};

/**
 * Carry a plan out: open the Spaces it names, pre-check its request, and drive
 * its {@link CoordinatedCommit} through to the backend's answer. Runs
 * synchronously from the plan to the answer being installed, so nothing lands
 * between the decision and the participants taking it up.
 */
const commitPlan = async <C>(
  coordinator: Coordinator,
  aggregate: LoadedAggregate,
  planned: Extract<SpaceResourcePlanOutcome<C>, { kind: 'changes' }>,
  installed: (result: SpaceResourceCoordinationResult<C>) => void,
  predecessor: CoordinatedCommit | undefined,
): Promise<void> => {
  for (const space of planned.open) coordinator.spaces.open(space);
  const commit = new CoordinatedCommit(
    planned.changes,
    coordinator.spaces,
    coordinator.replay,
    predecessor,
  );
  const refusal =
    predecessor === undefined ? precheckRefusal(commit.request, aggregate) : undefined;
  if (refusal !== undefined) {
    installed(refusal);
    return;
  }
  commit.enlist();
  let result: CommitResult;
  try {
    commit.prepare();
    commit.publish();
    installed({ kind: 'installed', completion: planned.completion });
    result = await coordinator.backend.commit({ changes: commit.request });
  } catch (error) {
    commit.unwind(error);
    throw error;
  }
  commit.settle(result);
};

/**
 * One coordination turn: wait for the turn, raise the barrier and wait for
 * whatever is already in flight, then prepare, read, plan and commit.
 *
 * `predecessor` marks a recovery replaying a change set an earlier turn
 * already decided and pre-checked. Its commit takes the predecessor's
 * recovery over once it prepares; a turn that ends before that — a refused
 * read, a throw — resumes the predecessor's recovery before the turn is
 * finished, so the participants can ask for it again. It still reads the
 * aggregate — the barrier still waits, and a read failure still refuses — but
 * skips the pre-check: against
 * `MemorySpaceBackend`'s test double a queued `conflict` or failure installs
 * the acknowledged revision onto the session but not into the stored copy, so
 * the pre-check would answer a conflict of its own. The repository
 * re-validates every commit regardless (ADR 0095).
 */
const runCoordination = async <P, C>(
  coordinator: Coordinator,
  operation: SpaceResourceCoordinatedOperation<P, C>,
  installed: (result: SpaceResourceCoordinationResult<C>) => void,
  predecessor: CoordinatedCommit | undefined,
): Promise<void> => {
  const turn = coordinator.turns.claim();
  await turn.ready;
  coordinator.spaces.raiseBarrier();
  try {
    // Pausing before this wait is what bounds it (ADR 0099): a commit that
    // completes with further queued work settles to idle instead of chaining
    // into the next one (session.ts), so local work queued once the barrier
    // is up stays queued for after this turn.
    await coordinator.spaces.waitForIdle();
    const prepared = await operation.prepare();
    if (prepared.kind !== 'proceed') {
      installed(prepared);
      return;
    }
    const read = await readAggregate(coordinator.backend);
    if (read.kind === 'read-failed') {
      installed({
        kind: 'refused',
        refusal: { code: 'persistence-read-failed', cause: read.cause },
      });
      return;
    }
    const planned = operation.plan(coordinator.spaces.view(read.aggregate), prepared.prepared);
    if (planned.kind !== 'changes') {
      installed(planned);
      return;
    }
    await commitPlan(coordinator, read.aggregate, planned, installed, predecessor);
  } finally {
    try {
      predecessor?.resumeRecovery();
    } finally {
      turn.finish(() => {
        coordinator.spaces.lowerBarrier();
      });
    }
  }
};

/**
 * Run a coordinated operation and answer once its outcome is installed —
 * before the commit it sends settles. A throw before installation rejects the
 * answer.
 */
const coordinate = async <P, C>(
  coordinator: Coordinator,
  operation: SpaceResourceCoordinatedOperation<P, C>,
  predecessor?: CoordinatedCommit,
): Promise<SpaceResourceCoordinationResult<C>> => {
  const installation = Promise.withResolvers<SpaceResourceCoordinationResult<C>>();
  void runCoordination(coordinator, operation, installation.resolve, predecessor).catch(
    installation.reject,
  );
  return installation.promise;
};

/** A recovery's replay: no wait of its own, and a plan that resolves each update. */
const replayOperation = (
  items: readonly [SpaceResourceReplayItem, ...SpaceResourceReplayItem[]],
): SpaceResourceCoordinatedOperation<undefined, undefined> => ({
  prepare: () => Promise.resolve({ kind: 'proceed', prepared: undefined }),
  plan: (view) => planReplay(view, items),
});

/**
 * A creating operation's answer. Both creating plans answer `changes` or a
 * refusal, never `unchanged`, so meeting it is a programming error.
 */
const creationResult = (
  result: SpaceResourceCoordinationResult<UUID>,
): SpaceResourceCreationResult => {
  if (result.kind === 'unchanged') {
    throw new Error('A completed Space Resource Edit named no Resource');
  }
  return result.kind === 'installed'
    ? { kind: 'completed', resourceId: result.completion }
    : result;
};

/**
 * Make the target working, then read the selection it opens on.
 *
 * Run inside `link`'s `prepare`, after the containing Space's own checks: a
 * turn is already claimed, so a Space cannot be released out from under the
 * Edit, and an Edit the containing Space refuses initializes nothing and mints
 * no id.
 *
 * Initialization is its own durable single-Space commit, issued while the
 * barrier is raised. The barrier stops a *session* committing over the
 * topology Edit; this commit belongs to a Space with no live session to pause.
 * The target is never a participant of the Edit (ADR 0097): it supplies a
 * selection to read, and the coordination's aggregate read comes after
 * `prepare`, so `plan` reads the initialized target. A failure after this
 * leaves the target initialized and makes no Resource; ADR 0079 already has a
 * Space gain its Map the first time anything works with it, and a second
 * attempt finds it initialized, so retrying is clean rather than cumulative.
 *
 * Read as stored even for an open target session (ADR 0097), never from its
 * `working`, which can name a Map or Graph that never committed.
 */
const workingTargetSelection = async (
  loadWorkingSpace: (spaceId: UUID) => Promise<LoadedSpace | undefined>,
  targetSpaceId: UUID,
): Promise<TargetSelection> => {
  let stored: LoadedSpace | undefined;
  try {
    stored = await loadWorkingSpace(targetSpaceId);
  } catch {
    // Every throw out of the loader has one move for the author — the target
    // has no selection to give and the next attempt may find one — and
    // `not-initialized` says so. The opening path, where the same throws are
    // raised, owns reporting them.
    return { kind: 'unavailable', reason: 'not-initialized' };
  }
  return targetSelectionOf(stored?.snapshot);
};

/**
 * The lifecycle operations: each a `prepare` holding its early exits and waits,
 * and a pure `plan` from `space-resource-planning.ts`.
 */
const createSpaceResourceLifecycle = (
  coordinateOperation: Coordinate,
  spaces: LiveSpaces,
  loadWorkingSpace: (spaceId: UUID) => Promise<LoadedSpace | undefined>,
  newId: () => UUID,
): SpaceResourceLifecycle => {
  const working = (spaceId: UUID): SpaceSnapshot => spaces.working(spaceId);

  const create = async (input: CreateSpaceResourceInput): Promise<SpaceResourceCreationResult> => {
    type CreatePrepared = InitializedTarget & { readonly resourceId: UUID };
    const result = await coordinateOperation<CreatePrepared, UUID>({
      prepare: () => {
        const refusal = refuseBeforeCreating(spaces.recoveryNeeded(), working, input);
        if (refusal !== undefined) return Promise.resolve(refusal);
        const target = initializeTarget(input.title, newId);
        return Promise.resolve({ kind: 'proceed', prepared: { ...target, resourceId: newId() } });
      },
      plan: (view, prepared) => planCreate(view, input, prepared),
    });
    return creationResult(result);
  };

  const link = async (input: LinkSpaceResourceInput): Promise<SpaceResourceCreationResult> => {
    const result = await coordinateOperation<UUID, UUID>({
      prepare: async () => {
        const refusal = refuseBeforeLinking(spaces.recoveryNeeded(), working, input);
        if (refusal !== undefined) return refusal;
        // Last, and deliberately: an Edit the containing Space has already
        // refused must not initialize the Space it was pointed at, and must
        // not mint the identities doing so would spend.
        const target = await workingTargetSelection(loadWorkingSpace, input.targetSpaceId);
        if (target.kind === 'unavailable') {
          return targetUnavailable(input.targetSpaceId, target.reason);
        }
        return { kind: 'proceed', prepared: newId() };
      },
      plan: (view, resourceId) => planLink(view, input, resourceId),
    });
    return creationResult(result);
  };

  const deleteContext = async (
    input: DeleteReferencedMapInput | DeleteReferencedGraphInput,
  ): Promise<SpaceResourceContextDeletionResult> => {
    const result = await coordinateOperation<undefined, { mapId: UUID; graphId: UUID }>({
      prepare: () => {
        const precheck = precheckContextDeletion(spaces.recoveryNeeded(), working, input);
        return Promise.resolve(
          precheck.kind === 'proceed' ? { kind: 'proceed', prepared: undefined } : precheck,
        );
      },
      plan: (view) => planContextDeletion(view, input),
    });
    return result.kind === 'installed' ? { kind: 'completed', ...result.completion } : result;
  };

  const deleteSpaceResource = async (
    input: DeleteSpaceResourceInput,
  ): Promise<SpaceResourceDeletionResult> => {
    const result = await coordinateOperation<undefined, undefined>({
      // `plan` decides against the coordination's own aggregate read, so the
      // only early exit worth taking here is one that needs no read at all.
      prepare: () =>
        Promise.resolve(
          recoveryRefusal(spaces.recoveryNeeded(), input.containingSpaceId) ?? {
            kind: 'proceed',
            prepared: undefined,
          },
        ),
      plan: (view) => planDelete(view, input),
    });
    // Neither `prepare` nor `planDelete` answers `unchanged`, so meeting it is
    // a programming error, as it is for `creationResult`.
    if (result.kind === 'unchanged') {
      throw new Error('A Space Resource deletion answered unchanged');
    }
    return result.kind === 'refused' ? result : { kind: 'completed' };
  };

  return {
    create,
    link,
    delete: deleteSpaceResource,
    deleteMap: deleteContext,
    deleteGraph: deleteContext,
  };
};

export function createSpaceSessionRegistry(
  backend: SpaceBackend,
  options: SpaceSessionOptions = {},
): SpaceSessionRegistry {
  const spaces = new LiveSpaces(backend, options);
  const turns = new CoordinationTurns();
  const coordinator: Coordinator = {
    backend,
    spaces,
    turns,
    // A replay's answer has no caller to reach: its participants' own states
    // carry the outcome, and one that never installed has resumed the
    // predecessor's recovery, so a rejection is settled here.
    replay: (items, predecessor) => {
      void coordinate(coordinator, replayOperation(items), predecessor).catch(() => undefined);
    },
  };

  const waitUntilRetirable = async (spaceId: UUID): Promise<void> => {
    for (;;) {
      const managed = spaces.session(spaceId);
      if (managed === undefined) return;
      // A coordination holds a turn, so queued work cannot drain and the
      // participant set must not change under it. Wait the turn out: lowering
      // the barrier resumes, which is what lets the queued snapshot become an
      // in-flight commit this loop can then await.
      if (turns.held) {
        await turns.settled;
        continue;
      }
      if (managed.isIdle() && !managed.hasQueuedWork()) return;
      await managed.waitForIdle();
    }
  };

  return {
    open: (loaded) => spaces.open(loaded),
    waitUntilRetirable,
    release: (spaceId) => {
      if (spaces.session(spaceId) === undefined) return true;
      if (turns.held) return false;
      return spaces.retire(spaceId);
    },
    session: (spaceId) => spaces.session(spaceId)?.session,
    entry: (spaceId) => spaces.entry(spaceId),
    spaceResources: (newId) =>
      createSpaceResourceLifecycle(
        (operation) => coordinate(coordinator, operation),
        spaces,
        createWorkingSpaceLoader(backend, newId),
        newId,
      ),
  };
}
