import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { Space } from '@project/graph';

/**
 * What the viewer has selected in the space: which route is emphasized, and
 * which card — if any — they have opened to read.
 *
 * Presenting is not here. It was a deck driven by a step index into a route
 * (`next`/`prev`/`goToStep`), and a route stopped being a sequence (ADR 0023),
 * so the deck and the index went with it (ADR 0024). What replaces it is a
 * traversal of the route's edges on the graph canvas (ADR 0027), which holds a
 * position in a *walk* rather than an index into a list — a different piece of
 * state, added when that surface is built rather than kept warm here.
 */
export interface SpaceState {
  /** The route drawn emphasized. ADR 0026 renames this to the *active* route. */
  selectedRouteId: string | null;
  /**
   * The card the viewer has opened to read, if any. Deliberately not named for a
   * card kind: opening a *space* card to explore its nested graph (ADR 0001) is
   * the same gesture on a different kind, and should reuse this.
   */
  openedCardId: string | null;
  selectRoute: (routeId: string) => void;
  openCard: (cardId: string) => void;
  closeCard: () => void;
}

export interface SpaceStore {
  useStore: UseBoundStore<StoreApi<SpaceState>>;
}

/**
 * Build a store bound to a given Space. The Space is passed in rather than
 * imported (ADR 0010), so the store is testable against fixture spaces and never
 * reaches for a module singleton.
 */
export function createSpaceStore(space: Space): SpaceStore {
  const firstRouteId = space.routes[0]?.id ?? null;

  const useStore = create<SpaceState>((set) => ({
    selectedRouteId: firstRouteId,
    openedCardId: null,

    selectRoute: (routeId) => set({ selectedRouteId: routeId }),

    openCard: (cardId) => set({ openedCardId: cardId }),
    closeCard: () => set({ openedCardId: null }),
  }));

  return { useStore };
}
