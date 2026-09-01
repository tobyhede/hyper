import type { SpaceSnapshot } from '@project/core';
import type { CommitResult, LoadedSpace, SpaceBackend } from './backend';
import { createObservableState, type ObserverErrorReporter } from './observable-state';

type RetryableFailure = Extract<CommitResult, { kind: 'retryable-failure' }>;
type PermanentFailure = Extract<CommitResult, { kind: 'permanent-failure' }>;

export interface SpaceSessionState {
  working: SpaceSnapshot;
  acknowledgedRevision: bigint;
  changedSinceExport: boolean;
  persistence:
    | { kind: 'settled' }
    | { kind: 'pending' }
    | { kind: 'failed'; failure: RetryableFailure }
    | { kind: 'rejected'; failure: PermanentFailure }
    | { kind: 'conflicted'; current: LoadedSpace | undefined };
}

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
  readonly waitForIdle: () => Promise<void>;
  readonly beginCoordinatedCommit: (snapshot?: SpaceSnapshot) => void;
  readonly acknowledgeCoordinatedCommit: (revision: bigint) => void;
  readonly completeCoordinatedDeletion: () => void;
  readonly conflictCoordinatedCommit: (current: LoadedSpace | undefined) => void;
  readonly failCoordinatedCommit: (
    result: Exclude<CommitResult, { kind: 'committed' } | { kind: 'conflict' }>,
  ) => void;
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
  let inFlight = false;
  let coordinating = false;
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
  ): void => {
    inFlight = true;
    committing = snapshot;
    observable.publish({ ...unpublishedState, persistence: { kind: 'pending' } });
    void backend
      .commit({
        changes: [
          {
            kind: 'update',
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
                  message: `Commit result omitted the revision for Space ${snapshot.id}`,
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
            if (nextWaiting === undefined) {
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
            publishPersistence({
              kind: 'rejected',
              failure: {
                kind: 'permanent-failure',
                code: 'invalid-commit',
                message: result.errors.map((error) => error.kind).join(', '),
              },
            });
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
                  message: `Conflict result omitted the current Space ${snapshot.id}`,
                },
              });
              publishIdle();
              return;
            }
            const { current } = conflict;
            if (current === undefined) {
              observable.publish({
                ...observable.getState(),
                persistence: { kind: 'conflicted', current: undefined },
              });
              publishIdle();
              return;
            }
            exportedRevision = current.exportedRevision;
            observable.publish({
              ...observable.getState(),
              acknowledgedRevision: current.revision,
              changedSinceExport: hasChangedSinceExport(current.revision, exportedRevision),
              persistence: { kind: 'conflicted', current: clone(current) },
            });
            publishIdle();
          }
        }
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
      const working = clone(snapshot);
      const previous = observable.getState().persistence;
      observable.publish({ ...observable.getState(), working });
      if (previous.kind === 'conflicted' || previous.kind === 'failed') return;
      const newest = observable.getState().working;
      if (inFlight || coordinating) {
        if (newest !== committing) waiting = newest;
        return;
      }
      startCommit(newest, observable.getState().acknowledgedRevision);
    },
    retry: () => {
      const state = observable.getState();
      if (state.persistence.kind !== 'failed' || inFlight || coordinating) return;
      startCommit(state.working, state.acknowledgedRevision);
    },
    acceptRemote: () => {
      const state = observable.getState();
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
      if (state.persistence.kind !== 'conflicted' || inFlight || coordinating) return;
      const { current } = state.persistence;
      const revision = current?.revision ?? state.acknowledgedRevision;
      if (current !== undefined) exportedRevision = current.exportedRevision;
      const working = clone(snapshot);
      const resolvedState: SpaceSessionState = {
        working,
        acknowledgedRevision: revision,
        changedSinceExport: hasChangedSinceExport(revision, exportedRevision),
        persistence: { kind: 'conflicted', current },
      };
      startCommit(working, revision, resolvedState);
    },
  };

  const failCoordinatedCommit: ManagedSpaceSession['failCoordinatedCommit'] = (result) => {
    coordinating = false;
    waiting = undefined;
    if (result.kind === 'retryable-failure') {
      publishPersistence({ kind: 'failed', failure: result });
    } else if (result.kind === 'permanent-failure') {
      publishPersistence({ kind: 'rejected', failure: result });
    } else {
      publishPersistence({
        kind: 'rejected',
        failure: {
          kind: 'permanent-failure',
          code: 'invalid-commit',
          message: result.errors.map((error) => error.kind).join(', '),
        },
      });
    }
    publishIdle();
  };

  return {
    session,
    isIdle: () => !inFlight && !coordinating,
    waitForIdle: () => {
      if (!inFlight && !coordinating) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.add(resolve));
    },
    beginCoordinatedCommit: (snapshot) => {
      if (inFlight || coordinating) throw new Error('Space session is already committing');
      coordinating = true;
      committing = snapshot;
      const state = observable.getState();
      const pendingState: SpaceSessionState = {
        ...state,
        persistence: { kind: 'pending' },
      };
      if (snapshot !== undefined) pendingState.working = clone(snapshot);
      observable.publish(pendingState);
    },
    acknowledgeCoordinatedCommit: (revision) => {
      coordinating = false;
      const nextWaiting = waiting;
      waiting = undefined;
      const state = observable.getState();
      const committedState: SpaceSessionState = {
        ...state,
        acknowledgedRevision: revision,
        changedSinceExport: hasChangedSinceExport(revision, exportedRevision),
        persistence: { kind: 'settled' },
      };
      observable.publish(committedState);
      if (nextWaiting === undefined) publishIdle();
      else startCommit(nextWaiting, revision, committedState);
    },
    completeCoordinatedDeletion: () => {
      coordinating = false;
      waiting = undefined;
      committing = undefined;
      publishPersistence({ kind: 'settled' });
      publishIdle();
    },
    conflictCoordinatedCommit: (current) => {
      coordinating = false;
      waiting = undefined;
      if (current !== undefined) exportedRevision = current.exportedRevision;
      const state = observable.getState();
      const conflictedState: SpaceSessionState = {
        ...state,
        persistence: {
          kind: 'conflicted',
          current: current === undefined ? undefined : clone(current),
        },
      };
      if (current !== undefined) {
        conflictedState.acknowledgedRevision = current.revision;
        conflictedState.changedSinceExport = hasChangedSinceExport(
          current.revision,
          exportedRevision,
        );
      }
      observable.publish(conflictedState);
      publishIdle();
    },
    failCoordinatedCommit,
  };
};

export const openSpaceSession = (
  backend: SpaceBackend,
  loaded: LoadedSpace,
  options: SpaceSessionOptions = {},
): SpaceSession => openManagedSpaceSession(backend, loaded, options).session;
