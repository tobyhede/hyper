import type { Thing, ThingId, UUID } from '@project/core';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type SpaceSummary,
} from '@project/persistence';
import {
  presentThingChoicesBreak,
  presentThingCreationBreak,
  type ThingCreationRefusalErrors,
} from './authoring-refusal';
import type { Continuation, PendingContinuation } from './continuation';

/**
 * Creating a Thing from a pane, as one state machine.
 *
 * Two panes create a Thing — an Alias and a Space Thing — and before this module
 * their state was thirteen values on `App`, written from five places across
 * three files. Two illegal states were representable and both were prevented
 * only by reasoning that spanned those files: a busy flag outliving the pane it
 * disables, and two panes open at once.
 *
 * **One instance, not one per kind.** The kind rides on the choices the pane is
 * offering, so mutual exclusion is structural rather than an argument about the
 * shape of the Add Thing menu.
 *
 * The module owns current state so admission takes effect before a collaborator
 * runs, without waiting for React to render. The pure reducer remains the one
 * transition rule; the observable only installs and publishes its answer.
 */

export type ThingCreationKind = 'alias' | 'space';

/**
 * The Spaces a Space Thing may reference, and why there may be none to offer.
 *
 * A list rather than an array, because an empty array cannot say which of three
 * things it means: a repository with no other Space, a read still in flight, or
 * a read that failed. Only the first is an answer the author has seen.
 */
export type SpaceThingTargetListing =
  | { readonly kind: 'pending' }
  | { readonly kind: 'read'; readonly spaces: readonly SpaceSummary[] }
  | { readonly kind: 'unreadable' };

/** What the open pane offers to choose from, and which pane that makes it. */
export type ThingCreationChoices =
  | { readonly kind: 'alias'; readonly targets: readonly Thing[] }
  | { readonly kind: 'space'; readonly targets: SpaceThingTargetListing };

/**
 * What a choices read came to.
 *
 * The read answers rather than rejects, because only the seam knows which kind
 * it was reading for and how to say that it failed. `listing` is already
 * presented for the same reason every refusal here is (ADR 0057): the module
 * holds one refusal type instead of being generic over two unions.
 */
export interface ThingCreationRead {
  readonly choices: ThingCreationChoices;
  /** Why the offered list is not the whole answer, or `null`. */
  readonly listing: ThingCreationRefusalErrors | null;
}

export type ThingCreationInput =
  | { readonly kind: 'alias'; readonly target: ThingId; readonly title: string }
  | { readonly kind: 'space'; readonly targetSpaceId: UUID | null; readonly title: string };

/**
 * What one creation attempt came to.
 *
 * Three outcomes rather than the four arms `AuthoringResult` has, because the
 * pane distinguishes only what it must do next. `none` is where an Alias's
 * `queued` and `unchanged` land — the attempt is over and the pane stays
 * exactly as it was — bar the refusal it withdraws, which described the
 * attempt this one replaced rather than this one. A rejected coordination
 * lands on `refused`: it produces no Thing and returns the author to a pane
 * whose fields are editable, and that is the whole of what `refused` means
 * here.
 */
export type ThingCreationOutcome =
  | { readonly kind: 'refused'; readonly errors: ThingCreationRefusalErrors }
  /**
   * The Thing exists. `thingId` is the Thing to continue at, or `null` for a
   * creation that leaves none — a Space Thing's lifecycle answers a completed
   * Edit and not the identity it minted (ADR 0076), and its title was typed on
   * the pane before the Edit ran, so there is nothing left to name.
   */
  | { readonly kind: 'created'; readonly thingId: ThingId | null }
  | { readonly kind: 'none' };

/** What an open pane is offering, whether or not an attempt is running. */
interface ThingCreationOpen {
  readonly choices: ThingCreationChoices;
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
  readonly listing: ThingCreationRefusalErrors | null;
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
export type ThingCreationPane =
  | { readonly status: 'closed' }
  | ({
      readonly status: 'choosing';
      /** Why the last attempt produced no Thing, or `null`. */
      readonly refusal: ThingCreationRefusalErrors | null;
    } & ThingCreationOpen)
  | ({
      readonly status: 'submitting';
      /**
       * Whether this pane is gone the moment its Edit is over.
       *
       * A replacement lands on a busy pane and cannot close it — the Edit
       * completes whether or not the surface that began it is still mounted —
       * so it is recorded here and spent by `settled`. Without it the wait is
       * indistinguishable from forgetting: the epoch that discarded the pane is
       * read once, during a render, and a `refused` or `none` ending would
       * return the author to `choosing` holding choices read from the Space
       * that is gone.
       */
      readonly discarded: boolean;
    } & ThingCreationOpen);

export interface ThingCreationState {
  readonly pane: ThingCreationPane;
  /**
   * Which opening of the pane is on screen, counted from one.
   *
   * A read answers the opening it was made for. Without this, cancelling a
   * Space Thing pane while its listing is in flight and opening a second one
   * fills the second pane from the first read — which the effect this module
   * replaces prevented with a captured `current` flag in its cleanup.
   */
  readonly opening: number;
}

type ThingCreationAction =
  | { readonly type: 'open'; readonly kind: ThingCreationKind }
  | { readonly type: 'choices'; readonly opening: number; readonly read: ThingCreationRead }
  | { readonly type: 'submitting' }
  | { readonly type: 'settled'; readonly outcome: ThingCreationOutcome }
  /** The author edited a field, so the refused attempt is over. */
  | { readonly type: 'refusal-stale' }
  | { readonly type: 'cancel' }
  | { readonly type: 'presenting' }
  /** The working Space was replaced, so what the pane is offering is gone. */
  | { readonly type: 'replaced' };

const THING_CREATION_CLOSED: ThingCreationState = {
  pane: { status: 'closed' },
  opening: 0,
};

/**
 * Where focus goes when a pane closes leaving no Thing to continue at.
 *
 * Cancellation and a Space Thing creation take the same one: the author is
 * returned to the control they opened the pane from.
 *
 * **Keyed by the kind, because the Dock draws one control per kind.** While the
 * three kinds sat behind a single `+` there was one place to come back to and
 * the address could be a constant. They are peers now, so a cancelled Alias
 * returns to Create Alias rather than to whichever peer happens to carry the
 * attribute — landing the caret on a command the author never pressed is the
 * kind of near-miss nobody reports and everybody feels.
 */
const returnToCreate = (kind: ThingCreationKind): PendingContinuation => ({
  target: { kind: 'control', name: kind === 'alias' ? 'create-alias' : 'create-space-thing' },
  select: false,
  then: 'focus',
});

/**
 * The kind the pane is creating, where a close has to name it.
 *
 * Read off `choices`, which is where the open pane records it — the two arms of
 * `ThingCreationChoices` are keyed by the same union, so there is no second
 * field to keep in step with it.
 */
const creatingKind = (state: ThingCreationState): ThingCreationKind | null =>
  state.pane.status === 'closed' ? null : state.pane.choices.kind;

/** Where a creation that minted a Thing continues: on it, selected and named. */
const nameCreatedThing = (thingId: ThingId): PendingContinuation => ({
  target: { kind: 'thing', thingId },
  select: true,
  then: 'rename',
});

/**
 * What a pane offers before its read has answered.
 *
 * An Alias reads synchronously, so its empty list is never seen; a Space Thing's
 * `pending` is, and says so on the field it is about.
 */
const initialChoices = (kind: ThingCreationKind): ThingCreationChoices =>
  kind === 'alias'
    ? { kind: 'alias', targets: [] }
    : { kind: 'space', targets: { kind: 'pending' } };

/**
 * What a pane offers when its read threw rather than answered.
 *
 * Not {@link initialChoices}: a Space Thing pane opened on `pending` says it is
 * still reading and withholds Create until it is not, so answering a failure
 * with the opening value would leave the author waiting on a read that is over.
 * That distinction is the whole reason the listing has three arms.
 */
const unreadableChoices = (kind: ThingCreationKind): ThingCreationChoices =>
  kind === 'alias'
    ? { kind: 'alias', targets: [] }
    : { kind: 'space', targets: { kind: 'unreadable' } };

/**
 * The one message an open pane draws, whichever channel it is on.
 *
 * Here rather than at the surface, because which of the two wins is a fact
 * about the arms of {@link ThingCreationPane}: a refusal describes the attempt
 * the author just made and a failed listing describes the list, and only this
 * module knows that a keystroke ends the first and nothing ends the second.
 * Written as a ternary at the call site, a fourth arm would compile and draw
 * the wrong one.
 */
export const thingCreationMessage = (
  pane: ThingCreationPane,
): ThingCreationRefusalErrors | null => {
  switch (pane.status) {
    case 'closed':
      return null;
    // A running attempt has no refusal of its own — the one it began on is over
    // — but nothing typed makes a failed listing readable, so that stays.
    case 'submitting':
      return pane.listing;
    case 'choosing':
      return pane.refusal ?? pane.listing;
  }
};

function thingCreationReducer(
  state: ThingCreationState,
  action: ThingCreationAction,
): ThingCreationState {
  switch (action.type) {
    case 'open':
      // One pane, and this is where that is true; the same transition also
      // decides whether the shell may start a choices read. Opening twice would
      // advance the opening past the read each attempt made — both carry the
      // first — leaving the pane on its empty initial choices with nothing left
      // to fill it.
      if (state.pane.status !== 'closed') return state;
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
      const pane: ThingCreationPane =
        state.pane.status === 'choosing'
          ? { status: 'choosing', choices, listing, refusal: state.pane.refusal }
          : { status: 'submitting', choices, listing, discarded: state.pane.discarded };
      return { ...state, pane };
    }

    case 'submitting':
      if (state.pane.status !== 'choosing') return state;
      return {
        ...state,
        pane: {
          status: 'submitting',
          choices: state.pane.choices,
          listing: state.pane.listing,
          discarded: false,
        },
      };

    case 'settled': {
      if (state.pane.status === 'closed') return state;
      // A pane a replacement discarded was only ever waiting for its Edit to
      // be over, so every ending closes it — including the two that would
      // otherwise reopen it on choices read from the Space that is gone.
      if (state.pane.status === 'submitting' && state.pane.discarded)
        return { ...state, pane: { status: 'closed' } };
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
      // a pane left standing would go on offering Things from the Space that is
      // gone and refuse every one of them. It owes nothing either way: the
      // continuation this would have asked for is discarded by the very epoch
      // that sent this.
      //
      // A busy pane waits, for the reason `cancel` and `presenting` do, but it
      // records the discard rather than dropping it. `presenting` needs no such
      // field because `App` re-applies it from an effect that depends on the
      // operations, which are a new object on every dispatch; the epoch behind
      // this one is read during a render and consumed there, so nothing would
      // ever send it again.
      if (state.pane.status === 'submitting')
        return { ...state, pane: { ...state.pane, discarded: true } };
      if (state.pane.status !== 'choosing') return state;
      return { ...state, pane: { status: 'closed' } };
  }
}

export interface ThingCreationSeams {
  /**
   * The choices this kind of pane offers. Synchronous for an Alias, which
   * filters the Space it is already holding; a backend read for a Space Thing.
   *
   * Read once per opening, for both kinds. An Alias's list is therefore a
   * snapshot where it used to re-derive on every render — which nothing on
   * this canvas can invalidate, the pane being a modal that completes no other
   * Edit while it is up.
   */
  readonly readChoices: (kind: ThingCreationKind) => ThingCreationRead | Promise<ThingCreationRead>;
  /**
   * Make the Thing. Synchronous for an Alias's single completed Edit; a
   * coordinated multi-Space Edit for a Space Thing.
   */
  readonly submit: (
    input: ThingCreationInput,
  ) => ThingCreationOutcome | Promise<ThingCreationOutcome>;
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
   * that: `cancel`, `presenting` and `replaced` all leave a `submitting` pane
   * standing, so it is still open when its outcome arrives.
   *
   * A replacement is the one ending this asks for that the author will not see:
   * a Thing created into a Space that has since gone is named by a continuation
   * the canvas can never resolve, so it waits — harmlessly, the Thing being
   * nowhere on it — until the next request replaces it.
   */
  readonly continuation: Continuation;
}

export interface ThingCreation {
  readonly getState: () => ThingCreationState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly open: (kind: ThingCreationKind) => void;
  readonly submit: (input: ThingCreationInput) => void;
  readonly cancel: () => void;
  /** Presenting has started, so this surface goes, creating nothing. */
  readonly withdraw: () => void;
  /** The working Space was replaced, so this surface goes, creating nothing. */
  readonly discard: () => void;
  readonly refusalStale: () => void;
}

/**
 * Thing creation owns admission, transitions and asynchronous recovery.
 *
 * The module holds current state rather than taking a render's, so admission
 * takes effect before a collaborator runs and without waiting for React to
 * render: even a synchronous Edit can reenter through its own observers, and a
 * shell that read the state it was constructed with would admit the second
 * attempt. The pure reducer remains the one transition rule; the observable
 * only installs and publishes its answer.
 */
export function createThingCreation({
  readChoices,
  submit,
  reportBreak,
  continuation,
}: ThingCreationSeams): ThingCreation {
  const observable = createObservableState(THING_CREATION_CLOSED, reportBreak);
  const transition = (action: ThingCreationAction): ThingCreationState | null => {
    const state = observable.getState();
    const next = thingCreationReducer(state, action);
    if (next === state) return null;
    observable.install(next);
    return next;
  };
  const dispatch = (action: ThingCreationAction): ThingCreationState | null => {
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

  /**
   * Install the outcome, then say where the author goes.
   *
   * In that order and never the reverse: the pane's authoritative state is
   * this module's, and the continuation is a notification about a pane that has
   * already closed.
   */
  const settle = (outcome: ThingCreationOutcome): void => {
    // Read before dispatching: `settled` closes the pane, so the kind it was
    // creating is gone by the time the continuation is asked for.
    const kind = creatingKind(observable.getState());
    dispatch({ type: 'settled', outcome });
    if (outcome.kind !== 'created') return;
    if (outcome.thingId !== null) {
      continuation.request(nameCreatedThing(outcome.thingId));
      return;
    }
    if (kind !== null) continuation.request(returnToCreate(kind));
  };

  const broke: ObserverErrorReporter = (failure) => {
    report(failure);
    settle({ kind: 'refused', errors: presentThingCreationBreak(failure) });
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    open: (kind) => {
      const opened = dispatch({ type: 'open', kind });
      if (opened === null) return;
      const answer = (read: ThingCreationRead): void => {
        dispatch({ type: 'choices', opening: opened.opening, read });
      };
      try {
        const read = readChoices(kind);
        if (read instanceof Promise) {
          const unread: ObserverErrorReporter = (failure) => {
            report(failure);
            answer({
              choices: unreadableChoices(kind),
              listing: presentThingChoicesBreak(failure),
            });
          };
          void read.then(answer, unread);
          return;
        }
        answer(read);
      } catch (failure) {
        report(failure);
        answer({ choices: unreadableChoices(kind), listing: presentThingChoicesBreak(failure) });
      }
    },

    submit: (input) => {
      // Admission precedes the collaborator: even a synchronous Edit can
      // reenter through its observers. Publish busy only if it returns a promise.
      if (transition({ type: 'submitting' }) === null) return;
      let outcome: ThingCreationOutcome | Promise<ThingCreationOutcome>;
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
      observable.notify();
      void outcome.then(settle, broke);
    },

    cancel: () => {
      // Same order and the same reason as `settle`: the kind is read off the
      // open pane before the cancel closes it.
      const kind = creatingKind(observable.getState());
      if (dispatch({ type: 'cancel' }) === null) return;
      if (kind !== null) continuation.request(returnToCreate(kind));
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
