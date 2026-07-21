import { create } from 'zustand';
import {
  getRoute,
  nextStepIndex,
  cardIdAtStep,
  prevStepIndex,
  clampStepIndex,
} from '@project/graph';
import { space } from './space';

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

const firstRouteId = space.routes[0]?.id ?? null;

export const usePresentationStore = create<PresentationState>((set, get) => ({
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

/** Card id of the current presentation step, or `null` outside presentation. */
export function selectActiveCardId(state: PresentationState): string | null {
  if (state.mode !== 'presenting' || !state.selectedRouteId) return null;
  const route = getRoute(space, state.selectedRouteId);
  if (!route) return null;
  return cardIdAtStep(route, state.stepIndex) ?? null;
}
