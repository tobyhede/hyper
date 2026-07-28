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

const clone = <T>(value: T): T => structuredClone(value);

const hasChangedSinceExport = (
  acknowledgedRevision: bigint,
  exportedRevision: bigint | null,
): boolean => exportedRevision === null || acknowledgedRevision !== exportedRevision;

export const openSpaceSession = (backend: SpaceBackend, loaded: LoadedSpace): SpaceSession => {
  let exportedRevision = loaded.exportedRevision;
  let state: SpaceSessionState = {
    working: clone(loaded.snapshot),
    acknowledgedRevision: loaded.revision,
    changedSinceExport: hasChangedSinceExport(loaded.revision, exportedRevision),
    persistence: { kind: 'settled' },
  };
  let inFlight = false;
  let waiting: SpaceSnapshot | undefined;
  const listeners = new Set<() => void>();

  const publish = (next: SpaceSessionState): void => {
    state = next;
    for (const listener of listeners) listener();
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
    submit: (snapshot) => {
      const working = clone(snapshot);
      const previous = state.persistence;
      publish({ ...state, working });
      if (previous.kind === 'conflicted' || previous.kind === 'failed') return;
      if (inFlight) {
        waiting = working;
        return;
      }
      startCommit(working, state.acknowledgedRevision);
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
