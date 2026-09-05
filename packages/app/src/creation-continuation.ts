import type { CardId } from '@project/core';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';

/** A completed gesture; selection, naming and focus policy belong to its recipient. */
export type CreationContinuationRequest =
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'created';
      readonly cardKind: 'markdown' | 'alias' | 'space';
      readonly cardId: CardId | null;
    };

interface ContinuationState {
  readonly request: CreationContinuationRequest | null;
  readonly namingCardId: CardId | null;
}

/** Facts from the committed render, before attempting to reach its controls. */
interface ContinuationSurface {
  readonly paneOpen: boolean;
  readonly cards: readonly { readonly id: string }[];
  readonly canName: boolean;
  readonly canFocusAddCard: boolean;
}

interface ContinuationSeams {
  readonly selectCard: (cardId: CardId) => void;
  readonly focusAddCard: () => void;
  readonly reportObserverError: ObserverErrorReporter;
}

/**
 * One owner for the aftermath of Add Card and both creation panes.
 * Selection and focus have separate destinations: a Space Card is selected,
 * but its title is already authored, so focus returns to the menu. Naming is
 * retained until the canvas acknowledges it, including across its first mount.
 */
export function createCreationContinuation({
  selectCard,
  focusAddCard,
  reportObserverError,
}: ContinuationSeams) {
  const state = createObservableState<ContinuationState>(
    { request: null, namingCardId: null },
    reportObserverError,
  );
  const received = new WeakSet<CreationContinuationRequest>();
  const publish = (next: ContinuationState): void => {
    state.install(next);
    state.notify();
  };
  return {
    getState: state.getState,
    subscribe: state.subscribe,
    request: (request: CreationContinuationRequest): void => {
      if (received.has(request)) return;
      received.add(request);
      publish({ request, namingCardId: null });
    },
    resume: (surface: ContinuationSurface): void => {
      const { request, namingCardId } = state.getState();
      if (request === null || namingCardId !== null || surface.paneOpen) return;
      const cardId = request.kind === 'created' ? request.cardId : null;
      if (cardId !== null && !surface.cards.some(({ id }) => id === cardId)) return;
      if (request.kind === 'created' && request.cardKind !== 'space' && cardId !== null) {
        if (!surface.canName) return;
        state.install({ request, namingCardId: cardId });
        selectCard(cardId);
        state.notify();
        return;
      }
      if (!surface.canFocusAddCard) return;
      state.install({ request: null, namingCardId: null });
      if (cardId !== null) selectCard(cardId);
      focusAddCard();
      state.notify();
    },
    named: (cardId: string): void => {
      if (state.getState().namingCardId !== cardId) return;
      publish({ request: null, namingCardId: null });
    },
  };
}
