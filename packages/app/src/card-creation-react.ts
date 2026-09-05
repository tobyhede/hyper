import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  createCardCreation,
  type CardCreation,
  type CardCreationSeams,
  type CardCreationState,
} from './card-creation';

export interface CardCreationSurface extends CardCreation {
  readonly state: CardCreationState;
}

/**
 * Mount one Card creation module and read its authoritative state.
 *
 * The instance is held in state rather than a memo, because it *is* the pane's
 * state now: a `useMemo` is a cache React may discard, and discarding this one
 * would answer "where is the pane" with a second machine at `closed` — closing
 * an open pane, losing the typed title, and leaving an Edit already in flight
 * to settle against an observable nothing reads, so its continuation is never
 * spent and focus never returns to Add Card. The initializer therefore runs
 * once and the seams a caller passes after that are not read; they are stable
 * by construction, `App` memoizing them over callbacks that close over nothing.
 */
export function useCardCreation(seams: CardCreationSeams): CardCreationSurface {
  const [creation] = useState(() => createCardCreation(seams));
  const state = useSyncExternalStore(creation.subscribe, creation.getState);
  return useMemo(() => ({ ...creation, state }), [creation, state]);
}
