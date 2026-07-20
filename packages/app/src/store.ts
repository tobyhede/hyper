import { create } from 'zustand';
import {
  getRoute,
  nextStepIndex,
  cardIdAtStep,
  prevStepIndex,
  clampStepIndex,
} from '@project/graph';
import { manifest } from './manifest';

export type Mode = 'overview' | 'presenting';

export interface PresentationState {
  mode: Mode;
  selectedRouteId: string | null;
  stepIndex: number;
  selectRoute: (routeId: string) => void;
  enterPresentation: () => void;
  exitPresentation: () => void;
  next: () => void;
  prev: () => void;
  goToStep: (index: number) => void;
}

const firstRouteId = manifest.routes[0]?.id ?? null;

export const usePresentationStore = create<PresentationState>((set, get) => ({
  mode: 'overview',
  selectedRouteId: firstRouteId,
  stepIndex: 0,

  selectRoute: (routeId) => set({ selectedRouteId: routeId, stepIndex: 0 }),

  enterPresentation: () => {
    if (!get().selectedRouteId) return;
    set({ mode: 'presenting', stepIndex: 0 });
  },

  exitPresentation: () => set({ mode: 'overview' }),

  next: () => {
    const { selectedRouteId, stepIndex } = get();
    const route = selectedRouteId ? getRoute(manifest, selectedRouteId) : undefined;
    if (!route) return;
    set({ stepIndex: nextStepIndex(route, stepIndex) });
  },

  prev: () => {
    const { selectedRouteId, stepIndex } = get();
    const route = selectedRouteId ? getRoute(manifest, selectedRouteId) : undefined;
    if (!route) return;
    set({ stepIndex: prevStepIndex(route, stepIndex) });
  },

  goToStep: (index) => {
    const { selectedRouteId } = get();
    const route = selectedRouteId ? getRoute(manifest, selectedRouteId) : undefined;
    if (!route) return;
    set({ stepIndex: clampStepIndex(route, index) });
  },
}));

/** Card id of the current presentation step, or `null` outside presentation. */
export function selectActiveCardId(state: PresentationState): string | null {
  if (state.mode !== 'presenting' || !state.selectedRouteId) return null;
  const route = getRoute(manifest, state.selectedRouteId);
  if (!route) return null;
  return cardIdAtStep(route, state.stepIndex) ?? null;
}
