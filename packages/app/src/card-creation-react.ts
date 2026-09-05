import { useMemo, useReducer } from 'react';
import {
  CARD_CREATION_CLOSED,
  cardCreationReducer,
  createCardCreation,
  type CardCreation,
  type CardCreationSeams,
  type CardCreationState,
} from './card-creation';

export interface CardCreationSurface extends CardCreation {
  readonly state: CardCreationState;
}

/**
 * The Card creation state machine, mounted.
 *
 * The whole of the React side, on purpose: the transitions are a pure reducer
 * and the asynchronous shell is a plain function, so what is left here is
 * `useReducer` and the memo that keeps the operations stable between renders
 * of one state. A caller passes seams it has memoized itself.
 */
export function useCardCreation(seams: CardCreationSeams): CardCreationSurface {
  const [state, dispatch] = useReducer(cardCreationReducer, CARD_CREATION_CLOSED);
  return useMemo(() => ({ ...createCardCreation(state, dispatch, seams), state }), [state, seams]);
}
