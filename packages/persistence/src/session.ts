import type { SpaceSnapshot } from '@project/core';
import type { CommitResult, LoadedSpace, SpaceBackend } from './backend';

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
    | { kind: 'conflicted'; current: LoadedSpace };
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
  readonly reportObserverError?: (error: unknown) => void;
}

const clone = <T>(value: T): T => structuredClone(value);

const hasChangedSinceExport = (
  acknowledgedRevision: bigint,
  exportedRevision: bigint | null,
): boolean => exportedRevision === null || acknowledgedRevision !== exportedRevision;

const reportToConsole = (error: unknown): void => {
  console.error('SpaceSession observer failed', error);
};

export const openSpaceSession = (
  backend: SpaceBackend,
  loaded: LoadedSpace,
  options: SpaceSessionOptions = {},
): SpaceSession => {
  let exportedRevision = loaded.exportedRevision;
  let state: SpaceSessionState = {
    working: clone(loaded.snapshot),
    acknowledgedRevision: loaded.revision,
    changedSinceExport: hasChangedSinceExport(loaded.revision, exportedRevision),
    persistence: { kind: 'settled' },
  };
  let inFlight = false;
  let waiting: SpaceSnapshot | undefined;
  /** The snapshot `startCommit` handed the backend. Read only while `inFlight`. */
  let committing: SpaceSnapshot | undefined;
  const listeners = new Set<() => void>();
  const reportObserverError = options.reportObserverError ?? reportToConsole;

  /*
   * Unconditionally: nothing above a session observer can act on the failure.
   * `@project/http`'s `invokeLogError` rethrows an `Error` on purpose, because
   * Hono forwards one to `onError` and a swallowed failure would leave a
   * request answered by nothing. There is no such handler over a notification,
   * so rethrowing here would only hand the failure back to the publisher this
   * whole path exists to protect.
   */
  const safelyReportObserverError = (error: unknown): void => {
    try {
      reportObserverError(error);
    } catch {
      // Diagnostics cannot interrupt session work.
    }
  };

  const publish = (next: SpaceSessionState): void => {
    state = next;
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        safelyReportObserverError(error);
      }
    }
  };

  const publishPersistence = (persistence: SpaceSessionState['persistence']): void => {
    publish({ ...state, persistence });
  };

  const startCommit = (snapshot: SpaceSnapshot, expectedRevision: bigint): void => {
    inFlight = true;
    committing = snapshot;
    publishPersistence({ kind: 'pending' });
    void backend.commitSpace(clone(snapshot), expectedRevision).then((result) => {
      inFlight = false;
      switch (result.kind) {
        case 'committed': {
          const nextWaiting = waiting;
          waiting = undefined;
          state = {
            ...state,
            acknowledgedRevision: result.revision,
            changedSinceExport: hasChangedSinceExport(result.revision, exportedRevision),
          };
          if (nextWaiting === undefined) {
            publishPersistence({ kind: 'settled' });
          } else {
            startCommit(nextWaiting, result.revision);
          }
          return;
        }
        case 'retryable-failure':
          waiting = undefined;
          publishPersistence({ kind: 'failed', failure: result });
          return;
        case 'permanent-failure':
          waiting = undefined;
          publishPersistence({ kind: 'rejected', failure: result });
          return;
        case 'conflict':
          waiting = undefined;
          exportedRevision = result.current.exportedRevision;
          publish({
            ...state,
            acknowledgedRevision: result.current.revision,
            changedSinceExport: hasChangedSinceExport(result.current.revision, exportedRevision),
            persistence: { kind: 'conflicted', current: clone(result.current) },
          });
      }
    });
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
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
      const previous = state.persistence;
      publish({ ...state, working });
      if (previous.kind === 'conflicted' || previous.kind === 'failed') return;
      const newest = state.working;
      if (inFlight) {
        if (newest !== committing) waiting = newest;
        return;
      }
      startCommit(newest, state.acknowledgedRevision);
    },
    retry: () => {
      if (state.persistence.kind !== 'failed' || inFlight) return;
      startCommit(state.working, state.acknowledgedRevision);
    },
    acceptRemote: () => {
      if (state.persistence.kind !== 'conflicted') return;
      const { current } = state.persistence;
      exportedRevision = current.exportedRevision;
      publish({
        working: clone(current.snapshot),
        acknowledgedRevision: current.revision,
        changedSinceExport: hasChangedSinceExport(current.revision, exportedRevision),
        persistence: { kind: 'settled' },
      });
    },
    resolveConflict: (snapshot) => {
      if (state.persistence.kind !== 'conflicted' || inFlight) return;
      const { current } = state.persistence;
      exportedRevision = current.exportedRevision;
      const working = clone(snapshot);
      state = {
        working,
        acknowledgedRevision: current.revision,
        changedSinceExport: hasChangedSinceExport(current.revision, exportedRevision),
        persistence: { kind: 'conflicted', current },
      };
      startCommit(working, current.revision);
    },
  };
};
