import type { SpaceSessionState } from '@project/persistence';

function settlementFor(state: SpaceSessionState): Promise<SpaceSessionState> | null {
  switch (state.persistence.kind) {
    case 'pending':
      return null;
    case 'settled':
      return Promise.resolve(state);
    case 'failed':
    case 'rejected':
    case 'conflicted':
      return Promise.reject(new Error(`Persistence ended as ${state.persistence.kind}`));
  }
}

export const waitForSettled = (
  getState: () => SpaceSessionState,
  subscribe: (listener: () => void) => () => void,
): Promise<SpaceSessionState> => {
  const current = getState();
  const currentSettlement = settlementFor(current);
  if (currentSettlement !== null) return currentSettlement;

  return new Promise((resolve, reject) => {
    const unsubscribe = subscribe(() => {
      const state = getState();
      const settlement = settlementFor(state);
      if (settlement === null) return;
      unsubscribe();
      void settlement.then(resolve, reject);
    });
  });
};
