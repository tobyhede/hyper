import type { CardId, GraphEdge, GraphId, LayoutPosition } from '@project/core';
import {
  createObservableState,
  type ObserverErrorReporter,
  type ObservableState,
} from '@project/persistence';
import type { CardFlowNode } from '@project/react-flow-adapter';
import { CARD_SIZE } from './card';
import type { ConnectionCompletion } from './connection-completion';
import type { CanvasSelection, RenderAdapter } from './render-adapter';
import { sameSelection } from './render-adapter';
import type { RendererSelection } from './renderer';
import type {
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
 * What a connection drag currently points at.
 *
 * Two sources answer this and neither is sufficient alone. React Flow resolves
 * `toNode` through `getClosestHandle`, by distance from the pointer to a handle
 * within `connectionRadius` — 20 in the pinned 12.11.2 — so it is non-null over
 * blank canvas near a handle, and **null over the middle of a Card**, whose
 * centre is some 73px from the nearest handle at 260x146. The DOM answers the
 * rest, from the element under the pointer. Drop the DOM half and an Alt-release
 * onto a Card's body authors a Card on top of it; drop React Flow's half and a
 * release just outside a Card authors one where the author was aiming at a
 * handle. A connection target in range therefore outranks what lies underneath,
 * and both suppliers apply that precedence before asking.
 *
 * `card` and `off-canvas` are refused for the same reason today and are still
 * two values, because this is a fact a supplier reports rather than a verdict it
 * reaches. Collapsing them would name an input after the answer it produces.
 */
export type DropTarget = 'connection-target' | 'card' | 'empty-canvas' | 'off-canvas';

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
 * Four kinds, mutually exclusive by type: starting one cancels whatever was
 * there. A connect draft names the Card an Edge would leave; a reconnect draft
 * names the Edge whose endpoint is being moved. The pointer and keyboard
 * variants are distinct because only the pointer ones are bounded by a drag —
 * a keyboard draft outlives every event until the author settles or cancels it.
 */
export type EdgeDraft =
  | { readonly kind: 'pointer-connect'; readonly from: CardId }
  | { readonly kind: 'keyboard-connect'; readonly from: CardId }
  | {
      readonly kind: 'pointer-reconnect';
      readonly graphId: GraphId;
      readonly edge: GraphEdge;
      readonly endpoint: EdgeEndpoint;
    }
  /** The Edge popover: both endpoints are editable while it stands. */
  | { readonly kind: 'keyboard-reconnect'; readonly graphId: GraphId; readonly edge: GraphEdge };

/** Where focus goes once the projection carrying a completed Edit has rendered. */
export type FocusRequest =
  { readonly kind: 'card'; readonly cardId: CardId } | { readonly kind: 'canvas' };

export interface EdgeAuthoringState {
  readonly draft: EdgeDraft | null;
  /**
   * The reason the current draft was refused, retained until the author changes
   * the proposal or cancels. A refusal is not a cancellation: the draft and its
   * message stand together so the author can correct what they aimed at.
   */
  readonly refusal: string | null;
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
  /** End the pointer drag, whatever it produced, and hand back what to continue at. */
  readonly endPointerConnect: () => CardId | null;

  readonly beginKeyboardConnect: (from: CardId) => void;
  readonly beginPointerReconnect: (
    graphId: GraphId,
    edge: GraphEdge,
    endpoint: EdgeEndpoint,
  ) => void;
  readonly openEdgeEditor: (graphId: GraphId, edge: GraphEdge) => void;
  /** Move one endpoint of the drafted Edge to a Card. */
  readonly reconnect: (endpoint: EdgeEndpoint, cardId: CardId) => boolean;
  readonly deleteEdge: (graphId: GraphId, edge: GraphEdge) => boolean;
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
  readonly reportObserverError?: ObserverErrorReporter;
}

const IDLE: EdgeAuthoringState = { draft: null, refusal: null, focusRequest: null };

/**
 * The Card a draft is anchored at, if the draft has one.
 *
 * A connect draft's source, and a reconnect draft's *unmoved* endpoint: both are
 * where the author was, and both are where focus returns after a cancellation.
 */
const anchorCardOf = (draft: EdgeDraft): CardId => {
  if (draft.kind === 'pointer-connect' || draft.kind === 'keyboard-connect') return draft.from;
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
const sameRenderer = (left: RendererSelection, right: RendererSelection): boolean =>
  left.kind === 'view'
    ? right.kind === 'view' && left.view === right.view
    : right.kind === 'layout' && left.layoutId === right.layoutId;

/** Whether a canvas selection names the thing this draft is about. */
const selectionMatchesDraft = (selection: CanvasSelection, draft: EdgeDraft): boolean => {
  if (draft.kind === 'pointer-connect' || draft.kind === 'keyboard-connect') {
    // A pointer connect deliberately survives an empty selection: React Flow
    // clears the Card as the drag begins, and cancelling there would end the
    // gesture on its first frame.
    return selection.kind !== 'card' || selection.cardId === draft.from;
  }
  return (
    selection.kind !== 'edge' ||
    sameSelection(selection, { kind: 'edge', graphId: draft.graphId, edge: draft.edge })
  );
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
    if (draft.kind === 'pointer-connect' || draft.kind === 'keyboard-connect') {
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

  /** The Edge a reconnect draft is about, whichever kind of reconnect it is. */
  const draftedEdge = (): {
    readonly graphId: GraphId;
    readonly edge: GraphEdge;
  } | null => {
    const { draft } = observable.getState();
    if (draft === null) return null;
    if (draft.kind === 'pointer-reconnect' || draft.kind === 'keyboard-reconnect') {
      return { graphId: draft.graphId, edge: draft.edge };
    }
    return null;
  };

  /**
   * Complete one Edit that carries no rendered Placement, keeping the draft when
   * it is refused so the author can correct the proposal rather than restart it.
   */
  const completeStructural = (completion: Parameters<SpaceAuthoring['complete']>[0]): boolean => {
    const result = authoring.complete(completion);
    if (result.kind === 'refused') {
      publish({ refusal: result.reason });
      return false;
    }
    // `unchanged` is the author's ordinary close — an endpoint dragged back where
    // it started — and settles the draft exactly as a completion does.
    clearDraft();
    return result.kind !== 'queued';
  };

  /** The Card a finished pointer connection continues at, held across the drag's end. */
  let pendingContinuation: CardId | null = null;

  const requestFocus = (focusRequest: FocusRequest): void => publish({ focusRequest });

  // Invalidation. The draft is cancelled by anything that changes what it is
  // about, and by nothing else — an unrelated completed Edit leaves it standing.
  let replacementEpoch = authoring.getState().replacementEpoch;
  let selectedRenderer = authoring.getState().navigation.selectedRenderer;
  let activeGraphId = authoring.getState().navigation.activeGraphId;
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const state = authoring.getState();
    const contextChanged =
      state.replacementEpoch !== replacementEpoch ||
      !sameRenderer(state.navigation.selectedRenderer, selectedRenderer) ||
      state.navigation.activeGraphId !== activeGraphId;
    replacementEpoch = state.replacementEpoch;
    selectedRenderer = state.navigation.selectedRenderer;
    activeGraphId = state.navigation.activeGraphId;
    const { draft } = observable.getState();
    if (draft === null) return;
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
    const { draft } = observable.getState();
    if (draft !== null && !selectionMatchesDraft(selection, draft)) clearDraft();
  });

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    eligibility,
    accepts,

    beginPointerConnect: (from) => begin({ kind: 'pointer-connect', from }),

    connect: (from, to, projected) => {
      const completed = connections.connect(from, to, projected);
      if (completed === null) {
        const refusal = eligibility({ kind: 'connect', from, to });
        publish({ refusal: refusal.kind === 'refused' ? refusal.reason : null });
        return null;
      }
      pendingContinuation = completed;
      return completed;
    },

    createConnectedCard: (from, position, projected) => {
      const created = connections.createAndConnect(from, position, projected);
      if (created !== null) pendingContinuation = created;
      return created;
    },

    endPointerConnect: () => {
      const continuation = pendingContinuation;
      pendingContinuation = null;
      const { draft } = observable.getState();
      // A pointer draft is bounded by its drag. A refusal the release produced
      // survives it — there is no surface left to correct, and the sentence is
      // the whole of what the author is told.
      if (draft?.kind === 'pointer-connect') publish({ draft: null });
      return continuation;
    },

    beginKeyboardConnect: (from) => begin({ kind: 'keyboard-connect', from }),

    beginPointerReconnect: (graphId, edge, endpoint) =>
      begin({ kind: 'pointer-reconnect', graphId, edge, endpoint }),

    openEdgeEditor: (graphId, edge) => begin({ kind: 'keyboard-reconnect', graphId, edge }),

    reconnect: (endpoint, cardId) => {
      const drafted = draftedEdge();
      if (drafted === null) return false;
      return completeStructural({
        kind: 'reconnected-edge',
        graphId: drafted.graphId,
        edge: drafted.edge,
        endpoint,
        cardId,
      });
    },

    deleteEdge: (graphId, edge) => {
      const deleted = completeStructural({ kind: 'deleted-edge', graphId, edge });
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
      observable.clearSubscribers();
    },
  };
}
