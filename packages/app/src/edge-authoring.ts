import type { CardId, LayoutPosition } from '@project/core';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type ObservableState,
} from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { CARD_SIZE } from './card';
import type { ConnectionCompletion, ConnectionResult } from './connection-completion';
import type { CanvasSelection, EdgeSubject, RenderAdapter } from './render-adapter';
import { sameEdgeSubject, sameSelection } from './render-adapter';
import type { CanvasRendererId } from './renderer';
import type {
  AuthoringRefusal,
  EdgeEligibility,
  EdgeEndpoint,
  EdgeProposal,
  SpaceAuthoring,
} from './space-authoring';

/**
 * Edge Authoring: the whole Edge interaction lifecycle, in one module.
 *
 * It translates pointer, key and React Flow events into domain proposals, asks
 * Space Authoring whether each may be offered, and asks it again to author the
 * Edit. It owns no Graph rule and no second Edge collection — the render
 * adapter stays authoritative for the projection and the canvas selection, and
 * Space Authoring stays authoritative for eligibility and every semantic Edit.
 *
 * What it does own is the **one** current interaction draft, the refusal that
 * draft ran into, and where focus should go when a completed projection removes
 * the element that held it.
 */

/**
 * What the DOM says lies under the pointer — the half of a drop target React
 * Flow does not answer.
 *
 * `connection-target` is deliberately absent. That is React Flow's answer,
 * resolved from handle distance, and no hit-test of the element underneath can
 * reach it. Declaring the DOM half over three values rather than four is what
 * stops a supplier handing on an answer it could not have produced.
 *
 * `card` and `off-canvas` are refused for the same reason today and are still
 * two values, because this is a fact a supplier reports rather than a verdict it
 * reaches. Collapsing them would name an input after the answer it produces.
 */
export type ElementDropTarget = 'card' | 'empty-canvas' | 'off-canvas';

/**
 * What a connection drag currently points at.
 *
 * Two sources answer this and neither is sufficient alone. React Flow resolves
 * `toNode` through `getClosestHandle`, by distance from the pointer to a handle
 * within `connectionRadius` — 20 in the pinned 12.11.2 — so it is non-null over
 * blank canvas near a handle, and **null over the middle of a Card**, whose
 * centre is some 73px from the nearest handle at 260x146. The DOM answers the
 * rest, from the element under the pointer — an `ElementDropTarget`. Drop the
 * DOM half and an Alt-release onto a Card's body authors a Card on top of it;
 * drop React Flow's half and a release just outside a Card authors one where the
 * author was aiming at a handle. A connection target in range therefore outranks
 * what lies underneath, which is what `dropTarget` below composes.
 */
export type DropTarget = 'connection-target' | ElementDropTarget;

/**
 * The one drop target, from the two sources that each answer half of it.
 *
 * `connectionTarget` is React Flow's answer — `toNode !== null`, resolved by
 * `getClosestHandle` from handle distance — and `element` is the DOM's. A
 * connection target in range outranks what lies underneath, for the reasons
 * `DropTarget` above states.
 *
 * **Every supplier asks this, including the reconnect release**, which composes
 * the same two answers and then asks a *different* question of the result:
 * whether to delete the Edge rather than whether to author a Card. That site is
 * why the rule is a function and not a paragraph — it is the one nobody greps
 * when changing how drops are classified.
 *
 * **What each supplier hands in is its own, deliberately.** The preview reads
 * the last classification the flow container's `onMouseMove` wrote; the release
 * hit-tests the DOM at the moment it happens. Closing that gap would add a
 * document-level pointer listener and a per-frame hit-test, defeating the
 * narrowed non-positional state write that avoids per-frame flow rerenders. The
 * difference belongs in the argument, not in here
 * (`.scratch/card-route-editing/edge-authoring-design.md`).
 *
 * An object argument rather than two positional ones: `dropTarget(true, 'card')`
 * gives a reader no way to tell which source is which, and the site this exists
 * for is one nobody reads twice.
 */
export function dropTarget(over: {
  readonly connectionTarget: boolean;
  readonly element: ElementDropTarget;
}): DropTarget {
  return over.connectionTarget ? 'connection-target' : over.element;
}

/**
 * An unfinished connection drag — as much of one as deciding an empty-drop needs.
 *
 * `sourceId` and `point` exist only under `dragging`, so a gesture naming a
 * source while idle is unrepresentable rather than rejected on a branch. The id
 * is a plain string because that is what React Flow knows a node by; the uuid
 * parse belongs where a Card identity is actually needed.
 */
export type ConnectionGesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      readonly sourceId: string;
      /** Flow space. Both suppliers convert before handing it over. */
      readonly point: LayoutPosition;
      readonly over: DropTarget;
      /** Alt/Option, tracked on `window` so it survives leaving the canvas. */
      readonly modifierHeld: boolean;
    };

/** The Card an empty-drop would author: its source, and its top-left. */
export interface NewCardDrop {
  readonly sourceId: string;
  readonly position: LayoutPosition;
}

/**
 * The Card this gesture would author, or `null` for one that authors none.
 *
 * **The preview and the release ask this with different DOM facts, and that is
 * deliberate.** Four of the five inputs come from sources that track the
 * pointer across the whole document: React Flow's own connection state, and a
 * `window` key listener. `over` does not. The release hit-tests the DOM at the
 * moment it happens, while the preview reads state last written by the flow
 * container's `onMouseMove`, which stops firing the moment the pointer leaves
 * it. Drag out over the toolbar with the modifier held and the preview's fact
 * freezes, so the ghost goes on tracking — clipped by the container's own
 * `overflow: hidden` — while the release correctly refuses.
 *
 * Closing that gap means giving the preview the same live source: a
 * document-level pointer listener running `elementFromPoint` per frame, against
 * a handler narrowed to one non-positional value precisely to stop per-frame
 * re-renders of the whole flow. Package 7 does not add it without measuring
 * that cost. So what this guarantees is narrower than it first looks: the same
 * facts yield the same answer, not that the preview and the release always
 * agree.
 *
 * `accepts` is a parameter rather than a sixth field because it is a capability
 * and not a fact, which keeps `ConnectionGesture` plain data a table test can
 * write as a literal. The position returned is the Card's top-left, centred on
 * the drop point, so the ghost and the authored Card cannot land in different
 * places.
 */
export function newCardDrop(
  gesture: ConnectionGesture,
  accepts: (from: string) => boolean,
): NewCardDrop | null {
  if (gesture.kind !== 'dragging') return null;
  if (gesture.over !== 'empty-canvas') return null;
  if (!gesture.modifierHeld) return null;
  if (!accepts(gesture.sourceId)) return null;
  return {
    sourceId: gesture.sourceId,
    position: {
      x: gesture.point.x - CARD_SIZE.width / 2,
      y: gesture.point.y - CARD_SIZE.height / 2,
    },
  };
}

/**
 * The one Edge interaction in progress.
 *
 * Three kinds, mutually exclusive by type: starting one cancels whatever was
 * there. A connect draft names the Card an Edge would leave; a reconnect draft
 * names the Edge whose endpoint is being moved. The selected Edge's endpoint
 * editor outlives browser events until the author settles or cancels it.
 */
export type EdgeDraft =
  | { readonly kind: 'pointer-connect'; readonly from: CardId }
  | ({ readonly kind: 'pointer-reconnect'; readonly endpoint: EdgeEndpoint } & EdgeSubject)
  /** The Edge popover: both endpoints are editable while it stands. */
  | ({ readonly kind: 'keyboard-reconnect' } & EdgeSubject);

/**
 * A refused Edge interaction: the domain's own identity, and the context that
 * says which surface has to show it.
 *
 * ADR 0057 gives every expected refusal a stable identity and leaves the
 * sentence, the field and the channel to the application surface conducting the
 * interaction. This module conducts none of them — it translates events — so
 * what it retains is the `AuthoringRefusal` untouched plus the least context a
 * surface needs to recognise its own: **which interaction was refused**, and for
 * a reconnection **which endpoint was attempted**, because only that endpoint's
 * Field may be marked invalid.
 *
 * Three kinds, one per presentation channel:
 *
 * - `reconnection` — the open endpoint editor, which owns From and To;
 * - `deletion` — the selected Edge's own controls, which own no field at all;
 * - `gesture` — a completed pointer drag, whose initiating surface has gone, so
 *   the canvas announcement is the only place left to say it.
 *
 * Nothing else belongs here. No React id, no copy and no derived error bag: a
 * second presentation state stored beside the domain one is the thing that goes
 * stale, and the adapters in `authoring-refusal.ts` derive both from this on
 * every render instead.
 */
export type EdgeRefusal =
  | {
      readonly kind: 'reconnection';
      readonly endpoint: EdgeEndpoint;
      readonly refusal: AuthoringRefusal;
    }
  | { readonly kind: 'deletion'; readonly refusal: AuthoringRefusal }
  | { readonly kind: 'gesture'; readonly refusal: AuthoringRefusal };

/**
 * The two channels the **selected Edge's own controls** own, and the narrowing.
 *
 * Beside the union rather than beside the component that consumes it: which of
 * the three channels a surface owns is a fact about the channels, and
 * `AuthorableEdge` had a hand-inlined copy of these two `kind`s in a file with
 * no other reason to know them. The canvas announcement belongs elsewhere, and
 * narrowing here is what stops a sentence from an unrelated gesture appearing
 * under whichever Edge happens to be selected.
 */
export type SelectedEdgeRefusal = Extract<
  EdgeRefusal,
  { readonly kind: 'reconnection' } | { readonly kind: 'deletion' }
>;

export const selectedEdgeRefusalOf = (refusal: EdgeRefusal | null): SelectedEdgeRefusal | null =>
  refusal?.kind === 'reconnection' || refusal?.kind === 'deletion' ? refusal : null;

/**
 * Where focus goes once the projection carrying a completed Edit has rendered.
 *
 * The Edge is named by subject rather than by React Flow's edge id, like every
 * other Edge reference here — the React layer resolves it against the projection
 * it is about to draw, which is the only place that mapping exists.
 */
export type FocusRequest =
  | { readonly kind: 'card'; readonly cardId: CardId }
  | ({ readonly kind: 'edge' } & EdgeSubject)
  | { readonly kind: 'canvas' };

export interface EdgeAuthoringState {
  readonly draft: EdgeDraft | null;
  /**
   * The refusal the current draft ran into, retained until the author changes
   * the proposal or cancels. A refusal is not a cancellation: the draft and its
   * refusal stand together so the author can correct what they aimed at.
   */
  readonly refusal: EdgeRefusal | null;
  /**
   * A focus move Hyper owes the author, consumed once by the React layer.
   *
   * React Flow supplies focus for everything it draws; this covers only the case
   * it cannot — the completed projection removed the element that had focus, so
   * there is nothing left to restore it to.
   */
  readonly focusRequest: FocusRequest | null;
}

export interface EdgeAuthoring {
  readonly getState: () => EdgeAuthoringState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Space Authoring's eligibility answer, in the surface's terms. */
  readonly eligibility: (proposal: EdgeProposal) => EdgeEligibility;
  /** Whether a proposal may be offered — React Flow's `isValidConnection` shape. */
  readonly accepts: (proposal: EdgeProposal) => boolean;

  readonly beginPointerConnect: (from: CardId) => void;
  /** One completed React Flow connection. Answers the Card to continue at. */
  readonly connect: (
    from: CardId,
    to: CardId,
    projected: readonly CardFlowNode[] | null,
  ) => CardId | null;
  /** An Option/Alt empty drop: author the Card and the Edge that reaches it. */
  readonly createConnectedCard: (
    from: CardId,
    position: LayoutPosition,
    projected: readonly CardFlowNode[] | null,
  ) => CardId | null;
  /**
   * End whichever pointer drag was in flight, and hand back the Card to continue
   * at — the target of a completed connection, or `null` for anything else.
   *
   * One operation for both pointer drafts because a drag ends the same way
   * whatever it was doing: **the draft goes and the refusal stays.** A refusal
   * normally retains its draft so the author can correct the proposal, but a
   * finished drag leaves no surface to correct — the sentence is the whole of
   * what they are told, and cancelling would take it away with the draft.
   */
  readonly endPointerDrag: () => CardId | null;

  readonly beginPointerReconnect: (subject: EdgeSubject, endpoint: EdgeEndpoint) => void;
  readonly openEdgeEditor: (subject: EdgeSubject) => void;
  /** Move one endpoint of the drafted Edge to a Card. */
  readonly reconnect: (endpoint: EdgeEndpoint, cardId: CardId) => boolean;
  readonly deleteEdge: (subject: EdgeSubject) => boolean;
  /** Cancel the topmost Edge surface, producing no Edit. */
  readonly cancelDraft: () => void;
  /** Take the pending focus move, leaving none behind. */
  readonly takeFocusRequest: () => FocusRequest | null;
  readonly dispose: () => void;
}

export interface EdgeAuthoringDependencies {
  readonly authoring: SpaceAuthoring;
  readonly adapter: RenderAdapter;
  readonly connections: ConnectionCompletion;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
}

const IDLE: EdgeAuthoringState = { draft: null, refusal: null, focusRequest: null };

/** The channel a finished pointer gesture leaves its refusal on. */
const gestureRefusal = (refusal: AuthoringRefusal): EdgeRefusal => ({ kind: 'gesture', refusal });

/**
 * The Card a draft is anchored at, if the draft has one.
 *
 * A connect draft's source, and a reconnect draft's *unmoved* endpoint: both are
 * where the author was, and both are where focus returns after a cancellation.
 */
const anchorCardOf = (draft: EdgeDraft): CardId => {
  if (draft.kind === 'pointer-connect') return draft.from;
  if (draft.kind === 'keyboard-reconnect') return draft.edge.from;
  return draft.endpoint === 'from' ? draft.edge.to : draft.edge.from;
};

/**
 * Whether two renderer selections name the same renderer — by value, not by
 * identity.
 *
 * Every completed Edit republishes its selection as a fresh object, so an
 * identity comparison reads "the renderer changed" after an Edit that plainly
 * stayed in the same Layout, and cancels a draft that had nothing to do with it.
 */
const sameRenderer = (left: CanvasRendererId, right: CanvasRendererId): boolean => left === right;

/** Whether a canvas selection names the thing this draft is about. */
const selectionMatchesDraft = (selection: CanvasSelection, draft: EdgeDraft): boolean => {
  if (draft.kind === 'pointer-connect') {
    // A pointer connect deliberately survives an empty selection: React Flow
    // clears the Card as the drag begins, and cancelling there would end the
    // gesture on its first frame.
    return selection.kind !== 'card' || selection.cardId === draft.from;
  }
  return selection.kind !== 'edge' || sameEdgeSubject(selection, draft);
};

export function createEdgeAuthoring({
  authoring,
  adapter,
  connections,
  reportObserverError = (error) => console.error('EdgeAuthoring observer failed', error),
}: EdgeAuthoringDependencies): EdgeAuthoring {
  const observable: ObservableState<EdgeAuthoringState> = createObservableState(
    IDLE,
    reportObserverError,
  );
  // Invariant violations use the same configured sink, made incapable of
  // interrupting the interaction they describe.
  const safelyReport = createNonThrowingReporter(reportObserverError);

  const publish = (next: Partial<EdgeAuthoringState>): void => {
    observable.publish({ ...observable.getState(), ...next });
  };

  /** Start a draft, cancelling whatever was there and clearing its refusal. */
  const begin = (draft: EdgeDraft): void => publish({ draft, refusal: null });

  const clearDraft = (): void => publish({ draft: null, refusal: null });

  const eligibility = (proposal: EdgeProposal) => authoring.edgeEligibility(proposal);
  const accepts = (proposal: EdgeProposal): boolean => eligibility(proposal).kind === 'eligible';

  /**
   * Whether the thing a draft is about still exists and can still be authored.
   *
   * Asked through the eligibility query rather than by reading the Space: the
   * *identity* proposal — reconnecting an endpoint to the Card it already names
   * — is eligible exactly when the Graph is still one this Layout owns and still
   * holds the Edge, which is the whole of what "the subject survives" means. A
   * connect draft asks the empty-drop proposal for the same reason: it is the
   * question "may this Card still be an Edge's source here", with no target to
   * confuse it.
   */
  const subjectSurvives = (draft: EdgeDraft): boolean => {
    if (draft.kind === 'pointer-connect') {
      return accepts({ kind: 'create-and-connect', from: draft.from });
    }
    return accepts({
      kind: 'reconnect',
      graphId: draft.graphId,
      edge: draft.edge,
      endpoint: 'to',
      cardId: draft.edge.to,
    });
  };

  /**
   * The reconnect draft in flight, whichever kind of reconnect it is.
   *
   * The draft rather than the Edge alone: which surface owns a refusal depends
   * on *how* the reconnection was drafted, and re-reading the state a second
   * time to find that out is a second answer to the same question.
   */
  type ReconnectDraft = Extract<
    EdgeDraft,
    { readonly kind: 'pointer-reconnect' } | { readonly kind: 'keyboard-reconnect' }
  >;

  const reconnectDraft = (): ReconnectDraft | null => {
    const { draft } = observable.getState();
    if (draft === null) return null;
    return draft.kind === 'pointer-reconnect' || draft.kind === 'keyboard-reconnect' ? draft : null;
  };

  /**
   * Complete one Edit that carries no rendered Placement, keeping the draft when
   * it is refused so the author can correct the proposal rather than restart it.
   *
   * `queued` is an invariant violation here, exactly as it is for the two
   * connecting gestures: it is Authoring's answer to a completion made from
   * inside its own publication, and every caller of this reaches it from a
   * browser event with no Edit on the stack. Reported rather than thrown — a
   * diagnostic must not take the canvas down under the author's hand.
   *
   * The draft is left standing, and that is the *cautious* half rather than the
   * obviously right one: a queued Edit is drained and usually lands, so the
   * draft may outlive its own subject by a moment. It is left because the
   * alternative settles a surface for an Edit that can still be refused when
   * the drain reaches it, and because the invalidation pass cancels the draft
   * the instant its subject really goes.
   */
  const completeStructural = (
    completion: Parameters<SpaceAuthoring['complete']>[0],
    channel: (refusal: AuthoringRefusal) => EdgeRefusal,
  ): boolean => {
    const result = authoring.complete(completion);
    if (result.kind === 'refused') {
      publish({ refusal: channel(result.refusal) });
      return false;
    }
    if (result.kind === 'queued') {
      safelyReport(
        new Error(
          `A ${completion.kind} completion was queued behind another Edit. React Flow events cannot be re-entrant.`,
        ),
      );
      return false;
    }
    // `unchanged` is the author's ordinary close — an endpoint dragged back where
    // it started — and settles the draft exactly as a completion does.
    clearDraft();
    return true;
  };

  /** The Card a finished pointer connection continues at, held across the drag's end. */
  let pendingContinuation: CardId | null = null;

  /**
   * Take what a connection attempt came to, and say what the author sees.
   *
   * The three outcomes are not interchangeable. A **refusal** is retained on the
   * channel the caller names; a **completion** clears whatever refusal was
   * there, because a refusal describes the proposal that produced it and this
   * one has landed; and **unavailable** — no Cards on the canvas yet, or an invariant
   * already reported — says nothing either way, so a refusal already on screen
   * stands.
   */
  const settleConnection = (
    result: ConnectionResult,
    channel: (refusal: AuthoringRefusal) => EdgeRefusal,
  ): CardId | null => {
    if (result.kind === 'refused') {
      publish({ refusal: channel(result.refusal) });
      return null;
    }
    if (result.kind !== 'completed') return null;
    publish({ refusal: null });
    return result.cardId;
  };

  /**
   * Hold the Card a pointer connection continues at until its drag ends.
   */
  const holdForDrag = (cardId: CardId | null): CardId | null => {
    if (cardId !== null) pendingContinuation = cardId;
    return cardId;
  };

  const requestFocus = (focusRequest: FocusRequest): void => publish({ focusRequest });

  // Invalidation. The draft is cancelled by anything that changes what it is
  // about, and by nothing else — an unrelated completed Edit leaves it standing.
  let replacementEpoch = authoring.getState().replacementEpoch;
  let selectedRenderer = authoring.getState().navigation.selectedRenderer;
  let activeGraphId = authoring.getState().navigation.activeGraphId;
  let presenting = authoring.getState().navigation.mode === 'presenting';
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const state = authoring.getState();
    const nowPresenting = state.navigation.mode === 'presenting';
    const contextChanged =
      state.replacementEpoch !== replacementEpoch ||
      !sameRenderer(state.navigation.selectedRenderer, selectedRenderer) ||
      state.navigation.activeGraphId !== activeGraphId ||
      // Presenting withdraws Edge authoring altogether, so a draft made before
      // it has no context left to complete in. Cancelled rather than merely
      // hidden: a picker left standing goes on authoring over the presentation,
      // and an Edge editor behind it reopens when the author returns.
      (nowPresenting && !presenting);
    replacementEpoch = state.replacementEpoch;
    selectedRenderer = state.navigation.selectedRenderer;
    activeGraphId = state.navigation.activeGraphId;
    presenting = nowPresenting;
    const { draft, refusal } = observable.getState();
    // **The refusal is invalidated even when no draft is left to carry it.** It
    // names Cards and a Graph of the Space it was made against, and a *pointer*
    // gesture's refusal outlives its own draft by design — so without this a
    // sentence about the replaced Space survives an accepted replacement, which
    // the handoff's shared case 7 forbids outright ("cancels all target-bound
    // transients"), and one about another Graph survives activating it.
    if (draft === null) {
      if (contextChanged && refusal !== null) publish({ refusal: null });
      return;
    }
    if (contextChanged || !subjectSurvives(draft)) {
      // The element the draft was about may have been what held focus, so the
      // author is left somewhere real rather than on `body`.
      publish({ draft: null, refusal: null, focusRequest: { kind: 'canvas' } });
    }
  });

  let selection = adapter.getState().selection;
  const unsubscribeAdapter = adapter.subscribe((state) => {
    if (sameSelection(state.selection, selection)) return;
    selection = state.selection;
    const { draft, refusal } = observable.getState();
    if (draft !== null) {
      if (!selectionMatchesDraft(selection, draft)) clearDraft();
      return;
    }
    // **A refused Delete leaves no draft, and it is about the Edge that was
    // selected when it was made.** Its channel is the selected Edge's own
    // controls, which are drawn from the *current* selection — so moving the
    // selection would put a sentence about the previous Edge under the new one.
    // The other channels do not need this: a refused connection or reconnection
    // retains the draft that ran into it, and the branch above cancels both.
    if (refusal?.kind === 'deletion') publish({ refusal: null });
  });

  /**
   * Drop a selected Edge the Active Graph has left behind.
   *
   * CONTEXT.md's **Selected Edge**: an Edge outside the Active Graph "cannot
   * remain selected". Activating another Graph is not an Edit and moves no
   * Edge, so the stored subject is simply no longer one an authoring gesture may
   * act on — and `SelectedEdgeControls` reads the selection, so leaving it would
   * keep Delete live on an Edge the canvas has stopped offering.
   *
   * Registered as a second subscriber rather than folded into the draft pass
   * above, because it answers a different question: that one asks whether the
   * *interaction* still has a subject, this asks whether the *selection* does.
   */
  const unsubscribeSelection = authoring.subscribe(() => {
    const current = adapter.getState().selection;
    if (current.kind !== 'edge') return;
    const active = authoring.getState().navigation.activeGraphId;
    if (current.graphId !== active) adapter.getState().clearSelection();
  });

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    eligibility,
    accepts,

    beginPointerConnect: (from) => begin({ kind: 'pointer-connect', from }),

    // Both pointer completions land on the **canvas announcement** channel, and
    // that is a fact about when they are asked rather than a default. React Flow
    // reports a connection on release, and `endPointerDrag` takes the draft away
    // in the same turn — so by the time anything renders the refusal there is no
    // handle, no ghost and no picker left to attach it to.
    connect: (from, to, projected) =>
      holdForDrag(settleConnection(connections.connect(from, to, projected), gestureRefusal)),

    createConnectedCard: (from, position, projected) =>
      holdForDrag(
        settleConnection(connections.createAndConnect(from, position, projected), gestureRefusal),
      ),

    endPointerDrag: () => {
      const continuation = pendingContinuation;
      pendingContinuation = null;
      const { draft } = observable.getState();
      if (draft?.kind === 'pointer-connect' || draft?.kind === 'pointer-reconnect') {
        publish({ draft: null });
      }
      return continuation;
    },

    // Destructured rather than spread: the caller usually holds an
    // `EdgeSelection`, whose own `kind` would overwrite the draft's.
    beginPointerReconnect: ({ graphId, edge }, endpoint) =>
      begin({ kind: 'pointer-reconnect', graphId, edge, endpoint }),

    openEdgeEditor: ({ graphId, edge }) => begin({ kind: 'keyboard-reconnect', graphId, edge }),

    reconnect: (endpoint, cardId) => {
      const drafted = reconnectDraft();
      if (drafted === null) return false;
      // **Which surface owns the refusal is the draft's kind, not the Edit's.**
      // The endpoint editor stands through its own completion and can mark the
      // attempted Field invalid; a pointer drag has already ended, so its
      // refusal has nowhere to go but the canvas announcement.
      const settled = completeStructural(
        {
          kind: 'reconnected-edge',
          graphId: drafted.graphId,
          edge: drafted.edge,
          endpoint,
          cardId,
        },
        drafted.kind === 'keyboard-reconnect'
          ? (refusal) => ({ kind: 'reconnection', endpoint, refusal })
          : gestureRefusal,
      );
      if (!settled) return false;
      // **The author stays on the Edge they edited**, which is the matrix's
      // focus for a completed Reconnect and needs saying because nothing else
      // supplies it: the selection names the Edge by value, so a moved endpoint
      // leaves it naming an Edge the Space no longer holds — the reconnected one
      // draws unselected, and the popover that held focus unmounts with it,
      // dropping focus on `body`.
      //
      // An endpoint returned to where it started edited nothing, and `unchanged`
      // is indistinguishable from a completion here; the subject it names is the
      // one already selected, so re-installing it is a no-op rather than a case
      // to branch on.
      const reconnected: EdgeSubject = {
        graphId: drafted.graphId,
        edge:
          endpoint === 'from'
            ? { from: cardId, to: drafted.edge.to }
            : { from: drafted.edge.from, to: cardId },
      };
      adapter.getState().selectEdge(reconnected);
      requestFocus({ kind: 'edge', ...reconnected });
      return true;
    },

    deleteEdge: ({ graphId, edge }) => {
      // A refused Delete leaves the Edge selected, so its controls are still on
      // screen and own the sentence. Falling through to the canvas announcement
      // would say it somewhere the author is not looking, over a control that
      // is.
      const deleted = completeStructural({ kind: 'deleted-edge', graphId, edge }, (refusal) => ({
        kind: 'deletion',
        refusal,
      }));
      // The Edge that held focus is about to leave the projection, and React
      // Flow moves focus only for elements it still draws.
      if (deleted) requestFocus({ kind: 'card', cardId: edge.from });
      return deleted;
    },

    cancelDraft: () => {
      const { draft } = observable.getState();
      if (draft === null) return;
      publish({
        draft: null,
        refusal: null,
        focusRequest: { kind: 'card', cardId: anchorCardOf(draft) },
      });
    },

    takeFocusRequest: () => {
      const { focusRequest } = observable.getState();
      if (focusRequest !== null) publish({ focusRequest: null });
      return focusRequest;
    },

    dispose: () => {
      unsubscribeAuthoring();
      unsubscribeAdapter();
      unsubscribeSelection();
      observable.clearSubscribers();
    },
  };
}
