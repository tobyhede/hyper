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
  let publishingSubmit = false;
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
     * publishing, so a submit is **queued, not re-entered**: the reentrant call
     * installs its working Space and stops, and the submit already on the stack
     * makes the one commit decision, reading the newest installed state rather
     * than the snapshot it was handed. Deciding from the argument instead would
     * queue the older snapshot behind the newer one and store it last, undoing
     * a completed Edit at the next load.
     *
     * The flag covers publication only. `startCommit` publishes `pending` to
     * the same observers, and a submit made from *there* must reach the queue
     * normally — this call's commit decision is already behind it.
     */
    submit: (snapshot) => {
      const working = clone(snapshot);
      if (publishingSubmit) {
        publish({ ...state, working });
        return;
      }
      const previous = state.persistence;
      publishingSubmit = true;
      try {
        publish({ ...state, working });
      } finally {
        publishingSubmit = false;
      }
      if (previous.kind === 'conflicted' || previous.kind === 'failed') return;
      const current = state.working;
      if (inFlight) {
        waiting = current;
        return;
      }
      startCommit(current, state.acknowledgedRevision);
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
