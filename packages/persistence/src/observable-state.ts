export type ObserverErrorReporter = (error: unknown) => void;

export interface ObservableState<State> {
  readonly getState: () => State;
  readonly subscribe: (listener: () => void) => () => void;
  readonly publish: (state: State) => void;
  readonly install: (state: State) => void;
  readonly notify: () => void;
  readonly clearSubscribers: () => void;
}

// SAFETY: the checks in this predicate already confirm `value` is a
// non-null object or function; this only widens it enough to probe for an
// optional `then` property without asserting one exists.
const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof (value as { readonly then?: unknown }).then === 'function';

/** Make diagnostic reporting incapable of interrupting the work it describes. */
export const createNonThrowingReporter = (
  reportError: ObserverErrorReporter,
): ObserverErrorReporter => {
  return (error): void => {
    try {
      reportError(error);
    } catch {
      // Diagnostics are never the publisher's failure path.
    }
  };
};

/**
 * Synchronous observable state with failure-isolated notifications.
 *
 * Publication snapshots the listeners that existed when it began. A listener
 * added while that snapshot is being notified begins observing at the next
 * publication, never part-way through the current one.
 */
export function createObservableState<State>(
  initialState: State,
  reportObserverError: ObserverErrorReporter,
): ObservableState<State> {
  let state = initialState;
  // `subscribe` deliberately accepts `() => void`, the contract React's
  // `useSyncExternalStore` expects. TypeScript still admits an async function
  // there, so the implementation retains and inspects its actual result.
  const listeners = new Set<() => unknown>();
  const safelyReportObserverError = createNonThrowingReporter(reportObserverError);

  const notify = (): void => {
    for (const listener of [...listeners]) {
      try {
        const settled = listener();
        if (isThenable(settled)) void settled.then(undefined, safelyReportObserverError);
      } catch (error) {
        safelyReportObserverError(error);
      }
    }
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish: (nextState) => {
      state = nextState;
      notify();
    },
    install: (nextState) => {
      state = nextState;
    },
    notify,
    clearSubscribers: () => listeners.clear(),
  };
}
