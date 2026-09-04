import {
  type CardDocument,
  type CardId,
  COLLAPSED_CARD_SIZE,
  DEFAULT_OPEN_SIZE,
  type Graph,
  type GraphEdge,
  type GraphId,
  type LayoutPosition,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement, type Space } from '@project/graph';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type SpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import { nextGraphColor } from './colors';
import type { Navigation, NavigationState } from './navigation';
import {
  updatePositionedLayout,
  withCardRemovedFromLayouts,
  withoutIncidentEdges,
} from './snapshot';
import { nextCardTitle, nextGraphTitle, nextLayoutTitle } from './titles';
import {
  defaultLayout,
  type CanvasRendererId,
  type ResolvedRenderer,
  type ResolveRenderer,
} from './renderer';

/** Which end of an Edge a reconnection replaces. */
export type EdgeEndpoint = 'from' | 'to';

/**
 * An Edge gesture stated in domain terms, before anything has been authored.
 *
 * The shape both halves of an Edge interaction are asked in: the live preview
 * asks {@link SpaceAuthoring.edgeEligibility} and the release asks `complete`,
 * over one value the surface built once. A gesture the canvas offers therefore
 * cannot be one the Edit silently drops — and, because a proposal carries
 * reconnect's *original* Edge and the endpoint being replaced, returning that
 * endpoint to the Card it came from is eligible rather than looking like an
 * Edge that already exists.
 *
 * `create-and-connect` names no target because the Option/Alt empty drop has
 * none yet (ADR 0033); the Card it would author is minted by the Edit.
 */
export type EdgeProposal =
  | { readonly kind: 'connect'; readonly from: CardId; readonly to: CardId }
  | { readonly kind: 'create-and-connect'; readonly from: CardId }
  | {
      readonly kind: 'reconnect';
      readonly graphId: GraphId;
      readonly edge: GraphEdge;
      readonly endpoint: EdgeEndpoint;
      readonly cardId: CardId;
    };

/**
 * Whether a proposal may be offered, and why not.
 *
 * Two states rather than three: a reconnect returning an endpoint to its
 * original Card is **eligible**, and settles as `unchanged` when it completes.
 * Eligibility answers what the author may still do, not what the Edit will
 * turn out to have changed — a picker that greyed out the Card an endpoint
 * already names would show the current value as the one forbidden choice.
 */
export type EdgeEligibility =
  { readonly kind: 'eligible' } | { readonly kind: 'refused'; readonly refusal: AuthoringRefusal };

const ELIGIBLE = { kind: 'eligible' } as const;

const assertValidAuthoredSnapshot = (snapshot: SpaceSnapshot): void => {
  const loaded = loadSpaceSnapshot(snapshot);
  if (!loaded.ok) {
    throw new Error(
      `Authoring produced an invalid Space: ${loaded.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
};

/**
 * One completed authored fact, as the interaction that finished knows it.
 *
 * Identities and the settled value, never a plan: the interaction says what it
 * finished, and every read of current state, every eligibility question and the
 * whole derivation of the next Space happen on this side of the seam. Three
 * kinds carry `rendered` because a pointer gesture is the only thing that knows
 * where React Flow has drawn the Cards; the rest are written into the placement
 * already installed.
 */
export type AuthoringCompletion =
  | { readonly kind: 'created-layout' }
  | {
      readonly kind: 'settled-card-movement';
      readonly rendered: Placement;
      readonly placed: readonly CardId[];
    }
  | { readonly kind: 'opened-card'; readonly cardId: CardId }
  | { readonly kind: 'closed-card'; readonly cardId: CardId }
  | {
      readonly kind: 'resized-card';
      readonly cardId: CardId;
      readonly size: { readonly width: number; readonly height: number };
    }
  | {
      readonly kind: 'connected-cards';
      readonly from: CardId;
      readonly to: CardId;
      readonly rendered: Placement;
    }
  | {
      readonly kind: 'edited-card';
      readonly cardId: CardId;
      readonly document: CardDocument;
    }
  | {
      readonly kind: 'create-and-connect';
      readonly from: CardId;
      readonly position: LayoutPosition;
      readonly rendered: Placement;
    }
  /** Add Card: a detached Markdown Card at the visible centre, neutrally titled. */
  | { readonly kind: 'created-card'; readonly anchor: LayoutPosition }
  /**
   * Add Alias: created only once its Target is chosen, because an Alias without
   * one is not a valid Card. An empty title takes the Target's.
   */
  | {
      readonly kind: 'created-alias';
      readonly target: CardId;
      readonly title?: string;
      readonly anchor: LayoutPosition;
    }
  /** Add to Layout: membership and a first position for a Card already in the Space. */
  | {
      readonly kind: 'added-card-to-layout';
      readonly cardId: CardId;
      readonly anchor: LayoutPosition;
    }
  /** Remove from Layout: membership, position and incident Edges, in this Layout only. */
  | { readonly kind: 'removed-card-from-layout'; readonly cardId: CardId }
  /** Delete Card from Space: the same removal, cascaded through every Layout. */
  | { readonly kind: 'deleted-card'; readonly cardId: CardId }
  | { readonly kind: 'renamed-layout'; readonly layoutId: UUID; readonly title: string }
  | { readonly kind: 'deleted-layout'; readonly layoutId: UUID }
  | { readonly kind: 'added-graph' }
  | { readonly kind: 'renamed-graph'; readonly graphId: GraphId; readonly title: string }
  | { readonly kind: 'recolored-graph'; readonly graphId: GraphId; readonly color: string }
  | { readonly kind: 'deleted-graph'; readonly graphId: GraphId }
  | {
      readonly kind: 'reconnected-edge';
      readonly graphId: GraphId;
      readonly edge: GraphEdge;
      readonly endpoint: EdgeEndpoint;
      readonly cardId: CardId;
    }
  | { readonly kind: 'deleted-edge'; readonly graphId: GraphId; readonly edge: GraphEdge };

/**
 * What a semantic operation answers: the three outcomes every one of them
 * shares, plus the ordering answer only a reentrant caller sees.
 *
 * `unchanged` and `refused` are deliberately distinct, and neither is an error.
 * Unchanged is the value the author already authored — a rename to the stored
 * title, a swatch already chosen, a drag returned to where it began — and the
 * surface's ordinary close. Refused is an operation that cannot happen now:
 * stale context, or a domain rule the author has run into. It carries a stable
 * identity and typed domain context; application composition owns its prose.
 *
 * A broken invariant is neither. It throws, or is reported through the
 * non-throwing reporter — dressing a programming defect as a refusal would put
 * it in front of the author as their own mistake.
 */
export type AuthoringResult =
  | {
      readonly kind: 'completed';
      readonly createdCardId?: CardId;
      readonly createdGraphId?: GraphId;
    }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: AuthoringRefusal }
  | { readonly kind: 'queued' };

type LayoutRequiredOperation = Extract<
  AuthoringCompletion,
  | { readonly kind: 'added-card-to-layout' }
  | { readonly kind: 'removed-card-from-layout' }
  | { readonly kind: 'opened-card' }
  | { readonly kind: 'closed-card' }
  | { readonly kind: 'resized-card' }
  | { readonly kind: 'renamed-layout' }
  | { readonly kind: 'renamed-graph' }
  | { readonly kind: 'recolored-graph' }
  | { readonly kind: 'deleted-graph' }
  | { readonly kind: 'reconnected-edge' }
  | { readonly kind: 'deleted-edge' }
>['kind'];

/** Stable identities for every expected refusal at the Authoring seam. */
export type AuthoringRefusal =
  | { readonly code: 'placement-pending' }
  | { readonly code: 'layout-not-found' }
  | { readonly code: 'layout-required'; readonly operation: LayoutRequiredOperation }
  | { readonly code: 'card-not-found' }
  | { readonly code: 'card-kind-immutable' }
  | { readonly code: 'alias-target-immutable' }
  | { readonly code: 'space-card-target-immutable' }
  | { readonly code: 'space-card-deletion-unsupported' }
  | { readonly code: 'card-title-required' }
  | { readonly code: 'layout-title-required' }
  | { readonly code: 'space-must-keep-layout' }
  | { readonly code: 'alias-target-not-found'; readonly targetId: CardId }
  | { readonly code: 'alias-target-must-own-content'; readonly targetId: CardId }
  | { readonly code: 'card-already-in-layout' }
  | { readonly code: 'card-not-in-layout' }
  | { readonly code: 'card-not-expanded' }
  | {
      readonly code: 'card-has-aliases';
      readonly aliasTitles: readonly string[];
    }
  | { readonly code: 'graph-title-required' }
  | { readonly code: 'layout-must-keep-graph' }
  | { readonly code: 'graph-not-owned' }
  | { readonly code: 'edge-not-found' }
  | { readonly code: 'edge-card-outside-layout' }
  | { readonly code: 'edge-already-exists' }
  | { readonly code: 'layout-active-graph-required' };

/**
 * The published state: what the collaborators say, plus the one thing only
 * Authoring knows — that a replacement Space has been opened over them.
 *
 * The on-screen placement is deliberately absent. It is an *input* the renderer
 * pushes in on every projection and pointer frame, not something Authoring
 * publishes, and a copy carried here could only disagree with the value
 * `authoredPlacement` answers — installing a placement is not a publication.
 * One accessor, read when it is needed.
 */
export interface SpaceAuthoringState {
  /**
   * ADR 0042's replacement signal: advances when a replacement Space is opened
   * over this Authoring without recreating it, and at no other time. Retry,
   * Keep local, persistence status changes, renderer selection and completed
   * Edits all leave it where it is.
   *
   * It is invalidation rather than a registry — Authoring never learns which
   * field, picker, drag or armed control is open. Each owner compares the epoch
   * it captured, or is keyed by it, and applies its own cancellation.
   */
  readonly replacementEpoch: number;
  readonly session: SpaceSessionState;
  readonly navigation: NavigationState;
}

export interface SpaceAuthoring {
  readonly getState: () => SpaceAuthoringState;
  /**
   * The selected Layout's installed placement.
   *
   * Read at the point of use rather than subscribed to. Every path that
   * installs a placement is paired with a publication from this store or from
   * the render adapter, so a reader that re-reads on notification from either
   * always sees the current value.
   */
  readonly authoredPlacement: () => Placement | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly reportRendered: (rendered: Placement) => void;
  readonly replacePlacement: (placement: Placement | null) => void;
  /**
   * Whether an Edge gesture may be offered as things stand, and why not.
   *
   * The one eligibility query for every Edge path — connect, create-and-connect
   * and reconnect — asked by the live preview, by React Flow's
   * `isValidConnection` during a drag, and by a picker deciding which Cards to
   * disable. Completion validates the same proposal again, because the Space can
   * change while a preview or a picker is open.
   */
  readonly edgeEligibility: (proposal: EdgeProposal) => EdgeEligibility;
  readonly complete: (completion: AuthoringCompletion) => AuthoringResult;
  readonly retryPersistence: () => void;
  /**
   * Commit the newest local work against the revision the conflict named,
   * keeping every Edit made since the commit that hit it.
   *
   * The snapshot is read here rather than handed in, which is the whole reason
   * this exists beside `session.resolveConflict`: the caller is a button in a
   * toolbar, and a button that assembles a snapshot is a button that can commit
   * a stale one. Retry and Keep local both take the *newest* working Space, so
   * Edits an author went on making while the conflict stood are included rather
   * than silently dropped.
   */
  readonly keepLocalWork: () => void;
  /** Replace local work with the current stored Space, or explain why it was refused. */
  readonly acceptStoredSpace: () => string | null;
  /**
   * Release the collaborator subscriptions this Authoring holds.
   *
   * The session outlives any Authoring composed over it, so one that never
   * unsubscribes leaves a listener and its captured Navigation behind. Nothing
   * replaces a composition mid-session now that accepting the stored Space is
   * an edit to this one, but the subscriptions are still this object's to hand
   * back and the seam is what makes that possible.
   */
  readonly dispose: () => void;
}

/**
 * A completed Edit, derived and validated in full: everything each collaborator
 * is about to be handed, and nothing left to compute or decide.
 *
 * Not a plan a caller executes — `complete` is still the one operation, and this
 * type is private. What it buys is that the shell installing it cannot grow a
 * derivation, a refusal or a validation inside the window, because there is
 * nothing left there to derive from.
 */
interface CompletedEdit {
  readonly snapshot: SpaceSnapshot;
  readonly placement: Placement;
  /** The Layout this Edit wrote, which Navigation continues in. */
  readonly nextRenderer: CanvasRendererId;
  /**
   * The Active Graph of that Layout, which Navigation adopts along with it.
   *
   * Under ADR 0040 a Layout owns its Graphs, so which one is active is a fact
   * about the Layout this Edit wrote and not a separate consequence.
   */
  readonly nextActiveGraphId: GraphId | null;
  readonly createdCardId?: CardId;
  readonly createdGraphId?: GraphId;
}

/**
 * What the pure core answers: a complete Edit, or one of the two outcomes that
 * are not Edits.
 *
 * The same three names {@link AuthoringResult} carries, so the shell hands the
 * last two straight back rather than translating between two vocabularies for
 * the same distinction.
 */
type DerivedCompletion =
  | { readonly kind: 'completed'; readonly edit: CompletedEdit }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: AuthoringRefusal };

const UNCHANGED = { kind: 'unchanged' } as const;
const refuse = (refusal: AuthoringRefusal): DerivedCompletion => ({ kind: 'refused', refusal });

/**
 * Everything a completion is derived from: the report itself, and the editor
 * state read at the moment it was made.
 *
 * The two travel together from `complete` to the derivation, and a queued one
 * has to hold them until the drain reaches it, so they are one value rather than
 * two parameters repeated at each hand-off.
 */
interface ReportedCompletion {
  readonly completion: AuthoringCompletion;
  readonly placement: Placement | null;
}

/** A `ReportedCompletion` waiting behind the Edit that was installing when it arrived. */
interface QueuedCompletion extends ReportedCompletion {
  /**
   * The Space this work was made against, named by the epoch that Space was
   * current in — read by the drain, and the only reason it is recorded.
   */
  readonly replacementEpoch: number;
}

interface SpaceAuthoringDependencies {
  readonly session: SpaceSession;
  readonly navigation: Navigation;
  /**
   * The validated aggregate behind the session's working snapshot.
   *
   * The same reader Navigation is given, so both resolve a renderer against one
   * `Space` identity and one parse — and both read entity context through that
   * Space's own `lookup`.
   */
  readonly currentSpace: () => Space;
  /**
   * The composition's one renderer resolver, shared with App rendering and
   * Navigation.
   *
   * Authoring needs it because which Layout an Edit writes, and what that Layout
   * owns, is the renderer's answer.
   */
  readonly resolveRenderer: ResolveRenderer;
  readonly initialPlacement?: Placement | null;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
  /**
   * Mints the identity of every Card, Layout and Graph a completed Edit creates.
   *
   * Taken here, once, rather than at each `newUuid()` call inside the derivation,
   * so a test supplies the ids it is about to assert on instead of reaching past
   * the module to mock `crypto.randomUUID` — which ADR 0016 rejected on its own
   * terms: a constant collides across a property test's cases so it needs a
   * counter, at which point a generator exists anyway; `randomUUID` is an
   * unseedable CSPRNG, so controlling it means owning it; and a global mock stops
   * working in silence the day the implementation moves to v7 and reads the clock
   * as well as the entropy pool.
   *
   * It is also what makes {@link deriveCompletedEdit} the pure core its own
   * comment claims: minting from the ambient CSPRNG was the one thing left in
   * there that a second call could not reproduce.
   *
   * One function for all three kinds, because they are one type — the ids of
   * different entity kinds may legally share a UUID (ADR 0030) — and because
   * what a test needs to say is *which ids this Edit mints, in order*.
   *
   * Required, not defaulted: `compose-app.ts` states what an opened Space is
   * composed of, and a collaborator that quietly falls back to `newUuid` puts a
   * second source of minted identity behind the one the composition names.
   */
  readonly newId: () => UUID;
}

/** The Cards a snapshot carries, in the shape a snapshot carries them. */
type SnapshotCards = SpaceSnapshot['cards'];

/**
 * How far a Card creation steps when the anchor it was given is taken, and in
 * which direction.
 *
 * A visible stack rather than collision avoidance: existing Cards never move,
 * and partial overlap of the 260×146 Front is deliberate. Only an *exact*
 * anchor collision steps, which is what a repeated centre-add produces and a
 * pointer drop essentially never does.
 */
const STACK_STEP = 24;

const freeAnchor = (placement: Placement, anchor: LayoutPosition): LayoutPosition => {
  const taken = new Set([...placement.values()].map(({ x, y }) => `${x},${y}`));
  let at = anchor;
  // Terminates: each step is a distinct point on one diagonal, and the taken
  // set is finite, so at most one step per placed Card can be occupied.
  for (let step = 1; taken.has(`${at.x},${at.y}`); step += 1) {
    at = { x: anchor.x + STACK_STEP * step, y: anchor.y + STACK_STEP * step };
  }
  return at;
};

/** Two Edges are the same Edge when they join the same Cards the same way (ADR 0032). */
const sameEdge = (left: GraphEdge, right: GraphEdge): boolean =>
  left.from === right.from && left.to === right.to;

/** Where an Edge sits in a Graph, or -1. An exact duplicate is invalid, so there is at most one. */
const indexOfEdge = (edges: readonly GraphEdge[], edge: GraphEdge): number =>
  edges.findIndex((candidate) => sameEdge(candidate, edge));

/** What a reconnected endpoint settles to, before anything has been written. */
type ReconnectOutcome =
  | { readonly kind: 'edge'; readonly edge: GraphEdge }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: AuthoringRefusal };

/**
 * The one reconnection rule, asked by eligibility and again by the Edit.
 *
 * Both callers need the same four answers and one of them needs the resulting
 * Edge, so this returns it rather than a boolean the completion would have to
 * recompute. The order is deliberate: **unchanged is decided before
 * membership**, because a Card that is already this Edge's endpoint is by
 * definition in this Layout, and asking the placement first would refuse a
 * dragged endpoint dropped back where it started on a Layout still arranging.
 */
const reconnectOutcome = (
  graph: Graph | undefined,
  proposal: {
    readonly graphId: GraphId;
    readonly edge: GraphEdge;
    readonly endpoint: EdgeEndpoint;
    readonly cardId: CardId;
  },
  placement: Placement,
  /**
   * Whether the Space still holds the Card, which the placement does not answer.
   *
   * The same second condition `connectable` applies to a connection, and the
   * asymmetry was a latent trap rather than a nicety: an Edge naming a Card the
   * Space has lost derives a snapshot intake rejects, and this derivation answers
   * an unloadable Space by *throwing* — putting a defect in front of the author
   * as their own mistake. A picker open across such a deletion is the way there.
   */
  holdsCard: (cardId: CardId) => boolean,
): ReconnectOutcome => {
  // Ownership, not existence: a Graph a *second* Layout owns exists and is
  // still not one this Edit may write (ADR 0040).
  if (graph === undefined) {
    return { kind: 'refused', refusal: { code: 'graph-not-owned' } };
  }
  if (indexOfEdge(graph.edges, proposal.edge) === -1) {
    return {
      kind: 'refused',
      refusal: { code: 'edge-not-found' },
    };
  }
  const reconnected: GraphEdge =
    proposal.endpoint === 'from'
      ? { from: proposal.cardId, to: proposal.edge.to }
      : { from: proposal.edge.from, to: proposal.cardId };
  if (sameEdge(proposal.edge, reconnected)) return UNCHANGED;
  // Checked together and after `unchanged`, so an endpoint returned to its own
  // Card is still eligible on a Layout that has not finished arranging.
  if (!placement.has(proposal.cardId) || !holdsCard(proposal.cardId)) {
    return { kind: 'refused', refusal: { code: 'edge-card-outside-layout' } };
  }
  if (indexOfEdge(graph.edges, reconnected) !== -1) {
    return { kind: 'refused', refusal: { code: 'edge-already-exists' } };
  }
  return { kind: 'edge', edge: reconnected };
};

/**
 * Why a Card document's Alias Target may not be authored, or `null`.
 *
 * This is the creation-time rule for choosing an Alias Target. Existing Alias
 * Targets are immutable and are refused before this validation is reached. It
 * duplicates what `validateReferences` already enforces, and deliberately:
 * intake reports by failing the whole snapshot, which this derivation answers
 * by throwing, and an author choosing the wrong Target has made a mistake that
 * deserves a sentence rather than an exception. A markdown document has no
 * Target and nothing to refuse.
 */
const aliasTargetRefusal = (space: Space, document: CardDocument): AuthoringRefusal | null => {
  if (document.kind !== 'alias') return null;
  const target = space.lookup.card(document.target);
  if (target === undefined) return { code: 'alias-target-not-found', targetId: document.target };
  // Single-hop by construction (ADR 0009): the Target must own Markdown
  // content, so neither another Alias nor a Space Card can be targeted.
  if (target.kind !== 'markdown') {
    return { code: 'alias-target-must-own-content', targetId: document.target };
  }
  return null;
};

/**
 * A Card an Edit is creating, held rather than placed.
 *
 * Its position waits here until the complete next Layout is assembled.
 */
interface CreatedCard {
  readonly id: CardId;
  readonly position: LayoutPosition;
  /**
   * Step off a position another Card already occupies exactly. A gesture that
   * dropped on empty canvas aimed at its point and keeps it; a Card created from
   * a menu has no aimed-at point and would otherwise stack.
   */
  readonly avoidingOverlap: boolean;
}

/** The Aliases pointing at a Card, which are what block deleting it from the Space. */
const incomingAliases = (cards: SnapshotCards, cardId: CardId): SnapshotCards =>
  cards.filter((card) => card.document.kind === 'alias' && card.document.target === cardId);

/** A title normalized for authorship, or `null` when it contains no name. */
const trimmedNonBlankTitle = (title: string): string | null => {
  const trimmed = title.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * Structural equality over the JSON values a snapshot is built from.
 *
 * Serializing both sides and comparing the text was the same answer only when
 * the two agreed on key order, and nothing promises that: a snapshot loaded
 * from the database or an import carries whatever order it was written in,
 * while a completed Edit rebuilds each Layout in the writer's order. A
 * difference in order is not a difference an author made, and reading one as an
 * Edit submits a commit that changes nothing.
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length && left.every((entry, index) => sameValue(entry, right[index]))
    );
  }
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  // SAFETY: the `typeof`/array checks above already confirmed both are
  // non-null, non-array objects; indexing them as `Record<string, unknown>`
  // just names that shape for the recursive comparison.
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      sameValue((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

const sameSnapshot = (left: SpaceSnapshot, right: SpaceSnapshot): boolean => sameValue(left, right);

export function createSpaceAuthoring({
  session,
  navigation,
  currentSpace,
  resolveRenderer,
  initialPlacement = null,
  reportObserverError = (error) => console.error('SpaceAuthoring observer failed', error),
  newId,
}: SpaceAuthoringDependencies): SpaceAuthoring {
  let placement: Placement | null = initialPlacement;
  let replacementEpoch = 0;
  let installing = 0;

  // The one way placement is written — every path goes through here, including
  // Edit completion and accepting a stored Space.
  //
  // Identity is load-bearing, not just the value: `usePlacementRendering`
  // rebuilds the positioned strategy whenever this changes identity and re-runs
  // layout, so an equal placement pushed in by a projection must keep the one it
  // already has or every projection would re-arrange a settled graph. A
  // completed Edit needs no help getting its re-layout — it replaces the working
  // snapshot, and the `LayoutStrategyGraph` derived from it re-fires the same effect.
  const install = (nextPlacement: Placement | null): void => {
    if (Placement.equals(placement, nextPlacement)) return;
    placement = nextPlacement;
  };

  const selectedResolvedRenderer = (): ResolvedRenderer =>
    resolveRenderer(currentSpace(), navigation.getState().selectedRenderer);

  const mergeBase = (): Placement | null => placement;

  const reportRendered = (rendered: Placement): void => {
    install(Placement.next(mergeBase(), rendered, []));
  };

  const snapshotState = (): SpaceAuthoringState => ({
    replacementEpoch,
    session: session.getState(),
    navigation: navigation.getState(),
  });
  const observable = createObservableState(snapshotState(), reportObserverError);
  // Completion failures use the same configured diagnostic sink, but are not
  // observer failures and therefore remain outside the observable-state seam.
  const safelyReport = createNonThrowingReporter(reportObserverError);

  const publish = (): void => {
    observable.publish(snapshotState());
  };

  /**
   * Update the collaborators as one step, then publish whatever the step left
   * behind.
   *
   * The gate suppresses each collaborator's own notification for the duration,
   * so nothing observes the sequence part-way through — and nothing observes it
   * *at all* unless this publishes. That is why `publish` runs in the `finally`
   * rather than after the block: a throw would otherwise leave every subscriber
   * reading Authoring's pre-Edit memoized state while the session already holds
   * the snapshot it published optimistically inside `submit`, and reading it
   * until some unrelated notification happened along.
   *
   * This is not a `catch` and does not pretend the step succeeded. The failure
   * still reaches the caller; what it can no longer do is take the publication
   * with it. Making the step itself total is the caller's job — see
   * `installCompletedEdit`.
   *
   * The gate counts depth rather than holding a flag, because these windows
   * nest. A collaborator notified from inside one may legally complete an Edit —
   * the same latitude `SpaceSession` gives an observer that submits — and that
   * completion opens a second window within the first. A boolean would be
   * cleared by the inner `finally` and leave the rest of the outer sequence
   * publishing every part-way state it was raised to hide. Only the outermost
   * window publishes, so the sequence is still observed exactly once.
   */
  const installTogether = (updates: () => void): void => {
    installing += 1;
    try {
      updates();
    } finally {
      installing -= 1;
      if (installing === 0) publish();
    }
  };

  const unsubscribeSession = session.subscribe(() => {
    if (installing === 0) publish();
  });
  const unsubscribeNavigation = navigation.subscribe(() => {
    if (installing === 0) publish();
  });

  /**
   * The Graph a Layout-owned Edge operation names, or `undefined` when the
   * selected Layout is not the one that owns it.
   *
   * Asked of `space.lookup.graph`, which answers a Graph *with its owner* — the
   * index built for exactly this question (ADR 0040), and O(1) rather than a
   * walk over one Layout's Graphs. Comparing the owner's id is what keeps this
   * ownership rather than existence: a Graph a second Layout owns resolves here
   * and is still not one this Edit may write. Graph ids are unique across the
   * Space (ADR 0045), so there is no second Graph the id could have meant.
   */
  const ownedGraph = (graphId: GraphId): Graph | undefined => {
    const selectedRenderer = selectedResolvedRenderer();
    const owned = currentSpace().lookup.graph(graphId);
    return owned?.owner.layout.id === selectedRenderer.resolvedLayout.layout.id
      ? owned.graph
      : undefined;
  };

  /**
   * The Graph a connection drawn right now would land in, or `null` when no
   * selected Layout owns one.
   *
   * A Layout the Space no longer holds answers `null` too: it names no Graph,
   * and the completion that follows refuses for that reason rather than this one.
   */
  const targetGraph = (): Graph | null => {
    const { activeGraphId } = navigation.getState();
    return activeGraphId === null ? null : (ownedGraph(activeGraphId) ?? null);
  };

  /**
   * Whether a Card is one an Edge this gesture authors may name at all.
   *
   * Two conditions, and the second is ADR 0040's closure read forwards. A Card
   * of the Space is not necessarily a Card of the Layout the Edit writes: a
   * Layout's members **are** its position keys, and the completed placement is
   * what those keys are about to become. An Edge naming a Card outside it
   * derives a Space intake rejects, and `deriveCompletedEdit` answers an
   * unloadable Space by throwing — right for a bug, wrong for an eligibility
   * query. Refusing here keeps the interaction boundary closed over the Layout
   * even if a stale caller names a Card outside it.
   *
   * Reading the installed placement rather than the stored Layout is deliberate.
   * It is the same value the completion reports, so the preview and the
   * completion cannot disagree.
   */
  const connectable = (cardId: CardId): boolean =>
    placement !== null &&
    placement.has(cardId) &&
    session.getState().working.cards.some((card) => card.id === cardId);

  /**
   * Why an Edge this gesture would author cannot be authored, or `null`.
   *
   * One answer for the live preview, the release and the completed Edit, so a
   * gesture the canvas offers cannot be one the completion silently drops — and
   * the completion says *which* rule it hit, which a boolean could not.
   * `to === null` is the Option/Alt empty drop, whose target Card does not exist
   * yet (ADR 0033).
   *
   * An exact duplicate within one Graph is what intake rejects (ADR 0032), so it
   * can only be a duplicate of an Edge in the Graph the Edge is about to join.
   * A created Card cannot duplicate anything, which is why the callers differ.
   */
  const connectRefusal = (from: CardId, to: CardId | null): AuthoringRefusal | null => {
    if (!connectable(from) || (to !== null && !connectable(to))) {
      return { code: 'edge-card-outside-layout' };
    }
    const graph = targetGraph();
    if (graph === null) return { code: 'layout-active-graph-required' };
    if (to !== null && indexOfEdge(graph.edges, { from, to }) !== -1) {
      return { code: 'edge-already-exists' };
    }
    return null;
  };

  /**
   * The one eligibility answer for every Edge gesture.
   *
   * Each branch asks exactly the rule its completion asks — `connectRefusal`
   * for the two connecting gestures, `reconnectOutcome` for the third — so the
   * preview and the Edit cannot drift apart. Nothing here mints, installs or
   * publishes: it is a question about the Space as it stands, and the Space can
   * still change before the completion asks again.
   */
  const edgeEligibility = (proposal: EdgeProposal): EdgeEligibility => {
    if (proposal.kind !== 'reconnect') {
      const refusal = connectRefusal(
        proposal.from,
        proposal.kind === 'connect' ? proposal.to : null,
      );
      return refusal === null ? ELIGIBLE : { kind: 'refused', refusal };
    }
    if (placement === null) {
      return {
        kind: 'refused',
        refusal: { code: 'placement-pending' },
      };
    }
    const outcome = reconnectOutcome(ownedGraph(proposal.graphId), proposal, placement, (cardId) =>
      session.getState().working.cards.some((card) => card.id === cardId),
    );
    return outcome.kind === 'refused' ? outcome : ELIGIBLE;
  };

  /**
   * Derive the complete next state of every collaborator, or refuse.
   *
   * The pure core of a completed Edit: every read of the current state, every
   * reason to refuse, and the one validation that can fail all happen here,
   * before any collaborator has moved. What comes back is not a plan for the
   * caller to execute but a value with no decisions left in it — which is what
   * lets the shell below be a sequence of statements rather than a transaction.
   *
   * Neither `unchanged` nor `refused` is a failure: an Edit that changes
   * nothing, names a Card the Space no longer holds, or targets a Layout that
   * has gone is simply not an Edit, and the two say which of those it was.
   * Producing an unloadable Space *is* a failure, and it throws — here, where
   * the collaborators are all still level.
   */
  const deriveCompletedEdit = ({
    completion,
    placement: reportedPlacement,
  }: ReportedCompletion): DerivedCompletion => {
    const selection = navigation.getState().selectedRenderer;
    if (completion.kind === 'created-layout') {
      const snapshot = session.getState().working;
      const layoutId = newId();
      const graphId = newId();
      const emptyPlacement = Placement.fromEntries([]);
      const next = updatePositionedLayout(snapshot, {
        layoutId,
        title: nextLayoutTitle(snapshot),
        positions: emptyPlacement,
        graphs: [
          {
            id: graphId,
            title: 'Graph 1',
            color: nextGraphColor(0),
            edges: [],
          },
        ],
        activeGraphId: graphId,
      });
      assertValidAuthoredSnapshot(next);
      return {
        kind: 'completed',
        edit: {
          snapshot: next,
          placement: emptyPlacement,
          nextActiveGraphId: graphId,
          nextRenderer: layoutId,
        },
      };
    }
    if (completion.kind === 'deleted-layout') {
      const snapshot = session.getState().working;
      const layouts = snapshot.document.layouts ?? [];
      const target = layouts.find((layout) => layout.id === completion.layoutId);
      if (target === undefined) return refuse({ code: 'layout-not-found' });
      if (layouts.length === 1) return refuse({ code: 'space-must-keep-layout' });
      const survivors = layouts.filter((layout) => layout.id !== completion.layoutId);
      const selectedSurvives = survivors.some((layout) => layout.id === selection);
      const nextLayout = selectedSurvives
        ? survivors.find((layout) => layout.id === selection)
        : survivors[0];
      if (nextLayout === undefined) {
        throw new Error('Deleting a Layout left no survivor after the last Layout was refused.');
      }
      const next = {
        ...snapshot,
        document: {
          ...snapshot.document,
          layouts: survivors,
          defaultLayout:
            snapshot.document.defaultLayout === completion.layoutId
              ? nextLayout.id
              : snapshot.document.defaultLayout,
        },
      };
      assertValidAuthoredSnapshot(next);
      return {
        kind: 'completed',
        edit: {
          snapshot: next,
          placement: Placement.fromLayout(nextLayout),
          nextActiveGraphId: nextLayout.activeGraph ?? nextLayout.graphs[0]?.id ?? null,
          nextRenderer: nextLayout.id,
        },
      };
    }
    if (reportedPlacement === null) {
      return refuse({ code: 'placement-pending' });
    }
    let snapshot = session.getState().working;
    const previousSnapshot = snapshot;
    const navigationState = navigation.getState();
    const space = currentSpace();
    // A selected Layout the Space no longer holds is not an Edit. Checked before
    // resolving, because the resolver answers that case by throwing.
    //
    // Not the thing ADR 0045 forbids, which is turning a *thrown*
    // `RendererInvariantError` into a refusal — there is no catch here and a
    // renderer that refuses still takes the Edit down with it. This asks a
    // question of the Space instead, and the answer is an author's state rather
    // than a defect: the Layout this gesture was aimed at is gone, so there is
    // nothing to write it into.
    if (space.lookup.layout(selection) === undefined) {
      return refuse({ code: 'layout-not-found' });
    }
    const renderer = resolveRenderer(space, selection);
    /**
     * What this Edit does to the placement, held rather than applied.
     *
     * Card additions and removals wait here until the complete next Layout is
     * assembled.
     */
    let createdCard: CreatedCard | null = null;
    let unplacedCardId: CardId | undefined;
    let deletedCardId: CardId | undefined;
    let connection: GraphEdge | null = null;
    let completedPlacement = reportedPlacement;
    // The one way a Card is added: mint it, place it at a free anchor, append it.
    // Add Card and Add Alias differ in the document they carry and in nothing
    // else — neither creates an Edge, and neither adds a Graph to a Layout that
    // already has one.
    // Returns rather than assigns: `createdCard` is read further down, and a
    // `let` written only from inside a closure keeps its initial narrowing.
    const createCard = (
      document: CardDocument,
      at: LayoutPosition,
      avoidingOverlap = true,
    ): CreatedCard => {
      const id = newId();
      snapshot = { ...snapshot, cards: [...snapshot.cards, { id, document }] };
      return { id, position: at, avoidingOverlap };
    };
    if (completion.kind === 'edited-card') {
      const cardIndex = snapshot.cards.findIndex((card) => card.id === completion.cardId);
      const card = snapshot.cards[cardIndex];
      if (card === undefined) return refuse({ code: 'card-not-found' });
      // Kind is fixed for a Card's lifetime, and changing it is out of scope for
      // version 1. Everything else the editor holds — a Markdown Card's Title
      // and body, or an Alias's Title and Target — is one ordinary Edit of
      // this Card.
      if (card.document.kind !== completion.document.kind) {
        return refuse({ code: 'card-kind-immutable' });
      }
      if (
        card.document.kind === 'alias' &&
        completion.document.kind === 'alias' &&
        card.document.target !== completion.document.target
      ) {
        return refuse({ code: 'alias-target-immutable' });
      }
      if (
        card.document.kind === 'space' &&
        completion.document.kind === 'space' &&
        card.document.spaceId !== completion.document.spaceId
      ) {
        return refuse({ code: 'space-card-target-immutable' });
      }
      // Trimmed and refused *here* rather than only at the surface that typed
      // it. A blank title is the empty case wearing different bytes, and intake
      // answers an empty one by failing — which this derivation reports by
      // throwing, and an author's mistake may not throw. Every caller of this
      // operation is covered by one rule instead of each remembering it.
      const title = trimmedNonBlankTitle(completion.document.title);
      if (title === null) return refuse({ code: 'card-title-required' });
      const document: CardDocument = { ...completion.document, title };
      if (sameValue(card.document, document)) return UNCHANGED;
      const refusal = aliasTargetRefusal(space, document);
      if (refusal !== null) return refuse(refusal);
      const cards = [...snapshot.cards];
      cards[cardIndex] = { id: card.id, document };
      snapshot = { ...snapshot, cards };
    } else if (completion.kind === 'opened-card') {
      const at = completedPlacement.get(completion.cardId);
      if (at === undefined) return refuse({ code: 'card-not-in-layout' });
      if (at.open) return UNCHANGED;
      completedPlacement = Placement.place(completedPlacement, completion.cardId, {
        ...at,
        open: true,
        openSize: at.openSize ?? DEFAULT_OPEN_SIZE,
      });
    } else if (completion.kind === 'closed-card') {
      const at = completedPlacement.get(completion.cardId);
      if (at === undefined) return refuse({ code: 'card-not-in-layout' });
      if (!at.open) return UNCHANGED;
      completedPlacement = Placement.place(completedPlacement, completion.cardId, {
        ...at,
        open: false,
      });
    } else if (completion.kind === 'resized-card') {
      const at = completedPlacement.get(completion.cardId);
      if (at === undefined) return refuse({ code: 'card-not-in-layout' });
      if (!at.open) return refuse({ code: 'card-not-expanded' });
      if (
        completion.size.width === COLLAPSED_CARD_SIZE.width &&
        completion.size.height === COLLAPSED_CARD_SIZE.height
      ) {
        completedPlacement = Placement.place(completedPlacement, completion.cardId, {
          ...at,
          open: false,
        });
      } else if (
        at.openSize.width === completion.size.width &&
        at.openSize.height === completion.size.height
      ) {
        return UNCHANGED;
      } else {
        completedPlacement = Placement.place(completedPlacement, completion.cardId, {
          ...at,
          openSize: completion.size,
        });
      }
    } else if (completion.kind === 'created-card') {
      createdCard = createCard(
        { title: nextCardTitle(snapshot), kind: 'markdown', body: '' },
        completion.anchor,
      );
    } else if (completion.kind === 'created-alias') {
      // An empty title takes the Target's as a convenient initial value; text
      // the author already entered is never overwritten. `??` cannot express
      // this — the empty string is a value the picker really sends, and the
      // whole point is that it does not count as one.
      const entered = completion.title?.trim() ?? '';
      const document: CardDocument = {
        title: entered.length > 0 ? entered : (space.lookup.card(completion.target)?.title ?? ''),
        kind: 'alias',
        target: completion.target,
      };
      const refusal = aliasTargetRefusal(space, document);
      if (refusal !== null) return refuse(refusal);
      createdCard = createCard(document, completion.anchor);
    } else if (completion.kind === 'added-card-to-layout') {
      if (space.lookup.card(completion.cardId) === undefined) {
        return refuse({ code: 'card-not-found' });
      }
      if (completedPlacement.has(completion.cardId)) {
        return refuse({ code: 'card-already-in-layout' });
      }
      // Membership and a position, and nothing else: a re-added Card is detached,
      // and the Edges it once had are never inferred back.
      const authoredAnchor = Placement.authoredPoint(completedPlacement, completion.anchor);
      completedPlacement = Placement.place(
        completedPlacement,
        completion.cardId,
        freeAnchor(completedPlacement, authoredAnchor),
      );
    } else if (completion.kind === 'removed-card-from-layout') {
      if (!completedPlacement.has(completion.cardId)) {
        return refuse({ code: 'card-not-in-layout' });
      }
      unplacedCardId = completion.cardId;
      completedPlacement = Placement.remove(completedPlacement, completion.cardId);
    } else if (completion.kind === 'deleted-card') {
      const deleted = space.lookup.card(completion.cardId);
      if (deleted === undefined) {
        return refuse({ code: 'card-not-found' });
      }
      // A Space Card owns the Space it names (ADR 0058), so deleting it deletes
      // that Space and everything below it — one coordinated multi-Space Edit,
      // which is Space Card lifecycle through the session registry and not
      // a single-Space update this seam can make. Completing it here would store
      // a Space whose target is unreachable, and aggregate intake refuses that
      // commit permanently with the Card already gone from the working state.
      if (deleted.kind === 'space') {
        return refuse({ code: 'space-card-deletion-unsupported' });
      }
      // An Alias whose Target vanished is not a Card intake accepts, so the Space
      // cannot lose one out from under its Aliases. Removing that Card from a
      // single Layout is never blocked this way — only deleting it outright.
      const incoming = incomingAliases(snapshot.cards, completion.cardId);
      if (incoming.length > 0) {
        return refuse({
          code: 'card-has-aliases',
          aliasTitles: incoming.map((alias) => alias.document.title),
        });
      }
      // Deferred like a creation so the complete Layout changes atomically.
      unplacedCardId = completion.cardId;
      deletedCardId = completion.cardId;
      snapshot = {
        ...snapshot,
        cards: snapshot.cards.filter((card) => card.id !== completion.cardId),
      };
    } else if (completion.kind === 'create-and-connect') {
      const refusal = connectRefusal(completion.from, null);
      if (refusal !== null) return refuse(refusal);
      // The drop point is aimed at, so it is kept exactly: the gesture only
      // offers an empty-canvas release, and stepping off it would move the Card
      // away from where the author watched the preview sit.
      createdCard = createCard(
        { title: nextCardTitle(snapshot), kind: 'markdown', body: '' },
        completion.position,
        false,
      );
      connection = { from: completion.from, to: createdCard.id };
    } else if (completion.kind === 'connected-cards') {
      const refusal = connectRefusal(completion.from, completion.to);
      if (refusal !== null) return refuse(refusal);
      connection = { from: completion.from, to: completion.to };
    }
    // Which Layout this Edit writes, and what it owns afterwards.
    const layoutId: UUID = renderer.resolvedLayout.layout.id;
    let layoutTitle: string;
    let ownedGraphs: readonly Graph[];
    let activeGraphId: GraphId | null;
    let createdGraphId: GraphId | undefined;
    const { layout } = renderer.resolvedLayout;
    layoutTitle = layout.title;
    ownedGraphs = layout.graphs;
    activeGraphId = navigationState.activeGraphId;
    if (completion.kind === 'renamed-layout') {
      // Addressed by id, exactly as Rename Graph is (ADR 0040). The Sidebar row
      // and the canvas header coordinate one draft on this id, so a rename that
      // names a Layout other than the one this Edit resolves is a gesture aimed
      // at something no longer drawing — an author's state, not a defect.
      if (completion.layoutId !== layoutId) return refuse({ code: 'layout-not-found' });
      const title = trimmedNonBlankTitle(completion.title);
      if (title === null) return refuse({ code: 'layout-title-required' });
      if (title === layoutTitle) return UNCHANGED;
      layoutTitle = title;
    }
    // Apply membership changes together to the completed Layout.
    if (createdCard !== null) {
      const authoredPosition = Placement.authoredPoint(completedPlacement, createdCard.position);
      completedPlacement = Placement.place(
        completedPlacement,
        createdCard.id,
        createdCard.avoidingOverlap
          ? freeAnchor(completedPlacement, authoredPosition)
          : authoredPosition,
      );
    }
    if (deletedCardId !== undefined) {
      completedPlacement = Placement.remove(completedPlacement, deletedCardId);
    }
    if (connection !== null) {
      const graphIndex = ownedGraphs.findIndex((graph) => graph.id === activeGraphId);
      const graph = ownedGraphs[graphIndex];
      if (graph === undefined) {
        return refuse({ code: 'layout-active-graph-required' });
      }
      const graphs = [...ownedGraphs];
      graphs[graphIndex] = { ...graph, edges: [...graph.edges, connection] };
      ownedGraphs = graphs;
    } else if (unplacedCardId !== undefined) {
      // A Card that has left this Layout cannot be an endpoint of a Graph this
      // Layout owns (ADR 0040), so its incident Edges leave with it. The Graphs
      // themselves stay, empty ones included: deletion is their own action.
      ownedGraphs = withoutIncidentEdges(ownedGraphs, unplacedCardId);
    } else if (completion.kind === 'added-graph') {
      const graph: Graph = {
        id: newId(),
        title: nextGraphTitle(space.graphs),
        color: nextGraphColor(ownedGraphs.length),
        edges: [],
      };
      ownedGraphs = [...ownedGraphs, graph];
      activeGraphId = graph.id;
      createdGraphId = graph.id;
    } else if (
      completion.kind === 'renamed-graph' ||
      completion.kind === 'recolored-graph' ||
      completion.kind === 'deleted-graph' ||
      completion.kind === 'reconnected-edge' ||
      completion.kind === 'deleted-edge'
    ) {
      const graphIndex = ownedGraphs.findIndex((graph) => graph.id === completion.graphId);
      const graph = ownedGraphs[graphIndex];
      // Ownership, not existence: a Graph a *second* Layout owns exists and is
      // still not one this Edit may write (ADR 0040).
      if (graph === undefined) {
        return refuse({ code: 'graph-not-owned' });
      }
      const replacing = (next: Graph): readonly Graph[] =>
        ownedGraphs.map((existing, index) => (index === graphIndex ? next : existing));
      if (completion.kind === 'renamed-graph') {
        // Trimmed, for the reason a Card title is: `z.string().min(1)` counts
        // characters, so blank is the empty case wearing different bytes.
        const title = trimmedNonBlankTitle(completion.title);
        if (title === null) {
          return refuse({ code: 'graph-title-required' });
        }
        if (title === graph.title) return UNCHANGED;
        ownedGraphs = replacing({ ...graph, title });
      } else if (completion.kind === 'recolored-graph') {
        if (completion.color === graph.color) return UNCHANGED;
        ownedGraphs = replacing({ ...graph, color: completion.color });
      } else if (completion.kind === 'deleted-graph') {
        // Every Layout resolves an Active Graph, so the last one cannot go
        // (ADR 0040). Removing its Edges is the author's way to empty it.
        if (ownedGraphs.length === 1) {
          return refuse({ code: 'layout-must-keep-graph' });
        }
        ownedGraphs = ownedGraphs.filter((_, index) => index !== graphIndex);
        // Order among the survivors is untouched, and the first of them becomes
        // active when the deleted Graph was the one being emphasised.
        if (activeGraphId === graph.id) activeGraphId = ownedGraphs[0]?.id ?? null;
      } else if (completion.kind === 'deleted-edge') {
        const edgeIndex = indexOfEdge(graph.edges, completion.edge);
        if (edgeIndex === -1) {
          return refuse({ code: 'edge-not-found' });
        }
        ownedGraphs = replacing({
          ...graph,
          edges: graph.edges.filter((_, index) => index !== edgeIndex),
        });
      } else {
        // The same rule `edgeEligibility` offered the gesture under, asked again
        // because the Space can have changed since — and answering with the
        // resulting Edge rather than a boolean, so there is nothing to rederive.
        const outcome = reconnectOutcome(graph, completion, completedPlacement, (cardId) =>
          snapshot.cards.some((card) => card.id === cardId),
        );
        if (outcome.kind !== 'edge') return outcome;
        const edgeIndex = indexOfEdge(graph.edges, completion.edge);
        // In place, so reconnecting does not reorder a Graph's Edges — that order
        // is what a branching Card's moves are offered in (ADR 0024).
        ownedGraphs = replacing({
          ...graph,
          edges: graph.edges.map((edge, index) => (index === edgeIndex ? outcome.edge : edge)),
        });
      }
    }
    const next = updatePositionedLayout(
      // The cascade first, then this Layout written whole over the top of it.
      // Delete Card from Space is one Edit over every Layout (ADR 0040), and the
      // current one is simply the Layout this Edit was also going to write.
      deletedCardId === undefined ? snapshot : withCardRemovedFromLayouts(snapshot, deletedCardId),
      {
        layoutId,
        title: layoutTitle,
        positions: completedPlacement,
        graphs: ownedGraphs,
        activeGraphId,
      },
    );
    if (sameSnapshot(previousSnapshot, next)) return UNCHANGED;
    assertValidAuthoredSnapshot(next);
    const created: { createdCardId?: CardId; createdGraphId?: GraphId } = {};
    if (createdCard !== null) created.createdCardId = createdCard.id;
    if (createdGraphId !== undefined) created.createdGraphId = createdGraphId;
    return {
      kind: 'completed',
      edit: {
        snapshot: next,
        placement: completedPlacement,
        nextActiveGraphId: activeGraphId,
        nextRenderer: layoutId,
        ...created,
      },
    };
  };

  /**
   * Install a derived Edit: one fallible step, and then three that refuse
   * nothing this Edit produces.
   *
   * `session.submit` has to come first. Both Navigation calls resolve the Graph
   * and the Layout against `currentSpace()`, which reads the working snapshot
   * `submit` installs synchronously — before it, neither exists yet and both
   * would refuse. So the order is forced, and the useful consequence is that
   * the only statement here that can *fail* is also the first: no later failure
   * exists to invalidate an earlier success, and a `submit` that throws leaves
   * the other three untouched rather than half-applied.
   *
   * That leaves exactly one failure shape — the session ahead of the placement
   * and Navigation — and it is the recoverable one. The snapshot the session
   * took already carries `completedPlacement` inside its Layout, so the local
   * placement is merely stale and the next projection re-derives it; installing
   * first would instead leave the placement describing an Edit the session
   * never took, and for a created Card, a position for a Card that does not
   * exist. That is the strand `b091623` inverted this order to close.
   *
   * **The renderer is adopted with the Active Graph that belongs to it**, and
   * the ordering that used to be spread over two Navigation calls is now inside
   * one. It has not been relaxed — the Graph is still resolved against the
   * renderer *this Edit produced* rather than the one it began in, which is the
   * whole of what that ordering bought. What changed is that a Layout owns its
   * Graphs (ADR 0040), so the pair is one answer and the intermediate state
   * where the renderer has moved and the Graph has not would name a Layout
   * beside a Graph some other Layout owns, which Navigation refuses.
   *
   * In that order the three statements below refuse nothing, and each for a
   * reason this Edit established rather than by having no guard to trip:
   *
   * - `install` decides nothing and reads nothing.
   * - `continueInRenderer` resolves a Layout `updatePositionedLayout` wrote into
   *   the snapshot `submit` just installed, and refuses only a Layout that does
   *   not draw the Active Graph handed with it — which is that Layout's own
   *   `activeGraph`, in a snapshot `loadSpaceSnapshot` accepted a line earlier,
   *   and intake is precisely the check that a Layout's `activeGraph` is one it
   *   owns. A null Active Graph names nothing and is exempt.
   *
   * Re-checking any of that *here* would add a branch that cannot be taken, and
   * this repo deletes those rather than keeps them. The guards live in
   * Navigation because they are Navigation's invariant, held against every
   * caller; this window is simply a caller that satisfies them.
   */
  const installCompletedEdit = (edit: CompletedEdit): void => {
    installTogether(() => {
      session.submit(edit.snapshot);
      install(edit.placement);
      navigation.continueInRenderer(edit.nextRenderer, edit.nextActiveGraphId);
    });
  };

  const performCompletion = (reported: ReportedCompletion): AuthoringResult => {
    const derived = deriveCompletedEdit(reported);
    // `unchanged` and `refused` are already the answer — the core and the
    // interface share one vocabulary rather than translating between two.
    if (derived.kind !== 'completed') return derived;
    const { createdCardId, createdGraphId } = derived.edit;
    installCompletedEdit(derived.edit);
    const created: { createdCardId?: CardId; createdGraphId?: GraphId } = {};
    if (createdCardId !== undefined) created.createdCardId = createdCardId;
    if (createdGraphId !== undefined) created.createdGraphId = createdGraphId;
    return { kind: 'completed', ...created };
  };

  let completing = false;
  const queued: QueuedCompletion[] = [];
  const complete = (completion: AuthoringCompletion): AuthoringResult => {
    // A pointer gesture reports where React Flow has drawn the Cards, and that
    // report is merged under `Placement.next`'s rules. Every other operation is
    // written into the placement already installed — there is no second source
    // of geometry for a rename or a deletion to disagree with.
    const completedPlacement =
      'rendered' in completion
        ? Placement.next(
            mergeBase(),
            completion.rendered,
            completion.kind === 'settled-card-movement' ? completion.placed : [],
          )
        : placement;
    install(completedPlacement);
    const reported: ReportedCompletion = {
      completion,
      placement: completedPlacement,
    };
    if (completing) {
      queued.push({ ...reported, replacementEpoch });
      return { kind: 'queued' };
    }
    completing = true;
    try {
      const result = performCompletion(reported);
      // Drain what arrived during publication. A queued Edit that cannot produce
      // a valid Space is a diagnostic, not this Edit's outcome: the completion
      // that drained the queue already installed and published, and charging it
      // someone else's failure would name the wrong Edit as the broken one.
      // Draining stops there — the rest of the queue was written against state
      // that never came about.
      let discardedAsReplaced = 0;
      while (queued.length > 0) {
        const next = queued.shift();
        if (next === undefined) continue;
        // ADR 0042: an entry was derived from identities, positions and Card
        // values read out of the Space that was current when it was queued, and
        // an observer may accept the stored Space from inside the very
        // publication this queue fills during. An entry the epoch has outlived
        // is therefore discarded rather than derived against the Space that
        // replaced it, and a later entry still drains — why refusing would not
        // save it, and why this skips rather than stops, is docs/agents/editing-and-persistence.md's
        // install-gate rule.
        if (next.replacementEpoch !== replacementEpoch) {
          discardedAsReplaced += 1;
          continue;
        }
        try {
          performCompletion(next);
        } catch (error) {
          safelyReport(error);
          break;
        }
      }
      // Not a user-facing refusal — the author asked for nothing here, and the
      // accepted Space is the right answer. It is still an Edit that completed
      // and then vanished, and nothing else in a running app would ever say so.
      if (discardedAsReplaced > 0) {
        safelyReport(
          new Error(
            `SpaceAuthoring discarded ${discardedAsReplaced} queued completion(s) written against a replaced Space.`,
          ),
        );
      }
      return result;
    } finally {
      completing = false;
      // Empty on the ordinary path, since the drain above ran it down. Anything
      // still here was enqueued by an observer and then abandoned by a throw
      // partway through the drain: those Edits are gone, and saying so is the
      // difference between a readable failure and a silent one.
      const discarded = queued.length;
      queued.length = 0;
      if (discarded > 0) {
        safelyReport(
          new Error(`SpaceAuthoring discarded ${discarded} queued completion(s) after a failure.`),
        );
      }
    }
  };

  /**
   * Validate the stored snapshot *before* handing it to the session. Accepting
   * first and checking after published an unloadable snapshot as settled working
   * state, so the conflict that could still have been resolved was gone. And the
   * check cannot report by throwing: the caller is an `onClick` handler, which
   * React error boundaries do not catch, so the throw escaped to the window
   * leaving the stale Space on screen.
   *
   * Refusing changes nothing — local work, conflict and every control survive —
   * so it answers with the reason and leaves the Space alone. The caller
   * shows it; taking the page down over a refusal would remove the author's
   * unsaved work to explain why it could not be replaced.
   *
   * Accepting is an edit to this Authoring rather than a new one: the session,
   * the placement and Navigation are all replaced in place, and the replacement
   * epoch advancing is what tells the renderer its nodes describe a Space that
   * is gone.
   */
  const acceptStoredSpace = (): string | null => {
    const { persistence } = session.getState();
    if (persistence.kind !== 'conflicted') return null;
    // The stored side is the newer Space when the conflict named this one, and
    // otherwise the baseline it reverts to — a coordinated edit that did not
    // commit leaves the baseline as what is stored. Only a Space the conflict
    // named and reported gone has neither, and keeping local work is its
    // recovery rather than this one.
    const stored = persistence.current?.snapshot ?? persistence.baseline;
    if (stored === undefined) {
      return 'This Space was deleted while the coordinated edit was saving. Keep your local version to restore it.';
    }
    const accepted = loadSpaceSnapshot(stored);
    if (!accepted.ok) {
      return `The remote space is invalid and was not accepted:\n${accepted.errors
        .map((error) => `  - ${error.message}`)
        .join('\n')}`;
    }
    const selection = defaultLayout(accepted.space);
    const resolved = resolveRenderer(accepted.space, selection);
    const acceptedPlacement = Placement.fromLayout(resolved.resolvedLayout.layout);
    installTogether(() => {
      session.acceptRemote();
      install(acceptedPlacement);
      navigation.openFresh(selection);
      replacementEpoch += 1;
    });
    return null;
  };

  return {
    getState: observable.getState,
    authoredPlacement: () => mergeBase(),
    subscribe: observable.subscribe,
    reportRendered,
    replacePlacement: install,
    edgeEligibility,
    complete,
    retryPersistence: session.retry,
    // Read at the moment the author asks, never captured earlier. `session`
    // ignores the call outside a conflict, so there is nothing to check here.
    keepLocalWork: () => session.resolveConflict(session.getState().working),
    acceptStoredSpace,
    dispose: () => {
      unsubscribeSession();
      unsubscribeNavigation();
      observable.clearSubscribers();
    },
  };
}
