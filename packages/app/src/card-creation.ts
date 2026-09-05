import type { Card, CardId, UUID } from '@project/core';
import type { ObserverErrorReporter, SpaceSummary } from '@project/persistence';
import {
  presentCardChoicesBreak,
  presentCardCreationBreak,
  type CardCreationRefusalErrors,
} from './authoring-refusal';
import type { Continuation, PendingContinuation } from './continuation';

/**
 * Creating a Card from a pane, as one state machine.
 *
 * Two panes create a Card — an Alias and a Space Card — and before this module
 * their state was thirteen values on `App`, written from five places across
 * three files. Two illegal states were representable and both were prevented
 * only by reasoning that spanned those files: a busy flag outliving the pane it
 * disables, and two panes open at once.
 *
 * **One instance, not one per kind.** The kind rides on the choices the pane is
 * offering, so mutual exclusion is structural rather than an argument about the
 * shape of the Add Card menu.
 *
 * **A reducer rather than an observable-state module.** `edge-authoring.ts` is
 * the other shape this package uses, and it is a store because React Flow asks
 * it synchronous questions mid-gesture, because its operations answer values to
 * their callers, and because it invalidates itself from two collaborator
 * subscriptions. None of that is true here: nothing asks this module a question
 * during a gesture, no operation answers one, and its single external fact —
 * presenting — reaches it as an ordinary dispatch. So the transitions are a
 * pure function, driven in a node test with no React tree, and
 * {@link createCardCreation} is the thin asynchronous shell over it.
 */

export type CardCreationKind = 'alias' | 'space';

/**
 * The Spaces a Space Card may reference, and why there may be none to offer.
 *
 * A list rather than an array, because an empty array cannot say which of three
 * things it means: a repository with no other Space, a read still in flight, or
 * a read that failed. Only the first is an answer the author has seen.
 */
export type SpaceCardTargetListing =
  | { readonly kind: 'pending' }
  | { readonly kind: 'read'; readonly spaces: readonly SpaceSummary[] }
  | { readonly kind: 'unreadable' };

/** What the open pane offers to choose from, and which pane that makes it. */
export type CardCreationChoices =
  | { readonly kind: 'alias'; readonly targets: readonly Card[] }
  | { readonly kind: 'space'; readonly targets: SpaceCardTargetListing };

/**
 * What a choices read came to.
 *
 * The read answers rather than rejects, because only the seam knows which kind
 * it was reading for and how to say that it failed. `listing` is already
 * presented for the same reason every refusal here is (ADR 0057): the module
 * holds one refusal type instead of being generic over two unions.
 */
export interface CardCreationRead {
  readonly choices: CardCreationChoices;
  /** Why the offered list is not the whole answer, or `null`. */
  readonly listing: CardCreationRefusalErrors | null;
}

export type CardCreationInput =
  | { readonly kind: 'alias'; readonly target: CardId; readonly title: string }
  | { readonly kind: 'space'; readonly targetSpaceId: UUID | null; readonly title: string };

/**
 * What one creation attempt came to.
 *
 * Three outcomes rather than the four arms `AuthoringResult` has, because the
 * pane distinguishes only what it must do next. `none` is where an Alias's
 * `queued` and `unchanged` land — the attempt is over and the pane stays
 * exactly as it was — bar the refusal it withdraws, which described the
 * attempt this one replaced rather than this one. A rejected coordination
 * lands on `refused`: it produces no Card and returns the author to a pane
 * whose fields are editable, and that is the whole of what `refused` means
 * here.
 */
export type CardCreationOutcome =
  | { readonly kind: 'refused'; readonly errors: CardCreationRefusalErrors }
  /**
   * The Card exists. `cardId` is the Card to continue at, or `null` for a
   * creation that leaves none — a Space Card's lifecycle answers a completed
   * Edit and not the identity it minted (ADR 0076), and its title was typed on
   * the pane before the Edit ran, so there is nothing left to name.
   */
  | { readonly kind: 'created'; readonly cardId: CardId | null }
  | { readonly kind: 'none' };

/** What an open pane is offering, whether or not an attempt is running. */
interface CardCreationOpen {
  readonly choices: CardCreationChoices;
  /**
   * Why the offered list is not the whole answer, or `null`.
   *
   * Held apart from `refusal` because the two are withdrawn by different
   * facts. A refusal describes the attempt the author just made, so the next
   * keystroke ends it. A failed listing describes the list itself: nothing
   * typed makes it readable, and withdrawing it would leave "A new Space"
   * standing alone with nothing saying why — which is the duplicate Space the
   * message exists to prevent.
   */
  readonly listing: CardCreationRefusalErrors | null;
}

/**
 * Closed, offering a choice, or running an Edit.
 *
 * `submitting` is an arm rather than a flag beside `choosing`, which is what
 * makes a busy pane that is not open unrepresentable. There is no `refused`
 * arm, because a refused attempt returns the author to a pane whose fields are
 * editable — that is `choosing` carrying a message. There is no arm for a
 * choices read in flight either: the pane opens immediately on an empty list
 * and fills.
 */
export type CardCreationPane =
  | { readonly status: 'closed' }
  | ({
      readonly status: 'choosing';
      /** Why the last attempt produced no Card, or `null`. */
      readonly refusal: CardCreationRefusalErrors | null;
    } & CardCreationOpen)
  | ({ readonly status: 'submitting' } & CardCreationOpen);

export interface CardCreationState {
  readonly pane: CardCreationPane;
  /**
   * Which opening of the pane is on screen, counted from one.
   *
   * A read answers the opening it was made for. Without this, cancelling a
   * Space Card pane while its listing is in flight and opening a second one
   * fills the second pane from the first read — which the effect this module
   * replaces prevented with a captured `current` flag in its cleanup.
   */
  readonly opening: number;
}

export type CardCreationAction =
  | { readonly type: 'open'; readonly kind: CardCreationKind }
  | { readonly type: 'choices'; readonly opening: number; readonly read: CardCreationRead }
  | { readonly type: 'submitting' }
  | { readonly type: 'settled'; readonly outcome: CardCreationOutcome }
  /** The author edited a field, so the refused attempt is over. */
  | { readonly type: 'refusal-stale' }
  | { readonly type: 'cancel' }
  | { readonly type: 'presenting' }
  /** The working Space was replaced, so what the pane is offering is gone. */
  | { readonly type: 'replaced' };

export const CARD_CREATION_CLOSED: CardCreationState = {
  pane: { status: 'closed' },
  opening: 0,
};

/**
 * Where focus goes when a pane closes leaving no Card to continue at.
 *
 * Cancellation and a Space Card creation take the same one: the author is
 * returned to the control the menu was opened from, which is where a closing
 * menu puts them anyway.
 */
const RETURN_TO_ADD_CARD: PendingContinuation = {
  target: { kind: 'control', name: 'add-card' },
  select: false,
  then: 'focus',
};

/** Where a creation that minted a Card continues: on it, selected and named. */
const nameCreatedCard = (cardId: CardId): PendingContinuation => ({
  target: { kind: 'card', cardId },
  select: true,
  then: 'rename',
});

/**
 * What a pane offers before its read has answered.
 *
 * An Alias reads synchronously, so its empty list is never seen; a Space Card's
 * `pending` is, and says so on the field it is about.
 */
const initialChoices = (kind: CardCreationKind): CardCreationChoices =>
  kind === 'alias'
    ? { kind: 'alias', targets: [] }
    : { kind: 'space', targets: { kind: 'pending' } };

/**
 * What a pane offers when its read threw rather than answered.
 *
 * Not {@link initialChoices}: a Space Card pane opened on `pending` says it is
 * still reading and withholds Create until it is not, so answering a failure
 * with the opening value would leave the author waiting on a read that is over.
 * That distinction is the whole reason the listing has three arms.
 */
const unreadableChoices = (kind: CardCreationKind): CardCreationChoices =>
  kind === 'alias'
    ? { kind: 'alias', targets: [] }
    : { kind: 'space', targets: { kind: 'unreadable' } };

export function cardCreationReducer(
  state: CardCreationState,
  action: CardCreationAction,
): CardCreationState {
  switch (action.type) {
    case 'open':
      return {
        pane: {
          status: 'choosing',
          choices: initialChoices(action.kind),
          listing: null,
          refusal: null,
        },
        opening: state.opening + 1,
      };

    case 'choices': {
      // A read that answers a pane the author has since closed or reopened
      // describes nothing on screen.
      if (action.opening !== state.opening || state.pane.status === 'closed') return state;
      const { choices, listing } = action.read;
      const pane: CardCreationPane =
        state.pane.status === 'choosing'
          ? { status: 'choosing', choices, listing, refusal: state.pane.refusal }
          : { status: 'submitting', choices, listing };
      return { ...state, pane };
    }

    case 'submitting':
      if (state.pane.status !== 'choosing') return state;
      return {
        ...state,
        pane: { status: 'submitting', choices: state.pane.choices, listing: state.pane.listing },
      };

    case 'settled': {
      if (state.pane.status === 'closed') return state;
      const { choices, listing } = state.pane;
      if (action.outcome.kind === 'refused') {
        return {
          ...state,
          pane: { status: 'choosing', choices, listing, refusal: action.outcome.errors },
        };
      }
      if (action.outcome.kind === 'none') {
        return { ...state, pane: { status: 'choosing', choices, listing, refusal: null } };
      }
      return { ...state, pane: { status: 'closed' } };
    }

    case 'refusal-stale':
      if (state.pane.status !== 'choosing' || state.pane.refusal === null) return state;
      return { ...state, pane: { ...state.pane, refusal: null } };

    case 'cancel':
      // The Edit completes whether or not the surface that began it is still
      // mounted, so closing here would abandon it through a route the pane
      // itself refuses.
      if (state.pane.status !== 'choosing') return state;
      return { ...state, pane: { status: 'closed' } };

    case 'presenting':
      // Presenting waits for a coordinated Edit already in flight; its
      // completion closes the pane on the next pass. Nothing is owed either
      // way: the author asked for a presentation, not for a control.
      if (state.pane.status !== 'choosing') return state;
      return { ...state, pane: { status: 'closed' } };

    case 'replaced':
      // A replacement discards every open Interaction draft (ADR 0042), and
      // this pane is one — its choices are a snapshot read once per opening, so
      // a pane left standing would go on offering Cards from the Space that is
      // gone and refuse every one of them. It waits on an Edit in flight for
      // the same reason `presenting` does, and owes nothing either way: the
      // continuation this would have asked for is discarded by the very epoch
      // that sent this.
      if (state.pane.status !== 'choosing') return state;
      return { ...state, pane: { status: 'closed' } };
  }
}

export interface CardCreationSeams {
  /**
   * The choices this kind of pane offers. Synchronous for an Alias, which
   * filters the Space it is already holding; a backend read for a Space Card.
   *
   * Read once per opening, for both kinds. An Alias's list is therefore a
   * snapshot where it used to re-derive on every render — which nothing on
   * this canvas can invalidate, the pane being a modal that completes no other
   * Edit while it is up.
   */
  readonly readChoices: (kind: CardCreationKind) => CardCreationRead | Promise<CardCreationRead>;
  /**
   * Make the Card. Synchronous for an Alias's single completed Edit; a
   * coordinated multi-Space Edit for a Space Card.
   */
  readonly submit: (input: CardCreationInput) => CardCreationOutcome | Promise<CardCreationOutcome>;
  /**
   * Where a rejection is logged, beside the sentence the author is given.
   *
   * Required with no default (ADR 0016). A default here would put a second,
   * invisible `console.error` behind whichever surface composed this.
   */
  readonly reportBreak: ObserverErrorReporter;
  /**
   * Where the finished pane leaves the author (`continuation.ts`).
   *
   * The module still decides *which* continuation a creation earns — that is
   * the pane's own rule, and its two answers are the consts above — but it no
   * longer holds the answer as a one-shot of its own for a caller to spend.
   *
   * Requested from this shell rather than from the reducer, which must stay
   * pure. The one thing that could make a shell's captured state wrong here is
   * a pane that closed under a running Edit, and the reducer forbids exactly
   * that: `cancel` and `presenting` both require `choosing`, so a `submitting`
   * pane is still open when its outcome arrives.
   */
  readonly continuation: Continuation;
}

export interface CardCreation {
  readonly open: (kind: CardCreationKind) => void;
  readonly submit: (input: CardCreationInput) => void;
  readonly cancel: () => void;
  /** Presenting has started, so this surface goes, creating nothing. */
  readonly withdraw: () => void;
  /** The working Space was replaced, so this surface goes, creating nothing. */
  readonly discard: () => void;
  readonly refusalStale: () => void;
}

/**
 * The asynchronous shell over the reducer.
 *
 * It takes the current state rather than reading one, because every guard here
 * is the reducer's rule restated at the point a seam would otherwise be called
 * for nothing — and a shell that held its own copy would be a second answer to
 * where the pane is.
 */
export function createCardCreation(
  state: CardCreationState,
  dispatch: (action: CardCreationAction) => void,
  { readChoices, submit, reportBreak: report, continuation }: CardCreationSeams,
): CardCreation {
  // The opening this call is about to become, so a read answers the pane it was
  // made for and not whichever one is on screen when it settles.
  const opening = state.opening + 1;

  /**
   * Install the outcome, then say where the author goes.
   *
   * In that order and never the reverse: the pane's authoritative state is
   * this module's, and the continuation is a notification about a pane that has
   * already closed.
   */
  const settle = (outcome: CardCreationOutcome): void => {
    dispatch({ type: 'settled', outcome });
    if (outcome.kind !== 'created') return;
    continuation.request(
      outcome.cardId === null ? RETURN_TO_ADD_CARD : nameCreatedCard(outcome.cardId),
    );
  };

  const broke: ObserverErrorReporter = (failure) => {
    report(failure);
    settle({ kind: 'refused', errors: presentCardCreationBreak(failure) });
  };

  return {
    open: (kind) => {
      if (state.pane.status !== 'closed') return;
      dispatch({ type: 'open', kind });
      const answer = (read: CardCreationRead): void => dispatch({ type: 'choices', opening, read });
      try {
        const read = readChoices(kind);
        if (read instanceof Promise) {
          const unread: ObserverErrorReporter = (failure) => {
            report(failure);
            answer({ choices: unreadableChoices(kind), listing: presentCardChoicesBreak(failure) });
          };
          void read.then(answer, unread);
          return;
        }
        answer(read);
      } catch (failure) {
        report(failure);
        answer({ choices: unreadableChoices(kind), listing: presentCardChoicesBreak(failure) });
      }
    },

    submit: (input) => {
      if (state.pane.status !== 'choosing') return;
      let outcome: CardCreationOutcome | Promise<CardCreationOutcome>;
      try {
        outcome = submit(input);
      } catch (failure) {
        broke(failure);
        return;
      }
      // Busy only for an attempt that is actually going to take a turn of the
      // event loop. An Alias's completed Edit is over before anything could
      // render the disabled controls, and the pane never flickers through them.
      if (!(outcome instanceof Promise)) {
        settle(outcome);
        return;
      }
      dispatch({ type: 'submitting' });
      void outcome.then(settle, broke);
    },

    cancel: () => {
      if (state.pane.status !== 'choosing') return;
      dispatch({ type: 'cancel' });
      continuation.request(RETURN_TO_ADD_CARD);
    },
    // Presenting is the one close that owes nothing: the author asked for a
    // presentation, not for a control.
    withdraw: () => dispatch({ type: 'presenting' }),
    // The same close for the same reason: the pane is offering a Space that is
    // gone, and the epoch that replaced it has already discarded whatever
    // continuation was owed.
    discard: () => dispatch({ type: 'replaced' }),
    refusalStale: () => dispatch({ type: 'refusal-stale' }),
  };
}
