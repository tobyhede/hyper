import type { SpaceSnapshot, UUID } from '@project/core';
import type { CommitResult, LoadedSpace, SpaceBackend } from './backend';
import { createObservableState, type ObserverErrorReporter } from './observable-state';
import type { SpaceResourceRecovery } from './space-resource-planning';

type RetryableFailure = Extract<CommitResult, { kind: 'retryable-failure' }>;
type PermanentFailure = Extract<CommitResult, { kind: 'permanent-failure' }>;
type AggregateRefusal = Extract<CommitResult, { kind: 'aggregate-refused' }>;

/**
 * Why the save that recovers a coordinated Edit never reached the backend.
 *
 * A recovery replays its Edit as a new coordination, and that coordination can
 * refuse before it commits: another coordination's recovery holds a Space the
 * replay needs, or the aggregate read it validates against failed. Nothing was
 * sent, so the outcome the recovery answers to still stands and the working
 * Space keeps every unsaved Edit; the block says why the latest attempt did not
 * change that. `title` is the blocking Space's name when the refusal was made.
 */
export type SaveBlock =
  | {
      readonly code: 'persistence-recovery-required';
      readonly spaceId: UUID;
      readonly title: string;
      readonly recovery: SpaceResourceRecovery;
    }
  | { readonly code: 'persistence-read-failed' };

export interface SpaceSessionState {
  working: SpaceSnapshot;
  acknowledgedRevision: bigint;
  changedSinceExport: boolean;
  /**
   * `blocked`, on each state a coordinated recovery can answer to, is the
   * latest recovery attempt's refusal (see {@link SaveBlock}); the next
   * outcome installed replaces it.
   */
  persistence:
    | { kind: 'settled' }
    | { kind: 'pending' }
    | { kind: 'failed'; failure: RetryableFailure; blocked?: SaveBlock }
    | { kind: 'rejected'; failure: PermanentFailure; blocked?: SaveBlock }
    /**
     * A refused aggregate is not a permanent failure.
     *
     * The two share one recovery: neither offers Retry unless a recovery
     * attempt was blocked or the rejection was for size ({@link canRetry}),
     * and both leave `submit` free to resubmit past them, because an authored
     * correction is what a refusal or a rejection alike waits for. Their own
     * `kind` is the distinction between "the server declined the request" and
     * "the proposed aggregate is invalid", so a consumer that means one and not
     * the other says so at the type it switches on.
     */
    | { kind: 'refused'; failure: AggregateRefusal; blocked?: SaveBlock }
    | {
        kind: 'conflicted';
        blocked?: SaveBlock;
        /** The newer stored Space to reload, when the conflict named this one. */
        current: LoadedSpace | undefined;
        /**
         * The snapshot this Space held before a coordinated edit began.
         *
         * A coordinated commit puts *every* participant into `conflicted`, so a
         * Space the repository never complained about arrives here too, with no
         * remote snapshot of its own. `current: undefined` alone cannot tell
         * that apart from a Space the conflict named and reported gone, and the
         * two have opposite recoveries. Carrying the baseline says which:
         * present, accepting the stored side reverts this Space to it, because
         * the coordinated edit never committed and the baseline *is* what is
         * stored; absent alongside `current`, there is nothing stored to accept
         * and keeping local work is what restores the Space, re-committing it
         * as a create.
         *
         * The three shapes are the branches `CoordinatedRecovery.acceptRemote`
         * already takes, so the state names what the recovery would do rather
         * than leaving the surface to infer it.
         */
        baseline: SpaceSnapshot | undefined;
      };
}

type Persistence = SpaceSessionState['persistence'];

/**
 * A rejection because the submitted request was over the server's size limit.
 *
 * The limit is on the whole request: every Space a coordinated save carries
 * counts toward it together, so no single Space or Resource count is promised
 * to fit. Reducing content is what answers it, and the next attempt carries
 * whatever the working Spaces then hold.
 */
export type OversizedRejection = Extract<Persistence, { kind: 'rejected' }> & {
  readonly failure: { readonly kind: 'permanent-failure'; readonly code: 'payload-too-large' };
};

/** A persistence state `retry()` acts on (see {@link canRetry}). */
export type RetryablePersistence =
  | Extract<Persistence, { kind: 'failed' }>
  | OversizedRejection
  | (Extract<Persistence, { kind: 'rejected' } | { kind: 'refused' }> & {
      readonly blocked: SaveBlock;
    });

/**
 * Whether `retry()` acts on this state: an explicit attempt to save the latest
 * working Space again, with no further Edit.
 *
 * A retryable failure always offers it. So does a rejection for size, because
 * the author answers it by reducing content, wherever that content is, and
 * Retry sends what the working Spaces hold then; a Retry still over the limit is
 * rejected again with the Edits kept. Any other rejection or refusal offers it
 * only once a recovery attempt was blocked, because then nothing the server
 * said is standing in the way, and the blocker can be resolved elsewhere
 * without an Edit here. Otherwise a rejection or refusal waits for an authored
 * correction.
 */
export const canRetry = (persistence: Persistence): persistence is RetryablePersistence =>
  persistence.kind === 'failed' ||
  (persistence.kind === 'rejected' && persistence.failure.code === 'payload-too-large') ||
  ((persistence.kind === 'rejected' || persistence.kind === 'refused') &&
    persistence.blocked !== undefined);

export interface SpaceSession {
  readonly getState: () => SpaceSessionState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly submit: (snapshot: SpaceSnapshot) => void;
  readonly retry: () => void;
  readonly acceptRemote: () => void;
  readonly resolveConflict: (snapshot: SpaceSnapshot) => void;
}

export interface SpaceSessionOptions {
  readonly reportObserverError?: ObserverErrorReporter;
}

/** Package-private coordination surface consumed by the session registry. */
export interface ManagedSpaceSession {
  readonly session: SpaceSession;
  readonly isIdle: () => boolean;
  /**
   * Whether a submitted snapshot is parked awaiting a commit turn. Idleness
   * alone does not answer this: a submit arriving while persistence is paused
   * is queued without announcing `pending`, so a session can be idle and still
   * be holding authored work that has never reached the backend.
   */
  readonly hasQueuedWork: () => boolean;
  readonly waitForIdle: () => Promise<void>;
  readonly pausePersistence: () => void;
  readonly resumePersistence: () => void;
  readonly prepareCoordinatedCommit: (snapshot?: SpaceSnapshot) => void;
  readonly publishCoordinatedCommit: () => void;
  readonly notifyCoordinatedCommit: () => void;
  readonly acknowledgeCoordinatedCommit: (revision: bigint) => void;
  readonly completeCoordinatedDeletion: () => void;
  readonly conflictCoordinatedCommit: (conflict: CoordinatedConflict) => void;
  readonly failCoordinatedCommit: (
    result: Exclude<CommitResult, { kind: 'committed' } | { kind: 'conflict' }>,
  ) => void;
  /** Record why this session's recovery attempt never reached the backend. */
  readonly blockCoordinatedCommit: (block: SaveBlock) => void;
  readonly setCoordinatedRecovery: (recovery: CoordinatedRecovery | undefined) => void;
  /** Whether this session answers to `recovery` for its coordinated outcome. */
  readonly holdsCoordinatedRecovery: (recovery: CoordinatedRecovery) => boolean;
  readonly restoreCoordinatedCommit: (snapshot: SpaceSnapshot, revision: bigint) => void;
}

/**
 * One participant's share of a coordinated conflict: the remote snapshot the
 * repository answered with, if the conflict named this Space, and otherwise the
 * baseline it reverts to. A participant the conflict did not name still becomes
 * `conflicted` — the commit was one edit — but its recovery is the baseline.
 * Neither means there is nothing stored to accept.
 */
export interface CoordinatedConflict {
  readonly current: LoadedSpace | undefined;
  readonly baseline: SpaceSnapshot | undefined;
}

export interface CoordinatedRecovery {
  readonly retry: () => void;
  readonly acceptRemote: () => void;
  readonly keepLocal: () => void;
}

const clone = <T>(value: T): T => structuredClone(value);

const hasChangedSinceExport = (
  acknowledgedRevision: bigint,
  exportedRevision: bigint | null,
): boolean => exportedRevision === null || acknowledgedRevision !== exportedRevision;

const reportToConsole = (error: unknown): void => {
  console.error('SpaceSession observer failed', error);
};

export const openManagedSpaceSession = (
  backend: SpaceBackend,
  loaded: LoadedSpace,
  options: SpaceSessionOptions = {},
): ManagedSpaceSession => {
  let exportedRevision = loaded.exportedRevision;
  const initialState: SpaceSessionState = {
    working: clone(loaded.snapshot),
    acknowledgedRevision: loaded.revision,
    changedSinceExport: hasChangedSinceExport(loaded.revision, exportedRevision),
    persistence: { kind: 'settled' },
  };
  /**
   * Whether `startCommit` has handed the backend a commit it has not answered.
   * While it is true `persistence.kind` is `pending`: only that answer leaves
   * `pending`, and no coordinated completion reaches a session with a commit
   * in flight. A coordination waits for idle before it prepares, and a
   * recovery settles only participants that still hold it, none of which can
   * start a commit of its own. So `failed` and `conflicted` each imply that
   * nothing is in flight, which is why the guards in `retry` and
   * `resolveConflict` do not name it. Held by `space-resource-lifecycle.test.ts`'s
   * "does not let a superseded recovery settle a session over its in-flight
   * commit".
   */
  let inFlight = false;
  let coordinating = false;
  let persistencePaused = false;
  let coordinatedRecovery: CoordinatedRecovery | undefined;
  let waiting: SpaceSnapshot | undefined;
  /** The snapshot `startCommit` handed the backend. Read only while `inFlight`. */
  let committing: SpaceSnapshot | undefined;
  const reportObserverError = options.reportObserverError ?? reportToConsole;
  const observable = createObservableState(initialState, reportObserverError);
  const idleWaiters = new Set<() => void>();

  const publishIdle = (): void => {
    if (inFlight || coordinating) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters.clear();
  };

  const publishPersistence = (persistence: SpaceSessionState['persistence']): void => {
    observable.publish({ ...observable.getState(), persistence });
  };

  /**
   * Begin a commit, installing `unpublishedState` as it announces `pending`.
   *
   * `unpublishedState` is state the caller derived and deliberately did not
   * publish: the transition into `pending` installs it, rather than the caller
   * spending a publication that this one would overwrite a line later. The
   * `committed` branch threads through it the revision it has just acknowledged;
   * `resolveConflict` threads the working snapshot it has just reconciled, which
   * exists nowhere else. The default reads the installed state, for the callers
   * that derived none.
   */
  const startCommit = (
    snapshot: SpaceSnapshot,
    expectedRevision: bigint,
    unpublishedState: SpaceSessionState = observable.getState(),
    kind: 'create' | 'update' = 'update',
  ): void => {
    inFlight = true;
    committing = snapshot;
    observable.publish({ ...unpublishedState, persistence: { kind: 'pending' } });
    void backend
      .commit({
        changes: [
          kind === 'create'
            ? { kind, spaceId: snapshot.id, snapshot: clone(snapshot) }
            : {
                kind,
                spaceId: snapshot.id,
                snapshot: clone(snapshot),
                expectedRevision,
              },
        ],
      })
      .then((result) => {
        inFlight = false;
        switch (result.kind) {
          case 'committed': {
            const revision = result.revisions.find(
              ({ spaceId }) => spaceId === snapshot.id,
            )?.revision;
            if (revision === undefined || result.deletedSpaceIds.length > 0) {
              waiting = undefined;
              publishPersistence({
                kind: 'rejected',
                failure: {
                  kind: 'permanent-failure',
                  code: 'protocol',
                  fault:
                    revision === undefined
                      ? { kind: 'revision-omitted', spaceId: snapshot.id }
                      : {
                          kind: 'unexpected-deletion',
                          spaceId: snapshot.id,
                          deletedSpaceIds: result.deletedSpaceIds,
                        },
                },
              });
              publishIdle();
              return;
            }
            const nextWaiting = waiting;
            waiting = undefined;
            const committedState: SpaceSessionState = {
              ...observable.getState(),
              acknowledgedRevision: revision,
              changedSinceExport: hasChangedSinceExport(revision, exportedRevision),
            };
            if (nextWaiting === undefined || persistencePaused) {
              waiting = nextWaiting;
              observable.publish({ ...committedState, persistence: { kind: 'settled' } });
              publishIdle();
            } else {
              startCommit(nextWaiting, revision, committedState);
            }
            return;
          }
          case 'retryable-failure':
            waiting = undefined;
            publishPersistence({ kind: 'failed', failure: result });
            publishIdle();
            return;
          case 'permanent-failure':
            waiting = undefined;
            publishPersistence({ kind: 'rejected', failure: result });
            publishIdle();
            return;
          case 'aggregate-refused':
            waiting = undefined;
            publishPersistence({ kind: 'refused', failure: result });
            publishIdle();
            return;
          case 'conflict': {
            waiting = undefined;
            const conflict = result.conflicts.find(({ spaceId }) => spaceId === snapshot.id);
            if (conflict === undefined) {
              publishPersistence({
                kind: 'rejected',
                failure: {
                  kind: 'permanent-failure',
                  code: 'protocol',
                  fault: { kind: 'conflict-omitted-space', spaceId: snapshot.id },
                },
              });
              publishIdle();
              return;
            }
            const { current } = conflict;
            if (current === undefined) {
              observable.publish({
                ...observable.getState(),
                persistence: { kind: 'conflicted', current: undefined, baseline: undefined },
              });
              publishIdle();
              return;
            }
            exportedRevision = current.exportedRevision;
            observable.publish({
              ...observable.getState(),
              acknowledgedRevision: current.revision,
              changedSinceExport: hasChangedSinceExport(current.revision, exportedRevision),
              persistence: { kind: 'conflicted', current: clone(current), baseline: undefined },
            });
            publishIdle();
          }
        }
      })
      /*
       * The seam's contract is a `CommitResult` and every shipped backend
       * answers transport failure with one, but nothing enforces that, and an
       * uncaught rejection here is permanent: `inFlight` never clears, so the
       * Space stays `pending` with `retry` and `resolveConflict` both
       * early-returning and `waitForIdle()` never resolving. The registry's
       * lifecycle barrier waits on every session, so one stuck this way blocks
       * every coordinated Space Resource commit — with each session already paused.
       * Reported as retryable because a throw says nothing about the snapshot,
       * only that the attempt did not produce an answer.
       */
      .catch(() => {
        inFlight = false;
        waiting = undefined;
        publishPersistence({
          kind: 'failed',
          failure: {
            kind: 'retryable-failure',
            code: 'unavailable',
          },
        });
        publishIdle();
      });
  };

  const session: SpaceSession = {
    getState: observable.getState,
    subscribe: observable.subscribe,
    /*
     * An observer may complete the next Edit while this one is still
     * publishing — and a *reentrant* submit runs to completion before this one
     * resumes, so by the time this call decides, the newest working Space may
     * no longer be the snapshot it was handed. Every call therefore decides
     * from `state.working` rather than its argument. Deciding from the argument
     * queues the older snapshot behind the newer one and stores it last,
     * undoing a completed Edit at the next load.
     *
     * Reading the newest state is also what makes the decision safe to repeat,
     * so no call is suppressed to keep a nested one from double-committing:
     * identity against the in-flight snapshot answers that directly, at any
     * depth. A guard scoped to this call's publication cannot — `retry` and
     * `resolveConflict` publish `pending` from *inside* an optimistic
     * publication, and a submit answering that notification has a commit to
     * wait behind while the call underneath it is gated on the failure it
     * published under and will decide nothing.
     */
    submit: (snapshot) => {
      const working = snapshot === committing ? snapshot : clone(snapshot);
      const previous = observable.getState().persistence;
      observable.publish({ ...observable.getState(), working });
      const wasRejectedOrRefused = previous.kind === 'rejected' || previous.kind === 'refused';
      if (wasRejectedOrRefused && coordinatedRecovery !== undefined) {
        coordinatedRecovery.retry();
        return;
      }
      if (wasRejectedOrRefused) coordinatedRecovery = undefined;
      if (previous.kind === 'conflicted' || previous.kind === 'failed') return;
      const newest = observable.getState().working;
      if (inFlight || coordinating || persistencePaused) {
        if (newest !== committing) waiting = newest;
        return;
      }
      startCommit(newest, observable.getState().acknowledgedRevision);
    },
    retry: () => {
      const state = observable.getState();
      if (!canRetry(state.persistence)) return;
      if (coordinatedRecovery !== undefined) {
        coordinatedRecovery.retry();
        return;
      }
      // A retryable state implies nothing is in flight: see `inFlight`.
      if (coordinating || persistencePaused) return;
      startCommit(state.working, state.acknowledgedRevision);
    },
    acceptRemote: () => {
      const state = observable.getState();
      if (state.persistence.kind === 'conflicted' && coordinatedRecovery !== undefined) {
        coordinatedRecovery.acceptRemote();
        return;
      }
      if (state.persistence.kind !== 'conflicted') return;
      const { current } = state.persistence;
      if (current === undefined) return;
      exportedRevision = current.exportedRevision;
      observable.publish({
        working: clone(current.snapshot),
        acknowledgedRevision: current.revision,
        changedSinceExport: hasChangedSinceExport(current.revision, exportedRevision),
        persistence: { kind: 'settled' },
      });
    },
    /*
     * A coordinated conflict can name a Space other than this one, and this
     * session is then conflicted with no remote snapshot to reload. Its own
     * acknowledged revision is still the newest it knows, so keeping local work
     * re-commits against that. Returning here instead would leave the only two
     * exits from `conflicted` both refusing, and `PersistenceControl`'s dialog
     * has no dismissal by design — the Space would never save again.
     */
    resolveConflict: (snapshot) => {
      const state = observable.getState();
      if (state.persistence.kind === 'conflicted' && coordinatedRecovery !== undefined) {
        observable.install({ ...state, working: clone(snapshot) });
        coordinatedRecovery.keepLocal();
        return;
      }
      // `conflicted` implies nothing is in flight: see `inFlight`.
      if (state.persistence.kind !== 'conflicted' || coordinating || persistencePaused) return;
      const { current, baseline } = state.persistence;
      const revision = current?.revision ?? state.acknowledgedRevision;
      if (current !== undefined) exportedRevision = current.exportedRevision;
      const working = clone(snapshot);
      const resolvedState: SpaceSessionState = {
        working,
        acknowledgedRevision: revision,
        changedSinceExport: hasChangedSinceExport(revision, exportedRevision),
        persistence: { kind: 'conflicted', current, baseline },
      };
      startCommit(
        working,
        revision,
        resolvedState,
        current === undefined && baseline === undefined ? 'create' : 'update',
      );
    },
  };

  const failCoordinatedCommit: ManagedSpaceSession['failCoordinatedCommit'] = (result) => {
    coordinating = false;
    waiting = undefined;
    // Retryable is the one outcome that leaves the work recoverable on its own.
    // Of the other two, a permanent failure is rejected and an aggregate
    // refusal is refused — every participant lands in the same one of the two,
    // so a coordinated refusal reads exactly as an uncoordinated one does.
    const persistence: SpaceSessionState['persistence'] =
      result.kind === 'retryable-failure'
        ? { kind: 'failed', failure: result }
        : result.kind === 'aggregate-refused'
          ? { kind: 'refused', failure: result }
          : { kind: 'rejected', failure: result };
    observable.install({ ...observable.getState(), persistence });
    publishIdle();
  };

  return {
    session,
    isIdle: () => !inFlight && !coordinating,
    hasQueuedWork: () => waiting !== undefined,
    waitForIdle: () => {
      if (!inFlight && !coordinating) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.add(resolve));
    },
    pausePersistence: () => {
      persistencePaused = true;
    },
    resumePersistence: () => {
      persistencePaused = false;
      if (inFlight || coordinating || waiting === undefined) return;
      const next = waiting;
      waiting = undefined;
      startCommit(next, observable.getState().acknowledgedRevision);
    },
    prepareCoordinatedCommit: (snapshot) => {
      if (inFlight || coordinating) throw new Error('Space session is already committing');
      coordinating = true;
      /*
       * Any snapshot already queued here was set by a plain `submit` while
       * persistence was paused for this coordination's own reads — the same
       * reads the registry derives every participant's coordinated snapshot
       * from. That queued content is therefore already folded into whatever
       * this call installs (or, for a participant this coordination deletes,
       * moot regardless). Left in place, it outlives the coordinated commit:
       * `resumePersistence` would replay it over the just-acknowledged result,
       * silently reverting the coordinated portion in storage while `working`
       * kept showing the correct value. A snapshot submitted *after* this call
       * (`coordinating` is now true) queues into a fresh `waiting` exactly as
       * before, and is genuinely newer, not superseded.
       */
      waiting = undefined;
      const state = observable.getState();
      const pendingState: SpaceSessionState = {
        ...state,
        persistence: { kind: 'pending' },
      };
      if (snapshot !== undefined) {
        const working = clone(snapshot);
        committing = working;
        pendingState.working = working;
      } else {
        committing = undefined;
      }
      observable.install(pendingState);
    },
    publishCoordinatedCommit: observable.notify,
    notifyCoordinatedCommit: observable.notify,
    acknowledgeCoordinatedCommit: (revision) => {
      coordinating = false;
      coordinatedRecovery = undefined;
      const nextWaiting = waiting;
      waiting = persistencePaused ? nextWaiting : undefined;
      const state = observable.getState();
      const committedState: SpaceSessionState = {
        ...state,
        acknowledgedRevision: revision,
        changedSinceExport: hasChangedSinceExport(revision, exportedRevision),
        persistence: { kind: 'settled' },
      };
      observable.install(committedState);
      if (nextWaiting === undefined || persistencePaused) publishIdle();
      else startCommit(nextWaiting, revision, committedState);
    },
    completeCoordinatedDeletion: () => {
      coordinating = false;
      coordinatedRecovery = undefined;
      waiting = undefined;
      committing = undefined;
      observable.install({ ...observable.getState(), persistence: { kind: 'settled' } });
      publishIdle();
    },
    conflictCoordinatedCommit: ({ current, baseline }) => {
      coordinating = false;
      waiting = undefined;
      if (current !== undefined) exportedRevision = current.exportedRevision;
      const state = observable.getState();
      const conflictedState: SpaceSessionState = {
        ...state,
        persistence: {
          kind: 'conflicted',
          current: current === undefined ? undefined : clone(current),
          baseline: baseline === undefined ? undefined : clone(baseline),
        },
      };
      if (current !== undefined) {
        conflictedState.acknowledgedRevision = current.revision;
        conflictedState.changedSinceExport = hasChangedSinceExport(
          current.revision,
          exportedRevision,
        );
      }
      observable.install(conflictedState);
      publishIdle();
    },
    failCoordinatedCommit,
    blockCoordinatedCommit: (blocked) => {
      const state = observable.getState();
      const { persistence } = state;
      if (persistence.kind === 'settled' || persistence.kind === 'pending') return;
      observable.install({ ...state, persistence: { ...persistence, blocked } });
    },
    setCoordinatedRecovery: (recovery) => {
      coordinatedRecovery = recovery;
    },
    holdsCoordinatedRecovery: (recovery) => coordinatedRecovery === recovery,
    restoreCoordinatedCommit: (snapshot, revision) => {
      coordinating = false;
      waiting = undefined;
      coordinatedRecovery = undefined;
      observable.install({
        ...observable.getState(),
        working: clone(snapshot),
        acknowledgedRevision: revision,
        changedSinceExport: hasChangedSinceExport(revision, exportedRevision),
        persistence: { kind: 'settled' },
      });
      publishIdle();
    },
  };
};

export const openSpaceSession = (
  backend: SpaceBackend,
  loaded: LoadedSpace,
  options: SpaceSessionOptions = {},
): SpaceSession => openManagedSpaceSession(backend, loaded, options).session;
