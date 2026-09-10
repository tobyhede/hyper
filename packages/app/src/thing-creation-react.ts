import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  createThingCreation,
  type ThingCreation,
  type ThingCreationSeams,
  type ThingCreationState,
} from './thing-creation';

export interface ThingCreationSurface extends ThingCreation {
  readonly state: ThingCreationState;
}

/**
 * Mount one Thing creation module and read its authoritative state.
 *
 * The instance is held in state rather than a memo, because it *is* the pane's
 * state now: a `useMemo` is a cache React may discard, and discarding this one
 * would answer "where is the pane" with a second machine at `closed` — closing
 * an open pane, losing the typed title, and leaving an Edit already in flight
 * to settle against an observable nothing reads, so its continuation is never
 * spent and focus never returns to Add Thing. The initializer therefore runs
 * once and the seams a caller passes after that are not read; they are stable
 * by construction, `App` memoizing them over callbacks that close over nothing.
 */
export function useThingCreation(seams: ThingCreationSeams): ThingCreationSurface {
  const [creation] = useState(() => createThingCreation(seams));
  const state = useSyncExternalStore(creation.subscribe, creation.getState);
  return useMemo(() => ({ ...creation, state }), [creation, state]);
}
