import type { ResourceId, MapPosition, SpaceSnapshot, MapId } from '@project/core';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type ObservableState,
} from '@project/persistence';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import { RESOURCE_SIZE } from './resource';
import type { ConnectionCompletion, ConnectionResult } from './connection-completion';
import type { Continuation, ContinuationTarget } from './continuation';
import type { CanvasSelection, EdgeSubject, RenderAdapter } from './render-adapter';
import { sameEdgeSubject, sameSelection } from './render-adapter';
import type {
  AuthoringRefusal,
  EdgeEligibility,
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
 * `resource` and `off-canvas` are refused for the same reason today and are still
 * two values, because this is a fact a supplier reports rather than a verdict it
 * reaches. Collapsing them would name an input after the answer it produces.
 */
export type ElementDropTarget = 'resource' | 'empty-canvas' | 'off-canvas';

/**
 * What a connection drag currently points at.
 *
 * Two sources answer this and neither is sufficient alone. React Flow resolves
 * `toNode` through `getClosestHandle`, by distance from the pointer to a handle
 * within `connectionRadius` — 20 in the pinned 12.11.2 — so it is non-null over
 * blank canvas near a handle, and **null over the middle of a Resource**, whose
 * centre is some 73px from the nearest handle at 260x146. The DOM answers the
 * rest, from the element under the pointer — an `ElementDropTarget`. Drop the
 * DOM half and an Alt-release onto a Resource's body authors a Resource on top of it;
 * drop React Flow's half and a release just outside a Resource authors one where the
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
 * **Every supplier asks this**, so the precedence is decided once.
 *
 * **What each supplier hands in is its own, deliberately.** The preview reads
 * the last classification the flow container's `onMouseMove` wrote; the release
 * hit-tests the DOM at the moment it happens. Closing that gap would add a
 * document-level pointer listener and a per-frame hit-test, defeating the
 * narrowed non-positional state write that avoids per-frame flow rerenders. The
 * difference belongs in the argument, not in here
 * (`.scratch/card-route-editing/edge-authoring-design.md`).
 *
 * An object argument rather than two positional ones: `dropTarget(true, 'resource')`
 * gives a reader no way to tell which source is which.
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
 * parse belongs where a Resource identity is actually needed.
 */
export type ConnectionGesture =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      readonly sourceId: string;
      /** Canvas coordinates supplied by the active interaction. */
      readonly point: MapPosition;
      readonly over: DropTarget;
      /** Alt/Option, tracked on `window` so it survives leaving the canvas. */
      readonly modifierHeld: boolean;
    };

/** The Resource an empty-drop would author: its source, and its top-left. */
export interface NewResourceDrop {
  readonly sourceId: string;
  readonly position: MapPosition;
}

/**
 * The Resource this gesture would author, or `null` for one that authors none.
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
 * write as a literal. The position returned is the Resource's top-left, centred on
 * the drop point, so the ghost and the authored Resource cannot land in different
 * places.
 */
export function newResourceDrop(
  gesture: ConnectionGesture,
  accepts: (from: string) => boolean,
): NewResourceDrop | null {
  if (gesture.kind !== 'dragging') return null;
  if (gesture.over !== 'empty-canvas') return null;
  if (!gesture.modifierHeld) return null;
  if (!accepts(gesture.sourceId)) return null;
  return {
    sourceId: gesture.sourceId,
    position: {
      x: gesture.point.x - RESOURCE_SIZE.width / 2,
      y: gesture.point.y - RESOURCE_SIZE.height / 2,
    },
  };
}

/** An Edge's other end from the Connect list: a placed Resource, or a new Markdown Resource beside the source. */
export type ConnectTarget =
  | { readonly kind: 'resource'; readonly resourceId: ResourceId }
  | { readonly kind: 'new-resource' };

/** One placed Resource the Connect list offers, with the refusal it would meet. */
export interface ConnectCandidate<R> {
  readonly resource: R;
  /** `null` when an Edge to it may be drawn. */
  readonly refusal: AuthoringRefusal | null;
}

/** Everything the Connect list draws for one source, refusals included. */
export interface ConnectChoices<R> {
  readonly resources: readonly ConnectCandidate<R>[];
  /** The New Resource row's refusal, or `null` when it may be offered. */
  readonly newResource: AuthoringRefusal | null;
}

/**
 * What the Connect list offers from one Resource: the placed Resources bar the
 * source, each asked the pointer gesture's own eligibility so the keyboard is
 * offered exactly what a drag could release on. A refused target is kept with
 * its reason so the author learns why it is unavailable.
 *
 * The source is left out although a self-Edge is legal; the handle drag still
 * draws a loop.
 */
export function connectChoices<R extends { readonly id: ResourceId }>(
  from: ResourceId,
  placed: readonly R[],
  eligibility: (proposal: EdgeProposal) => EdgeEligibility,
): ConnectChoices<R> {
  const refusalOf = (proposal: EdgeProposal): AuthoringRefusal | null => {
    const answer = eligibility(proposal);
    return answer.kind === 'refused' ? answer.refusal : null;
  };
  return {
    resources: placed
      .filter((resource) => resource.id !== from)
      .map((resource) => ({
        resource,
        refusal: refusalOf({ kind: 'connect', from, to: resource.id }),
      })),
    newResource: refusalOf({ kind: 'create-and-connect', from }),
  };
}

/**
 * The one Edge interaction in progress.
 *
 * Mutually exclusive by type: starting one cancels whatever was there. A Title
 * draft outlives browser events until the author completes or cancels it.
 */
export type EdgeDraft =
  | { readonly kind: 'pointer-connect'; readonly from: ResourceId }
  | ({ readonly kind: 'title' } & EdgeSubject);

/**
 * A refused Edge interaction: the domain's own identity, and the context that
 * says which surface has to show it.
 *
 * ADR 0057 gives every expected refusal a stable identity and leaves the
 * sentence and the channel to the application surface conducting the
 * interaction. This module conducts none of them — it translates events — so
 * what it retains is the `AuthoringRefusal` untouched plus the least context a
 * surface needs to recognise its own. One kind per presentation channel:
 *
 * - `command` — an Edge toolbar command, drawn in that Edge's toolbar only.
 * - `gesture` — a completed pointer drag, whose initiating surface has gone, so
 *   the canvas announcement is the only place left to say it.
 *
 * Nothing else belongs here. No React id and no copy: a second presentation
 * state stored beside the domain one is the copy that goes stale, and
 * `describeAuthoringRefusal` derives the sentence on every render instead.
 */
export type EdgeRefusal =
  | ({ readonly kind: 'command'; readonly refusal: AuthoringRefusal } & EdgeSubject)
  | { readonly kind: 'gesture'; readonly refusal: AuthoringRefusal };

export interface EdgeAuthoringState {
  readonly draft: EdgeDraft | null;
  /**
   * The refusal the current draft ran into, retained until the author changes
   * the proposal or cancels. A refusal is not a cancellation: the draft and its
   * refusal stand together so the author can correct what they aimed at.
   */
  readonly refusal: EdgeRefusal | null;
}

export interface EdgeAuthoring {
  readonly getState: () => EdgeAuthoringState;
  readonly subscribe: (listener: () => void) => () => void;
  /** Space Authoring's eligibility answer, in the surface's terms. */
  readonly eligibility: (proposal: EdgeProposal) => EdgeEligibility;
  /** Whether a proposal may be offered — React Flow's `isValidConnection` shape. */
  readonly accepts: (proposal: EdgeProposal) => boolean;

  readonly beginPointerConnect: (from: ResourceId) => void;
  /** One completed React Flow connection. */
  readonly connect: (
    from: ResourceId,
    to: ResourceId,
    projected: readonly ResourceFlowNode[] | null,
  ) => void;
  /** An Option/Alt empty drop: author the Resource and the Edge that reaches it. */
  readonly createConnectedResource: (
    from: ResourceId,
    position: MapPosition,
    projected: readonly ResourceFlowNode[] | null,
  ) => void;
  /**
   * Draw an Edge from the Connect list in the Active Graph. A completion
   * continues at the new Edge, selected and focused. A refusal is returned, not
   * retained: the still-open list owns the sentence. No draft is begun, since
   * the list is one press from open to Edit.
   */
  readonly connectTo: (
    from: ResourceId,
    target: ConnectTarget,
    projected: readonly ResourceFlowNode[] | null,
  ) => ConnectionResult;
  /**
   * End whichever pointer drag was in flight, requesting the continuation a
   * completed connection earns — the Resource it reached, selected.
   *
   * One operation for both pointer drafts because a drag ends the same way
   * whatever it was doing: **the draft goes and the refusal stays.** A refusal
   * normally retains its draft so the author can correct the proposal, but a
   * finished drag leaves no surface to correct — the sentence is the whole of
   * what they are told, and cancelling would take it away with the draft.
   *
   * The Resource is held until the drag ends rather than answered to the caller:
   * a return value the connecting operations pass up would be a second
   * continuation channel beside `continuation.ts`.
   */
  readonly endPointerDrag: () => void;

  /** Select the Edge and begin its Title draft, which stands while the selection names it. */
  readonly beginTitleEdit: (subject: EdgeSubject) => void;
  /** The refusal, which keeps the draft standing, or `null` once settled or with no draft. */
  readonly completeTitle: (title: string) => AuthoringRefusal | null;
  readonly setTitleHidden: (subject: EdgeSubject, hidden: boolean) => boolean;
  readonly deleteEdge: (subject: EdgeSubject) => boolean;
  /** Cancel the topmost Edge surface, producing no Edit. */
  readonly cancelDraft: () => void;
  readonly dispose: () => void;
}

export interface EdgeAuthoringDependencies {
  readonly authoring: SpaceAuthoring;
  readonly adapter: RenderAdapter;
  readonly connections: ConnectionCompletion;
  /** Where every focus move this lifecycle owes the author is published. */
  readonly continuation: Continuation;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
}

const IDLE: EdgeAuthoringState = { draft: null, refusal: null };

/** The channel a finished pointer gesture leaves its refusal on. */
const gestureRefusal = (refusal: AuthoringRefusal): EdgeRefusal => ({ kind: 'gesture', refusal });

/**
 * Whether the selected Map still owns the Graph and it still holds the Edge.
 * Read off the working snapshot: the projection lags the Edit by a strategy.
 */
const holdsEdge = (
  snapshot: SpaceSnapshot,
  mapId: MapId,
  { graphId, edge }: EdgeSubject,
): boolean =>
  (snapshot.document.maps ?? [])
    .find((map) => map.id === mapId)
    ?.graphs.find((graph) => graph.id === graphId)
    ?.edges.some((held) => held.from === edge.from && held.to === edge.to) === true;

/** Whether a canvas selection names the entity this draft is about. */
const selectionMatchesDraft = (selection: CanvasSelection, draft: EdgeDraft): boolean => {
  if (draft.kind === 'pointer-connect') {
    // A pointer connect deliberately survives an empty selection: React Flow
    // clears the Resource as the drag begins, and cancelling there would end the
    // gesture on its first frame.
    return selection.kind !== 'resource' || selection.resourceId === draft.from;
  }
  return selection.kind === 'edge' && sameEdgeSubject(selection, draft);
};

export function createEdgeAuthoring({
  authoring,
  adapter,
  connections,
  continuation,
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
   * Whether the entity a draft is about still exists and can still be authored.
   *
   * A connect draft asks the empty-drop proposal: "may this Resource still be
   * an Edge's source here", with no target to confuse it.
   */
  const subjectSurvives = (draft: EdgeDraft): boolean => {
    if (draft.kind === 'pointer-connect') {
      return accepts({ kind: 'create-and-connect', from: draft.from });
    }
    const { session, navigation } = authoring.getState();
    return holdsEdge(session.working, navigation.selectedMapId, draft);
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
    completion: Parameters<SpaceAuthoring['complete']>[0] & EdgeSubject,
  ): AuthoringRefusal | 'settled' | 'queued' => {
    const result = authoring.complete(completion);
    if (result.kind === 'refused') {
      const { graphId, edge } = completion;
      publish({ refusal: { kind: 'command', graphId, edge, refusal: result.refusal } });
      return result.refusal;
    }
    if (result.kind === 'queued') {
      safelyReport(
        new Error(
          `A ${completion.kind} completion was queued behind another Edit. React Flow events cannot be re-entrant.`,
        ),
      );
      return 'queued';
    }
    // `unchanged` (a Title written back as it was) settles like a completion.
    clearDraft();
    return 'settled';
  };

  /** The Resource a finished pointer connection continues at, held across the drag's end. */
  let continueAt: ResourceId | null = null;

  /**
   * Take what a connection attempt came to, and say what the author sees.
   *
   * The three outcomes are not interchangeable. A **refusal** is retained on the
   * channel the caller names; a **completion** clears whatever refusal was
   * there, because a refusal describes the proposal that produced it and this
   * one has landed; and **unavailable** — no Resources on the canvas yet, or an invariant
   * already reported — says nothing either way, so a refusal already on screen
   * stands.
   */
  const settleConnection = (
    result: ConnectionResult,
    channel: (refusal: AuthoringRefusal) => EdgeRefusal,
  ): ResourceId | null => {
    if (result.kind === 'refused') {
      publish({ refusal: channel(result.refusal) });
      return null;
    }
    if (result.kind !== 'completed') return null;
    publish({ refusal: null });
    return result.resourceId;
  };

  /**
   * Hold the Resource a pointer connection continues at until its drag ends.
   */
  const holdForDrag = (resourceId: ResourceId | null): void => {
    if (resourceId !== null) continueAt = resourceId;
  };

  /**
   * Ask the author be put back on the entity this Edit left them with.
   *
   * One line, because where an Edit continues is one module
   * (`continuation.ts`): this lifecycle says what it owes and an adapter that
   * can reach the target spends it, instead of publishing a one-shot of its own
   * for the React layer to resolve, wait on and clear.
   */
  const requestFocus = (target: ContinuationTarget): void =>
    continuation.request({ target, select: false, then: 'focus' });

  /**
   * Select a toolbar command's Edge before acting: a hovered Edge's toolbar can
   * be pressed while something else is selected, and the Selected Edge must be
   * the one acted on. An already-selected Edge is left alone so the selection
   * subscription sees no move.
   */
  const select = (subject: EdgeSubject): void => {
    const current = adapter.getState().selection;
    if (current.kind === 'edge' && sameEdgeSubject(current, subject)) return;
    adapter.getState().selectEdge(subject);
  };

  // Invalidation. The draft is cancelled by anything that changes what it is
  // about, and by nothing else — an unrelated completed Edit leaves it standing.
  let replacementEpoch = authoring.getState().replacementEpoch;
  let selectedMapId = authoring.getState().navigation.selectedMapId;
  let activeGraphId = authoring.getState().navigation.activeGraphId;
  let presenting = authoring.getState().navigation.mode === 'presenting';
  const unsubscribeAuthoring = authoring.subscribe(() => {
    const state = authoring.getState();
    const nowPresenting = state.navigation.mode === 'presenting';
    const contextChanged =
      state.replacementEpoch !== replacementEpoch ||
      state.navigation.selectedMapId !== selectedMapId ||
      state.navigation.activeGraphId !== activeGraphId ||
      // Presenting withdraws Edge authoring altogether, so a draft made before
      // it has no context left to complete in. Cancelled rather than merely
      // hidden: a picker left standing goes on authoring over the presentation,
      // and an Edge editor behind it reopens when the author returns.
      (nowPresenting && !presenting);
    replacementEpoch = state.replacementEpoch;
    selectedMapId = state.navigation.selectedMapId;
    activeGraphId = state.navigation.activeGraphId;
    presenting = nowPresenting;
    const { draft, refusal } = observable.getState();
    // **The refusal is invalidated even when no draft is left to carry it.** It
    // names Resources and a Graph of the Space it was made against, and a *pointer*
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
      publish({ draft: null, refusal: null });
      requestFocus({ kind: 'canvas' });
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
    // A refused toolbar command belongs to the Edge selected when it was made,
    // so it goes when the selection moves.
    if (refusal?.kind === 'command') publish({ refusal: null });
  });

  /**
   * Drop a selected Edge the Active Graph has left behind.
   *
   * CONTEXT.md's **Selected Edge**: an Edge outside the Active Graph "cannot
   * remain selected". Activating another Graph is not an Edit and moves no
   * Edge, so the stored subject is simply no longer one an authoring gesture may
   * act on — and the Edge's toolbar is revealed by the selection, so leaving it
   * would keep Delete live on an Edge the canvas has stopped offering.
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

    createConnectedResource: (from, position, projected) =>
      holdForDrag(
        settleConnection(connections.createAndConnect(from, position, projected), gestureRefusal),
      ),

    connectTo: (from, target, projected) => {
      const result =
        target.kind === 'resource'
          ? connections.connect(from, target.resourceId, projected)
          : connections.createAndConnect(from, 'beside-source', projected);
      if (result.kind !== 'completed') return result;
      publish({ refusal: null });
      // Read after the Edit: a Map with no Graph mints one for its first Edge.
      const graphId = authoring.getState().navigation.activeGraphId;
      if (graphId !== null) {
        continuation.request({
          target: { kind: 'edge', graphId, edge: { from, to: result.resourceId } },
          select: true,
          then: 'focus',
        });
      }
      return result;
    },

    endPointerDrag: () => {
      const reached = continueAt;
      continueAt = null;
      const { draft } = observable.getState();
      if (draft?.kind === 'pointer-connect') publish({ draft: null });
      // The storyboard's connected Resource is the selected one, so continued
      // authoring carries on from it — and there is nothing to do *there*, which
      // is the whole reason `select` is an axis of its own.
      if (reached !== null) {
        continuation.request({
          target: { kind: 'resource', resourceId: reached },
          select: true,
          then: 'nothing',
        });
      }
    },

    beginTitleEdit: (subject) => {
      select(subject);
      // Destructured rather than spread: the caller usually holds an
      // `EdgeSelection`, whose own `kind` would overwrite the draft's.
      begin({ kind: 'title', graphId: subject.graphId, edge: subject.edge });
    },

    completeTitle: (title) => {
      const { draft } = observable.getState();
      if (draft?.kind !== 'title') return null;
      const outcome = completeStructural({
        kind: 'titled-edge',
        graphId: draft.graphId,
        edge: draft.edge,
        title,
      });
      // A queued completion is already reported and owes the author no refusal.
      return outcome === 'settled' || outcome === 'queued' ? null : outcome;
    },

    setTitleHidden: (subject, hidden) => {
      select(subject);
      const { graphId, edge } = subject;
      return (
        completeStructural({
          kind: hidden ? 'hid-edge-title' : 'showed-edge-title',
          graphId,
          edge,
        }) === 'settled'
      );
    },

    deleteEdge: (subject) => {
      select(subject);
      const { graphId, edge } = subject;
      // A refused Delete leaves the Edge selected, so its toolbar owns the
      // sentence rather than the canvas announcement.
      const deleted = completeStructural({ kind: 'deleted-edge', graphId, edge }) === 'settled';
      // The Edge that held focus is about to leave the projection, and React
      // Flow moves focus only for elements it still draws.
      if (deleted) requestFocus({ kind: 'resource', resourceId: edge.from });
      return deleted;
    },

    cancelDraft: () => {
      const { draft } = observable.getState();
      if (draft === null) return;
      publish({ draft: null, refusal: null });
      // A Title draft's field returns focus itself.
      if (draft.kind === 'pointer-connect') {
        requestFocus({ kind: 'resource', resourceId: draft.from });
      }
    },

    dispose: () => {
      unsubscribeAuthoring();
      unsubscribeAdapter();
      unsubscribeSelection();
      observable.clearSubscribers();
    },
  };
}
