import type { CardId } from '@project/core';
import {
  createObservableState,
  type ObservableState,
  type ObserverErrorReporter,
} from '@project/persistence';
import type { EdgeSubject } from './render-adapter';
import type { SpaceAuthoring } from './space-authoring';
import type { SpaceChromeTitleSubject } from './components/SpaceSidebar';

/**
 * Where an Edit continues, as one module.
 *
 * `CONTEXT.md` states the rule in several places — **an Edit continues at the
 * thing it produced** — and before this it had six implementations in five
 * mechanisms: a boolean ref, a projection poll, a component inside
 * `ReactFlowProvider`, an attribute query, a DOM closure held on React state,
 * and Edge Authoring's published one-shot. Each carried a paragraph about a
 * timing hazard of its own, and all six were the same hazard: **the
 * continuation runs before the surface it targets exists.**
 *
 * A gesture says *continue here, and do this when you arrive*; an adapter that
 * can reach the target spends it exactly once, on a render where it resolves.
 * Nothing here knows a browser or a framework, which is what makes the
 * transitions testable in the node environment.
 *
 * **One pending continuation, never a queue.** A continuation says where the
 * author should be *now*, so an unspent one is stale the moment a second
 * gesture finishes: {@link Continuation.request} replaces it silently. Firing
 * *twice* is the bug class this exists to close, and {@link Continuation.take}
 * is what closes it — `createdCardId` was set from two places and cleared from
 * none.
 */

/** What a continuation names. */
export type ContinuationTarget =
  | { readonly kind: 'card'; readonly cardId: CardId }
  | ({ readonly kind: 'edge' } & EdgeSubject)
  | { readonly kind: 'canvas' }
  | { readonly kind: 'sidebar-row'; readonly entity: SpaceChromeTitleSubject }
  | { readonly kind: 'control'; readonly name: ContinuationControl };

/**
 * A control that is neither a canvas subject nor a Sidebar row.
 *
 * Named rather than held as a ref: a module with no framework cannot name one,
 * and a name→ref registry only moves the lifetime problem — a control that
 * unmounts and re-registers leaves the module holding a stale element. The
 * adapter resolves each of these against `data-continuation-control`.
 */
export type ContinuationControl = 'add-card' | 'layout-header';

export interface PendingContinuation {
  readonly target: ContinuationTarget;
  /** Whether the canvas selection moves to this target. */
  readonly select: boolean;
  /** What happens once it is reached. */
  readonly then: 'nothing' | 'focus' | 'reveal' | 'rename';
}

export interface ContinuationState {
  /** What the author is owed, until an adapter spends it. */
  readonly pending: PendingContinuation | null;
}

export interface Continuation {
  readonly getState: () => ContinuationState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Continue here. Replaces an unspent continuation rather than queueing. */
  readonly request: (continuation: PendingContinuation) => void;
  /**
   * Spend the pending continuation, leaving none behind.
   *
   * Nullary on purpose. Which kinds an adapter owns is a fact about the shape
   * of the React tree — the canvas adapter mounts inside `ReactFlowProvider`
   * and the chrome adapter outside it — so a `take(kinds)` signature would put
   * mount topology into the interface of a module that has no framework. Each
   * adapter reads {@link ContinuationState.pending}, decides for itself whether
   * the kind is one it can reach, and takes only then.
   */
  readonly take: () => void;
  readonly dispose: () => void;
}

export interface ContinuationDependencies {
  /**
   * The two facts that discard a continuation, read where Edge Authoring
   * already reads them.
   *
   * The whole of Space Authoring rather than narrowed getters: Edge Authoring
   * takes it for exactly these two, and manufacturing a port for a dependency
   * with one in-process implementation is what ADR 0016 forbids.
   */
  readonly authoring: SpaceAuthoring;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
}

const NONE: ContinuationState = { pending: null };

/**
 * Whether an unresolvable target is still on its way, or gone for good.
 *
 * The **wait policy**, and it lives here rather than in a comment beside one
 * adapter's early return, which is where it was.
 *
 * A canvas subject stays owed. A continuation is published synchronously with
 * the Edit that produced it, and the projection carrying that Edit's result
 * arrives a strategy later — so a Card just created, just added to the Layout
 * or an Edge just reconnected resolves to nothing *yet*, and spending it on
 * the canvas fallback lands focus anywhere but the thing the author made.
 * A chrome target and the canvas itself fall through: both are drawn already,
 * so unresolvable means gone, and a wait with no end is worse than a fallback.
 *
 * **Every card target waits**, not only `reveal` and `rename`. Add to Layout
 * is a `focus` whose target arrives a projection later exactly as a creation
 * does — it is why the mechanism this replaces polled the live projection —
 * and keying the wait on `then` would drop it. The two card targets that name
 * something already drawn (a cancelled Edge draft's anchor, a deleted Edge's
 * source) resolve on the first render either way, so waiting costs them
 * nothing; a card that never arrives stays owed until the next request
 * replaces it or an invalidation discards it.
 */
export const staysOwed = ({ target }: PendingContinuation): boolean =>
  target.kind === 'card' || target.kind === 'edge';

export function createContinuation({
  authoring,
  reportObserverError = (error) => console.error('Continuation observer failed', error),
}: ContinuationDependencies): Continuation {
  const observable: ObservableState<ContinuationState> = createObservableState(
    NONE,
    reportObserverError,
  );

  const discard = (): void => {
    if (observable.getState().pending !== null) observable.publish(NONE);
  };

  // Invalidated on two facts and deliberately not on four. A replacement
  // discards every open Interaction draft (ADR 0042), and presenting draws over
  // the surfaces a continuation would land on — spending onto a Sidebar row
  // underneath a live presentation is wrong. **Not** the selected Layout and
  // **not** the Active Graph, which the chrome title draft invalidates on:
  // over-invalidating silently loses a legitimate continuation, and a target in
  // a Layout no longer drawn simply fails to resolve, which the wait policy
  // above already answers.
  let replacementEpoch = authoring.getState().replacementEpoch;
  let presenting = authoring.getState().navigation.mode === 'presenting';
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const state = authoring.getState();
    const nowPresenting = state.navigation.mode === 'presenting';
    const invalidated =
      state.replacementEpoch !== replacementEpoch || (nowPresenting && !presenting);
    replacementEpoch = state.replacementEpoch;
    presenting = nowPresenting;
    if (invalidated) discard();
  });

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    request: (continuation) => observable.publish({ pending: continuation }),
    take: discard,
    dispose: () => {
      unsubscribeAuthoring();
      observable.clearSubscribers();
    },
  };
}
