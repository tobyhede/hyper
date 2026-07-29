import type { SpaceSessionState } from '@project/persistence';

export const waitForSettled = (
  getState: () => SpaceSessionState,
  subscribe: (listener: () => void) => () => void,
): Promise<SpaceSessionState> => {
  const current = getState();
  if (current.persistence.kind === 'settled') return Promise.resolve(current);
  if (current.persistence.kind !== 'pending') {
    return Promise.reject(new Error(`Persistence ended as ${current.persistence.kind}`));
  }
  return new Promise((resolve, reject) => {
    const unsubscribe = subscribe(() => {
      const state = getState();
      const { kind } = state.persistence;
      if (kind === 'pending') return;
      unsubscribe();
      if (kind === 'settled') {
        resolve(state);
      } else {
        reject(new Error(`Persistence ended as ${kind}`));
      }
    });
  });
};
