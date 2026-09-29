import { createObservableState, type ObserverErrorReporter } from '@project/persistence';

/** The exclusive asynchronous replacement, separate from the Space it will edit. */
export interface ImageReplacementActivity {
  readonly getState: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
  readonly run: <Result>(operation: () => Promise<Result>) => Promise<Result>;
}

export function createImageReplacementActivity(
  report: ObserverErrorReporter,
): ImageReplacementActivity {
  const state = createObservableState(false, report);
  return {
    getState: state.getState,
    subscribe: state.subscribe,
    run: async (operation) => {
      if (state.getState()) throw new Error('An image replacement is already pending.');
      state.publish(true);
      try {
        return await operation();
      } finally {
        state.publish(false);
      }
    },
  };
}
