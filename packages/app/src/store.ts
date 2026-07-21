import { create, type StoreApi, type UseBoundStore } from 'zustand';
import {
  getRoute,
  nextStepIndex,
  cardIdAtStep,
  prevStepIndex,
  clampStepIndex,
  type Space,
} from '@project/graph';

export type Mode = 'overview' | 'presenting';

export interface PresentationState {
  mode: Mode;
  selectedRouteId: string | null;
  stepIndex: number;
  /**
   * The card the viewer has opened to read, if any. Deliberately not named for a
   * card kind: opening a *space* card to explore its nested graph (ADR 0001) is
   * the same gesture on a different kind, and should reuse this.
   */
  openedCardId: string | null;
  selectRoute: (routeId: string) => void;
  openCard: (cardId: string) => void;
  closeCard: () => void;
  enterPresentation: () => void;
  exitPresentation: () => void;
  next: () => void;
  prev: () => void;
  goToStep: (index: number) => void;
}

export interface PresentationStore {
  useStore: UseBoundStore<StoreApi<PresentationState>>;
  /** Card id of the current presentation step, or `null` outside presentation. */
  selectActiveCardId: (state: PresentationState) => string | null;
}

/**
 * Build a presentation store bound to a given Space. The Space is passed in
 * rather than imported (ADR 0010), so the store is testable against fixture
 * spaces and never reaches for a module singleton.
 */
export function createPresentationStore(space: Space): PresentationStore {
  const firstRouteId = space.routes[0]?.id ?? null;

  const useStore = create<PresentationState>((set, get) => ({
    mode: 'overview',
    selectedRouteId: firstRouteId,
    stepIndex: 0,
    openedCardId: null,

    selectRoute: (routeId) => set({ selectedRouteId: routeId, stepIndex: 0 }),

    openCard: (cardId) => set({ openedCardId: cardId }),
    closeCard: () => set({ openedCardId: null }),

    enterPresentation: () => {
      if (!get().selectedRouteId) return;
      set({ mode: 'presenting', stepIndex: 0, openedCardId: null });
    },

    exitPresentation: () => set({ mode: 'overview' }),

    next: () => {
      const { selectedRouteId, stepIndex } = get();
      const route = selectedRouteId ? getRoute(space, selectedRouteId) : undefined;
      if (!route) return;
      set({ stepIndex: nextStepIndex(route, stepIndex) });
    },

    prev: () => {
      const { selectedRouteId, stepIndex } = get();
      const route = selectedRouteId ? getRoute(space, selectedRouteId) : undefined;
      if (!route) return;
      set({ stepIndex: prevStepIndex(route, stepIndex) });
    },

    goToStep: (index) => {
      const { selectedRouteId } = get();
      const route = selectedRouteId ? getRoute(space, selectedRouteId) : undefined;
      if (!route) return;
      set({ stepIndex: clampStepIndex(route, index) });
    },
  }));

  const selectActiveCardId = (state: PresentationState): string | null => {
    if (state.mode !== 'presenting' || !state.selectedRouteId) return null;
    const route = getRoute(space, state.selectedRouteId);
    if (!route) return null;
    return cardIdAtStep(route, state.stepIndex) ?? null;
  };

  return { useStore, selectActiveCardId };
}
