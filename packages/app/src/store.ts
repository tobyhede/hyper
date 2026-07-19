import { create } from 'zustand';
import {
  getPath,
  nextStepIndex,
  nodeIdAtStep,
  prevStepIndex,
  clampStepIndex,
} from '@project/graph';
import { manifest } from './manifest';

export type Mode = 'overview' | 'presenting';

export interface PresentationState {
  mode: Mode;
  selectedPathId: string | null;
  stepIndex: number;
  selectPath: (pathId: string) => void;
  enterPresentation: () => void;
  exitPresentation: () => void;
  next: () => void;
  prev: () => void;
  goToStep: (index: number) => void;
}

const firstPathId = manifest.paths[0]?.id ?? null;

export const usePresentationStore = create<PresentationState>((set, get) => ({
  mode: 'overview',
  selectedPathId: firstPathId,
  stepIndex: 0,

  selectPath: (pathId) => set({ selectedPathId: pathId, stepIndex: 0 }),

  enterPresentation: () => {
    if (!get().selectedPathId) return;
    set({ mode: 'presenting', stepIndex: 0 });
  },

  exitPresentation: () => set({ mode: 'overview' }),

  next: () => {
    const { selectedPathId, stepIndex } = get();
    const path = selectedPathId ? getPath(manifest, selectedPathId) : undefined;
    if (!path) return;
    set({ stepIndex: nextStepIndex(path, stepIndex) });
  },

  prev: () => {
    const { selectedPathId, stepIndex } = get();
    const path = selectedPathId ? getPath(manifest, selectedPathId) : undefined;
    if (!path) return;
    set({ stepIndex: prevStepIndex(path, stepIndex) });
  },

  goToStep: (index) => {
    const { selectedPathId } = get();
    const path = selectedPathId ? getPath(manifest, selectedPathId) : undefined;
    if (!path) return;
    set({ stepIndex: clampStepIndex(path, index) });
  },
}));

/** Node id of the current presentation step, or `null` outside presentation. */
export function selectActiveNodeId(state: PresentationState): string | null {
  if (state.mode !== 'presenting' || !state.selectedPathId) return null;
  const path = getPath(manifest, state.selectedPathId);
  if (!path) return null;
  return nodeIdAtStep(path, state.stepIndex) ?? null;
}
