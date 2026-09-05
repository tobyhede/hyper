import type { CreationContinuationRequest } from './creation-continuation';
import type { Card, CardId, UUID } from '@project/core';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type SpaceSummary,
} from '@project/persistence';
import {
  presentCardChoicesBreak,
  presentCardCreationBreak,
  type CardCreationRefusalErrors,
} from './authoring-refusal';

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
 * The module owns current state so admission takes effect before a collaborator
 * runs, without waiting for React to render. The pure reducer remains the one
 * transition rule; the observable only installs and publishes its answer.
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
   * The identity created by the completed Edit, when available. The recipient
   * decides selection and focus from the Card kind; submit adapters only create.
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
  /** Where the finished gesture leaves the author, until an adapter spends it. */
  readonly continuation: CreationContinuationRequest | null;
}

type CardCreationAction =
  | { readonly type: 'open'; readonly kind: CardCreationKind }
  | { readonly type: 'choices'; readonly opening: number; readonly read: CardCreationRead }
  | { readonly type: 'submitting' }
  | { readonly type: 'settled'; readonly outcome: CardCreationOutcome }
  /** The author edited a field, so the refused attempt is over. */
  | { readonly type: 'refusal-stale' }
  | { readonly type: 'cancel' }
  | { readonly type: 'presenting' }
  /** An adapter has spent the pending continuation. */
  | { readonly type: 'continued' };

const CARD_CREATION_CLOSED: CardCreationState = {
  pane: { status: 'closed' },
  opening: 0,
  continuation: null,
};

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

function cardCreationReducer(
  state: CardCreationState,
  action: CardCreationAction,
): CardCreationState {
  switch (action.type) {
    case 'open':
      // The same transition decides whether the shell may start a choices read.
      if (state.pane.status !== 'closed') return state;
      return {
        pane: {
          status: 'choosing',
          choices: initialChoices(action.kind),
          listing: null,
          refusal: null,
        },
        opening: state.opening + 1,
        // A continuation owed from an earlier gesture is not this opening's to
        // discard. Its adapter waits for a pane-free render either way.
        continuation: state.continuation,
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
      const { cardId } = action.outcome;
      return {
        ...state,
        pane: { status: 'closed' },
        continuation: { kind: 'created', cardKind: choices.kind, cardId },
      };
    }

    case 'refusal-stale':
      if (state.pane.status !== 'choosing' || state.pane.refusal === null) return state;
      return { ...state, pane: { ...state.pane, refusal: null } };

    case 'cancel':
      // The Edit completes whether or not the surface that began it is still
      // mounted, so closing here would abandon it through a route the pane
      // itself refuses.
      if (state.pane.status !== 'choosing') return state;
      return { ...state, pane: { status: 'closed' }, continuation: { kind: 'cancelled' } };

    case 'presenting':
      // Presenting waits for a coordinated Edit already in flight; its
      // completion closes the pane on the next pass. Nothing is owed either
      // way: the author asked for a presentation, not for a control.
      if (state.pane.status !== 'choosing') return state;
      return { ...state, pane: { status: 'closed' } };

    case 'continued':
      return state.continuation === null ? state : { ...state, continuation: null };
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
}

export interface CardCreation {
  readonly getState: () => CardCreationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly open: (kind: CardCreationKind) => void;
  readonly submit: (input: CardCreationInput) => void;
  readonly cancel: () => void;
  /** Presenting has started, so this surface goes, creating nothing. */
  readonly withdraw: () => void;
  readonly refusalStale: () => void;
  readonly continued: () => void;
}

/** Card creation owns admission, transitions and asynchronous recovery. */
export function createCardCreation({
  readChoices,
  submit,
  reportBreak,
}: CardCreationSeams): CardCreation {
  const observable = createObservableState(CARD_CREATION_CLOSED, reportBreak);
  const transition = (action: CardCreationAction): CardCreationState | null => {
    const state = observable.getState();
    const next = cardCreationReducer(state, action);
    if (next === state) return null;
    observable.install(next);
    return next;
  };
  const dispatch = (action: CardCreationAction): CardCreationState | null => {
    const next = transition(action);
    if (next !== null) observable.notify();
    return next;
  };
  /**
   * The sink, made incapable of interrupting the work it describes.
   *
   * Every recovery below is a dispatch that sits *after* a report: the pane
   * leaves `submitting`, or the list stops saying it is still being read. A
   * sink that threw would take that dispatch with it and strand the pane with
   * Create, Cancel and Escape all disabled and nothing left to end it — and on
   * the synchronous arms it would escape into the event handler that submitted
   * instead. The reporter is injected and required with no default (ADR 0016),
   * so it is the one collaborator here this module cannot vouch for; wrapping
   * is what makes the guarantee this module's rather than its composer's.
   */
  const report = createNonThrowingReporter(reportBreak);

  const broke: ObserverErrorReporter = (failure) => {
    report(failure);
    dispatch({
      type: 'settled',
      outcome: { kind: 'refused', errors: presentCardCreationBreak(failure) },
    });
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    open: (kind) => {
      const opened = dispatch({ type: 'open', kind });
      if (opened === null) return;
      const answer = (read: CardCreationRead): void => {
        dispatch({ type: 'choices', opening: opened.opening, read });
      };
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
      // Admission precedes the collaborator: even a synchronous Edit can
      // reenter through its observers. Publish busy only if it returns a promise.
      if (transition({ type: 'submitting' }) === null) return;
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
        dispatch({ type: 'settled', outcome });
        return;
      }
      observable.notify();
      void outcome.then((settled) => dispatch({ type: 'settled', outcome: settled }), broke);
    },

    cancel: () => dispatch({ type: 'cancel' }),
    withdraw: () => dispatch({ type: 'presenting' }),
    refusalStale: () => dispatch({ type: 'refusal-stale' }),
    continued: () => dispatch({ type: 'continued' }),
  };
}
