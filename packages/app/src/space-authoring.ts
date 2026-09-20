import {
  type ThingDocument,
  type ThingId,
  type ThingPlacement,
  COLLAPSED_THING_SIZE,
  DEFAULT_OPEN_SIZE,
  DEFAULT_SPACE_THING_OPEN_SIZE,
  type Graph,
  type GraphEdge,
  type GraphId,
  type DiagramId,
  type DiagramPosition,
  THING_TITLE_REQUIRED,
  normalizeTitle,
  type SpaceSnapshot,
  titleName,
  type UUID,
} from '@project/core';
import {
  loadSpaceSnapshot,
  Placement,
  type ResolvedDiagram,
  type Space,
  type SpaceError,
} from '@project/graph';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type SpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import { nextGraphColor } from './colors';
import { diagramShowsGraph } from './navigation';
import type { Navigation, NavigationState } from './navigation';
import {
  updatePositionedDiagram,
  withThingRemovedFromDiagrams,
  withoutIncidentEdges,
} from './snapshot';
import { nextThingTitle, nextGraphTitle, nextDiagramTitle } from './titles';
import { requireDefaultDiagram, resolveDiagram } from './diagram-resolution';

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
 * endpoint to the Thing it came from is eligible rather than looking like an
 * Edge that already exists.
 *
 * `create-and-connect` names no target because the Option/Alt empty drop has
 * none yet (ADR 0033); the Thing it would author is minted by the Edit.
 */
export type EdgeProposal =
  | { readonly kind: 'connect'; readonly from: ThingId; readonly to: ThingId }
  | { readonly kind: 'create-and-connect'; readonly from: ThingId }
  | {
      readonly kind: 'reconnect';
      readonly graphId: GraphId;
      readonly edge: GraphEdge;
      readonly endpoint: EdgeEndpoint;
      readonly thingId: ThingId;
    };

/**
 * Whether a proposal may be offered, and why not.
 *
 * Two states rather than three: a reconnect returning an endpoint to its
 * original Thing is **eligible**, and settles as `unchanged` when it completes.
 * Eligibility answers what the author may still do, not what the Edit will
 * turn out to have changed — a picker that greyed out the Thing an endpoint
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
 * whole derivation of the next Space happen on this side of the seam.
 * `settled-thing-movement` alone carries geometry — the moved Things' own drop
 * points — because a pointer gesture is the only input that knows where React
 * Flow drew them; every other kind is written against the Diagram the Edit
 * derives against.
 */
export type AuthoringCompletion =
  | { readonly kind: 'created-diagram' }
  | {
      readonly kind: 'settled-thing-movement';
      /**
       * The moved Things' drop points, exactly. Applied over the Diagram's own
       * positions at derivation — drain time for a queued completion — rather
       * than merged here, so a drag that queues behind another Edit lands
       * against the Diagram as it stands when it is finally derived, not the
       * one that was current when the gesture settled.
       */
      readonly moved: ReadonlyMap<ThingId, DiagramPosition>;
    }
  | { readonly kind: 'opened-thing'; readonly thingId: ThingId }
  | { readonly kind: 'closed-thing'; readonly thingId: ThingId }
  | {
      readonly kind: 'resized-thing';
      readonly thingId: ThingId;
      readonly size: { readonly width: number; readonly height: number };
    }
  | {
      readonly kind: 'connected-things';
      readonly from: ThingId;
      readonly to: ThingId;
      /**
       * The Graph this Edge joins. Host canvas omits it and writes the Active
       * Graph. A Space Thing names the Graph it is showing.
       */
      readonly graphId?: GraphId;
    }
  | {
      readonly kind: 'edited-thing';
      readonly thingId: ThingId;
      readonly document: ThingDocument;
    }
  | {
      readonly kind: 'create-and-connect';
      readonly from: ThingId;
      readonly position: DiagramPosition;
    }
  /** Add Thing: a detached Markdown Thing at the visible centre, neutrally titled. */
  | { readonly kind: 'created-thing'; readonly anchor: DiagramPosition }
  /**
   * Add Reference Thing: created only once its Target is chosen, because a Reference Thing without
   * one is not a valid Thing. An empty title mints `Thing N` like any other Thing
   * rather than copying the Target's, which is what stopped two Things arriving
   * with one name (ADR 0083 refines ADR 0046).
   */
  | {
      readonly kind: 'created-reference';
      readonly target: ThingId;
      readonly title?: string;
      readonly anchor: DiagramPosition;
    }
  /** Add to Diagram: membership and a first position for a Thing already in the Space. */
  | {
      readonly kind: 'added-thing-to-diagram';
      readonly thingId: ThingId;
      readonly anchor: DiagramPosition;
    }
  /** Remove from Diagram: membership, position and incident Edges, in this Diagram only. */
  | { readonly kind: 'removed-thing-from-diagram'; readonly thingId: ThingId }
  /** Delete Thing from Space: the same removal, cascaded through every Diagram. */
  | { readonly kind: 'deleted-thing'; readonly thingId: ThingId }
  | { readonly kind: 'renamed-diagram'; readonly diagramId: UUID; readonly title: string }
  | { readonly kind: 'deleted-diagram'; readonly diagramId: UUID }
  /**
   * Rename Space: the one Edit on the Space document *above* any Diagram.
   *
   * It writes `document.title` and nothing else. No Space Thing pointing at this
   * Space changes with it — a Space's name and the Title of a Thing that
   * references it are two stored values that agree only at creation, and ADR
   * 0083 keeps the target's name off the Thing's front, so nothing in another
   * Space draws what this writes.
   *
   * Derived beside `created-diagram` and `deleted-diagram`, ahead of the general
   * per-Diagram path below: all three write keys of `document` directly, read
   * `session.getState().working` themselves, and still owe `CompletedEdit` a
   * Diagram and Active Graph to continue in even though this one changes
   * neither. It resolves the selected Diagram only for that pair.
   *
   * The shape rejected for it was parallel to `renamed-diagram`, below the
   * general path: a `DiagramRequiredOperation` answer and a Diagram lookup for
   * an Edit that touches no Diagram, both wrong about what this Edit is.
   */
  | { readonly kind: 'renamed-space'; readonly title: string }
  | { readonly kind: 'added-graph' }
  | { readonly kind: 'renamed-graph'; readonly graphId: GraphId; readonly title: string }
  | { readonly kind: 'recolored-graph'; readonly graphId: GraphId; readonly color: string }
  | { readonly kind: 'deleted-graph'; readonly graphId: GraphId }
  | {
      readonly kind: 'reconnected-edge';
      readonly graphId: GraphId;
      readonly edge: GraphEdge;
      readonly endpoint: EdgeEndpoint;
      readonly thingId: ThingId;
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
      readonly createdThingId?: ThingId;
      readonly createdGraphId?: GraphId;
    }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: AuthoringRefusal }
  | { readonly kind: 'queued' };

type DiagramRequiredOperation = Extract<
  AuthoringCompletion,
  | { readonly kind: 'added-thing-to-diagram' }
  | { readonly kind: 'removed-thing-from-diagram' }
  | { readonly kind: 'opened-thing' }
  | { readonly kind: 'closed-thing' }
  | { readonly kind: 'resized-thing' }
  | { readonly kind: 'renamed-diagram' }
  | { readonly kind: 'renamed-graph' }
  | { readonly kind: 'recolored-graph' }
  | { readonly kind: 'deleted-graph' }
  | { readonly kind: 'reconnected-edge' }
  | { readonly kind: 'deleted-edge' }
>['kind'];

/**
 * Why accepting the stored side of a conflict was refused.
 *
 * Separate from `AuthoringRefusal` because it refuses an operation on the
 * *session* rather than an authored Edit, and neither surface that presents one
 * presents the other. Both are the same rule (ADR 0057): the code crosses the
 * seam and the application writes the sentence.
 *
 * `stored-space-invalid` carries `loadSpace`'s errors as typed context rather
 * than a joined string, so what the author is shown — and how much of it — is
 * the application's decision rather than intake's.
 */
export type StoredSpaceRefusal =
  | { readonly code: 'stored-space-deleted' }
  | { readonly code: 'stored-space-invalid'; readonly errors: readonly SpaceError[] };

/** Stable identities for every expected refusal at the Authoring seam. */
export type AuthoringRefusal =
  | { readonly code: 'diagram-not-found' }
  | { readonly code: 'diagram-required'; readonly operation: DiagramRequiredOperation }
  | { readonly code: 'thing-not-found' }
  | { readonly code: 'thing-kind-immutable' }
  | { readonly code: 'reference-target-immutable' }
  | { readonly code: 'space-thing-target-immutable' }
  | { readonly code: 'space-thing-deletion-unsupported' }
  // The one code here the domain owns rather than this module: `@project/core`
  // raises it from the Thing schema, so both ends spell it from one constant.
  | { readonly code: typeof THING_TITLE_REQUIRED }
  | { readonly code: 'diagram-title-required' }
  /**
   * Rename Space with nothing left after the trim. `spaceFileSchema` declares
   * the title as `z.string().min(1)`, which counts characters, so blank is the
   * empty case wearing different bytes and only this Edit can refuse it.
   */
  | { readonly code: 'space-title-required' }
  | { readonly code: 'space-must-keep-diagram' }
  | { readonly code: 'reference-target-not-found'; readonly targetId: ThingId }
  | { readonly code: 'reference-target-must-own-content'; readonly targetId: ThingId }
  | { readonly code: 'thing-already-in-diagram' }
  | { readonly code: 'thing-not-in-diagram' }
  | { readonly code: 'thing-not-expanded' }
  | {
      readonly code: 'thing-has-references';
      /** The Reference Things by **name**, which is what a sentence listing Things says (ADR 0083). */
      readonly referenceTitles: readonly string[];
    }
  | { readonly code: 'graph-title-required' }
  | { readonly code: 'diagram-must-keep-graph' }
  | { readonly code: 'graph-not-owned' }
  | { readonly code: 'edge-not-found' }
  | { readonly code: 'edge-thing-outside-diagram' }
  | { readonly code: 'edge-already-exists' }
  | { readonly code: 'diagram-active-graph-required' };

/**
 * The published state: what the collaborators say, plus the one fact only
 * Authoring knows — that a replacement Space has been opened over them.
 *
 * Placement is absent because Authoring holds none: every Edit derives it
 * fresh, from the Diagram it is writing, at the moment it derives. A caller
 * that wants the selected Diagram's current placement reads it the same way —
 * `Placement.fromDiagram` over the Diagram Navigation names.
 */
export interface SpaceAuthoringState {
  /**
   * ADR 0042's replacement signal: advances when a replacement Space is opened
   * over this Authoring without recreating it, and at no other time. Retry,
   * Keep local, persistence status changes, Diagram selection and completed
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
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * The selected Diagram's own placement, derived fresh from the working
   * snapshot.
   *
   * Not published state — every reader that wants it asks at the point of use,
   * the same way a completed Edit derives its own. The render adapter's resize
   * seed is the one caller outside this module.
   */
  readonly diagramPlacement: () => Placement;
  /**
   * Whether an Edge gesture may be offered as things stand, and why not.
   *
   * The one eligibility query for every Edge path — connect, create-and-connect
   * and reconnect — asked by the live preview, by React Flow's
   * `isValidConnection` during a drag, and by a picker deciding which Things to
   * disable. Completion validates the same proposal again, because the Space can
   * change while a preview or a picker is open.
   */
  readonly edgeEligibility: (proposal: EdgeProposal) => EdgeEligibility;
  readonly complete: (completion: AuthoringCompletion) => AuthoringResult;
  /**
   * Author the explicitly addressed Diagram without switching this Space's canvas.
   * Deleting its visible Active Graph advances that selection to a survivor.
   */
  readonly completeInDiagram: (
    diagramId: UUID,
    completion: EmbeddedThingCompletion | EmbeddedContextCompletion,
  ) => AuthoringResult;
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
  readonly acceptStoredSpace: () => StoredSpaceRefusal | null;
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
  /** The Diagram this Edit wrote, which Navigation continues in. */
  readonly nextDiagramId: DiagramId;
  /**
   * The Active Graph of that Diagram, which Navigation adopts along with it.
   *
   * Under ADR 0040 a Diagram owns its Graphs, so which one is active is a fact
   * about the Diagram this Edit wrote and not a separate consequence.
   */
  readonly nextActiveGraphId: GraphId | null;
  readonly createdThingId?: ThingId;
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
  readonly embeddedDiagramId?: UUID | undefined;
}

export type EmbeddedThingCompletion = Extract<
  AuthoringCompletion,
  {
    kind:
      | 'opened-thing'
      | 'closed-thing'
      | 'resized-thing'
      | 'edited-thing'
      | 'settled-thing-movement'
      | 'removed-thing-from-diagram'
      | 'connected-things';
  }
>;

/** Commands addressed to the Diagram shown by a Space Thing. */
export type EmbeddedContextCompletion = Extract<
  AuthoringCompletion,
  {
    kind: 'renamed-diagram' | 'added-graph' | 'renamed-graph' | 'recolored-graph' | 'deleted-graph';
  }
>;

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
   * The same reader Navigation is given, so both resolve a Diagram against one
   * `Space` identity and one parse — and both read entity context through that
   * Space's own `lookup`.
   */
  readonly currentSpace: () => Space;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
  /**
   * Mints the identity of every Thing, Diagram and Graph a completed Edit creates.
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
   * comment claims: minting from the ambient CSPRNG was the one source of nondeterminism left in
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

/** The Things a snapshot carries, in the shape a snapshot carries them. */
type SnapshotThings = SpaceSnapshot['things'];

/**
 * How far a Thing creation steps when the anchor it was given is taken, and in
 * which direction.
 *
 * A visible stack rather than collision avoidance: existing Things never move,
 * and partial overlap of the 260×146 Front is deliberate. Only an *exact*
 * anchor collision steps, which is what a repeated centre-add produces and a
 * pointer drop essentially never does.
 */
const STACK_STEP = 24;

const freeAnchor = (placement: Placement, anchor: DiagramPosition): DiagramPosition => {
  const taken = new Set([...placement.values()].map(({ x, y }) => `${x},${y}`));
  let at = anchor;
  // Terminates: each step is a distinct point on one diagonal, and the taken
  // set is finite, so at most one step per placed Thing can be occupied.
  for (let step = 1; taken.has(`${at.x},${at.y}`); step += 1) {
    at = { x: anchor.x + STACK_STEP * step, y: anchor.y + STACK_STEP * step };
  }
  return at;
};

/**
 * A width and a height together: an Open Size, the collapsed constant, or the
 * difference between two growths. Local, and shaped as `Placement.growth`'s own
 * parameter is, because none of the three is a domain entity.
 */
type Extent = { readonly width: number; readonly height: number };

/**
 * The room a Thing's neighbours gain when its rect goes from one Open Size to
 * another: the difference between the two growths, per axis (ADR 0084).
 *
 * Resize's alone. Close hands its whole growth back rather than a difference,
 * and says so in one place — `Placement.reclaim` — which is where a Thing that
 * leaves a Diagram and a Thing deleted from the Space say it too.
 *
 * Negative on an axis the Thing shrank on, which is legitimate and is the whole
 * of a shrinking Resize. It is **not** the involution the Open/Close pair is,
 * and the bound `Placement.growth` documents does not extend to it: a negative
 * room reverses a growth only for the Things that growth was applied to, and a
 * Thing the author placed clear of the subject *after* the Open was never one of
 * them. Such a Thing can be carried back inside the subject — subject Open at
 * `x = 0`, a Thing dropped at `x = 260`, a shrink of 200 — and growing back skips
 * it as no longer clear, so it keeps the 200. That is the same memorylessness
 * ADR 0084 chose for Close, which reclaims from every Thing currently clear of the
 * closing Thing including the ones the author moved there; remembering which
 * Things a growth actually pushed is the per-Thing history the ADR rejected.
 */
const roomBetween = (from: Extent, to: Extent): Extent => {
  const before = Placement.growth(from);
  const after = Placement.growth(to);
  return { width: after.width - before.width, height: after.height - before.height };
};

/**
 * The placement after a Thing's own entry changes and the room it holds changes
 * with it: one Edit, and the whole of displacement at the Edit (ADR 0084).
 *
 * **Order.** The entry is written first and the displacement runs over the
 * result. The coordinates are the same either way, because `displace` compares
 * every neighbour against the *subject's* `x`/`y` and neither writing the entry
 * nor displacing moves the subject. But `place` and `displace` each answer a
 * new map, so one of them has to be second, and it must be the one that has to
 * see the whole map — the displacement. Writing the entry first also settles
 * what `displace` needs in order to do anything at all: it answers the
 * placement unchanged for a subject the map does not hold, and after `place`
 * the subject is certainly held.
 */
const withRoomFor = (
  placement: Placement,
  thingId: ThingId,
  at: ThingPlacement,
  room: Extent,
): Placement => Placement.displace(Placement.place(placement, thingId, at), thingId, room);

/**
 * The placement after a Thing Closes: Closed on its own entry, and the room it
 * held given back by `Placement.reclaim`.
 *
 * Both ways a Thing closes end here — the Close completion, and a resize
 * proposal the magnet has taken to the collapsed size (ADR 0066) — so this
 * Diagram's two Close gestures reach the shared rule through one line rather
 * than each restating it. That matters most for the magnetic one, which is
 * where a restatement would reclaim the collapsed proposal's zero growth
 * instead of the growth of the size the Thing was actually Open at.
 *
 * The reclaim runs first and the Closed entry is written over the result,
 * because `Placement.reclaim` reads the Open Size off the entry it is given and
 * a Closed entry no longer holds any room. The coordinates do not depend on the
 * order — `displace` moves every Thing against the subject's own `x`/`y`, and
 * neither step moves the subject — so this is about what each step can still
 * see, not about where anything lands. The remembered Open Size rides through
 * untouched (ADR 0066), which is what makes the next Open apply exactly what
 * this gives back.
 */
const closedThing = (
  placement: Placement,
  thingId: ThingId,
  at: Extract<ThingPlacement, { readonly open: true }>,
): Placement =>
  Placement.place(Placement.reclaim(placement, thingId), thingId, { ...at, open: false });

/**
 * The placement after a Thing leaves this Diagram, with the room it held given
 * back.
 *
 * Leaving is a Close the Thing does not come back from, so it reclaims exactly
 * as {@link closedThing} does — and it has to, because the room is no longer
 * derived from the Thing's own entry. Under the derivation ADR 0084 removed,
 * dropping the entry dropped the displacement with it; now the room is written
 * into the neighbours' own coordinates, and a removal that only drops the entry
 * leaves a hole with nothing on the canvas left to explain it and no Edit that
 * can give it back.
 *
 * The reclaim runs **before** the removal, because `Placement.reclaim` reads
 * the Thing's own entry — after `Placement.remove` there is neither an Open Size
 * to read nor a subject to compare the neighbours against.
 *
 * Two of the three ways a Thing leaves end here — `removed-thing-from-diagram`,
 * and the deletion applied with the other membership changes below — and both
 * of those write *this* Diagram. The third is the same deletion cascading into
 * every other Diagram, which no single-Diagram write can reach;
 * `withThingRemovedFromDiagrams` performs it, and reaches the same rule through
 * `Placement.reclaim` rather than through this function.
 */
const removedThing = (placement: Placement, thingId: ThingId): Placement =>
  Placement.remove(Placement.reclaim(placement, thingId), thingId);

/** Two Edges are the same Edge when they join the same Things the same way (ADR 0032). */
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
 * membership**, because a Thing that is already this Edge's endpoint is by
 * definition in this Diagram, and asking the placement first would refuse a
 * dragged endpoint dropped back where it started on a Diagram still arranging.
 */
const reconnectOutcome = (
  graph: Graph | undefined,
  proposal: {
    readonly graphId: GraphId;
    readonly edge: GraphEdge;
    readonly endpoint: EdgeEndpoint;
    readonly thingId: ThingId;
  },
  placement: Placement,
  /**
   * Whether the Space still holds the Thing, which the placement does not answer.
   *
   * The same second condition `connectable` applies to a connection, and the
   * asymmetry was a latent trap rather than a nicety: an Edge naming a Thing the
   * Space has lost derives a snapshot intake rejects, and this derivation answers
   * an unloadable Space by *throwing* — putting a defect in front of the author
   * as their own mistake. A picker open across such a deletion is the way there.
   */
  holdsThing: (thingId: ThingId) => boolean,
): ReconnectOutcome => {
  // Ownership, not existence: a Graph a *second* Diagram owns exists and is
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
      ? { from: proposal.thingId, to: proposal.edge.to }
      : { from: proposal.edge.from, to: proposal.thingId };
  if (sameEdge(proposal.edge, reconnected)) return UNCHANGED;
  // Checked together and after `unchanged`, so an endpoint returned to its own
  // Thing is still eligible on a Diagram that has not finished arranging.
  if (!placement.has(proposal.thingId) || !holdsThing(proposal.thingId)) {
    return { kind: 'refused', refusal: { code: 'edge-thing-outside-diagram' } };
  }
  if (indexOfEdge(graph.edges, reconnected) !== -1) {
    return { kind: 'refused', refusal: { code: 'edge-already-exists' } };
  }
  return { kind: 'edge', edge: reconnected };
};

/**
 * Why a Thing document's Reference Thing Target may not be authored, or `null`.
 *
 * This is the creation-time rule for choosing a Reference Thing Target. Existing Reference Thing
 * Targets are immutable and are refused before this validation is reached. It
 * duplicates what `validateReferences` already enforces, and deliberately:
 * intake reports by failing the whole snapshot, which this derivation answers
 * by throwing, and an author choosing the wrong Target has made a mistake that
 * deserves a sentence rather than an exception. A markdown document has no
 * Target and nothing to refuse.
 */
const referenceTargetRefusal = (space: Space, document: ThingDocument): AuthoringRefusal | null => {
  if (document.kind !== 'reference') return null;
  const target = space.lookup.thing(document.target);
  if (target === undefined)
    return { code: 'reference-target-not-found', targetId: document.target };
  // Reference Thing resolution ends after one Thing reference, including a Space Thing.
  if (target.kind === 'reference') {
    return { code: 'reference-target-must-own-content', targetId: document.target };
  }
  return null;
};

/**
 * A Thing an Edit is creating, held rather than placed.
 *
 * Its position waits here until the complete next Diagram is assembled.
 */
interface CreatedThing {
  readonly id: ThingId;
  readonly position: DiagramPosition;
  /**
   * Step off a position another Thing already occupies exactly. A gesture that
   * dropped on empty canvas aimed at its point and keeps it; a Thing created from
   * a menu has no aimed-at point and would otherwise stack.
   */
  readonly avoidingOverlap: boolean;
}

/** The Reference Things pointing at a Thing, which are what block deleting it from the Space. */
const incomingReferences = (things: SnapshotThings, thingId: ThingId): SnapshotThings =>
  things.filter(
    (thing) => thing.document.kind === 'reference' && thing.document.target === thingId,
  );

/**
 * A single-line title normalized for authorship, or `null` when it has no name.
 *
 * Spaces, Diagrams and Graphs. Their titles are single-line by ADR 0083, so the
 * whole string is one line and trimming it is the whole rule. A Thing's Title is
 * Title Lines and normalizes by a rule of its own — {@link namedThingTitle}.
 */
const trimmedNonBlankTitle = (title: string): string | null => {
  const trimmed = title.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * A Thing Title normalized as the schema normalizes it, or `null` when it
 * carries no name.
 *
 * `normalizeTitle` and not `trim()`, because on a Title of more than one line
 * the two give different answers: a whole-string trim cannot reach the trailing
 * whitespace on an interior line, and it strips a first line's leading
 * whitespace, which ADR 0083 says is that line's own. A write path that
 * disagreed with the parse boundary would store a Thing whose Title differs from
 * the one intake mints from the same bytes — derived state disagreeing with the
 * code that derives it, which this repo fixes at the source.
 */
const namedThingTitle = (title: string): string | null => {
  const normalized = normalizeTitle(title);
  return normalized.length === 0 ? null : normalized;
};

/**
 * Structural equality over the JSON values a snapshot is built from.
 *
 * Serializing both sides and comparing the text was the same answer only when
 * the two agreed on key order, and nothing promises that: a snapshot loaded
 * from the database or an import carries whatever order it was written in,
 * while a completed Edit rebuilds each Diagram in the writer's order. A
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
  reportObserverError = (error) => console.error('SpaceAuthoring observer failed', error),
  newId,
}: SpaceAuthoringDependencies): SpaceAuthoring {
  let replacementEpoch = 0;
  let installing = 0;

  const selectedResolvedDiagram = (): ResolvedDiagram =>
    resolveDiagram(currentSpace(), navigation.getState().selectedDiagramId);

  const diagramPlacement = (): Placement =>
    Placement.fromDiagram(selectedResolvedDiagram().diagram);

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

  /**
   * Bring Navigation back in step with a working snapshot this module did not
   * write.
   *
   * Placement needs no sibling repair: it is derived fresh from the Diagram at
   * every read, so a snapshot this module did not write already answers it.
   * Navigation's own selection, though, is state that has to be moved back in
   * step deliberately. Every other replacement of the working snapshot answers
   * the selection as it
   * installs — a completed Edit resolves the Diagram and its Active Graph before
   * `continueInDiagram`, and `acceptStoredSpace` re-opens Navigation on the
   * Space it accepted. The coordinated Space Thing lifecycle is the exception:
   * its recovery restores *every participant's* snapshot
   * (`session-registry.ts`), and only the Space whose conflict the author
   * answered had a `SpaceAuthoring` to re-open. A second open Space rolled back
   * past structure it held locally went on naming that structure, and nothing
   * corrected it.
   *
   * **Both halves of the selection, because a recovery can take either.** A
   * restore past a locally added Graph leaves the Active Graph naming a Graph
   * the Diagram no longer owns, which made the Dock command a Graph the canvas
   * was not drawing as active. A restore past a locally *created* Diagram leaves
   * the selection itself dangling, and that one is worse: the Space still loads,
   * so `resolveDiagram` throws `DiagramNotFoundError` for a Space with nothing
   * wrong with it and `SpaceApp` draws the failure surface. One repair answers
   * both, because `selectDiagram` resolves the pair.
   *
   * **Re-resolving here is not the repair `continueInDiagram` refuses.** That
   * call declines to invent an Active Graph because its caller states one and is
   * held to it, and because inventing one would interrupt a traversal of the
   * Graph that was active. Neither holds here: no caller stated anything — the
   * Space was replaced out from under this one — and the structure the traversal
   * belonged to is the structure that is gone. `selectDiagram` is what says so,
   * the same operation an author spends to land on a Diagram's own Active Graph,
   * and it drops out of presentation because there is nothing left to present.
   * An absent Active Graph is exempt, as it is there: it names nothing, so there
   * is nothing about it to be stale.
   *
   * Membership is asked of `diagramShowsGraph` and of the Space's own index
   * rather than decided again, which is the rule that function's own comment
   * states. Nothing here resolves through a throw: a dangling selection is the
   * case being repaired, so raising and catching it to find that out would be
   * control flow dressed as an error.
   */
  const reconcileNavigation = (): void => {
    /*
     * A snapshot that no longer passes intake is `SpaceAppFailure`'s to report,
     * exactly as it is below — and the throw this catches is intake's rather
     * than a selection's, which is why the selection is then read off the
     * Space's index instead of resolved.
     */
    let space: Space;
    try {
      space = currentSpace();
    } catch {
      return;
    }
    const { selectedDiagramId, activeGraphId } = navigation.getState();
    const selected = space.lookup.diagram(selectedDiagramId);
    if (selected === undefined) {
      // The Diagram is gone, so its Active Graph is not worth asking about. A
      // Space whose own opening selection does not resolve either is the bug
      // `requireDefaultDiagram` documents rather than a state to repair, so it
      // is left for the surface to report.
      const opening = space.defaultDiagram;
      if (opening !== undefined && space.lookup.diagram(opening) !== undefined) {
        navigation.selectDiagram(opening);
      }
      return;
    }
    if (activeGraphId === null || diagramShowsGraph(selected, activeGraphId)) return;
    navigation.selectDiagram(selectedDiagramId);
  };

  /**
   * One publication for a working snapshot this module did not write.
   *
   * `reconcileNavigation` writes through Navigation, whose own subscription
   * would otherwise publish on its own — `installTogether` is what keeps that
   * suppressed and answers with exactly one publication regardless of whether
   * a repair actually ran, since the session changed either way and every
   * subscriber reads `SpaceAuthoringState.session` off this publication too.
   */
  const unsubscribeSession = session.subscribe(() => {
    if (installing !== 0) return;
    installTogether(() => {
      reconcileNavigation();
    });
  });

  const unsubscribeNavigation = navigation.subscribe(() => {
    if (installing === 0) publish();
  });

  /**
   * The Graph a Diagram-owned Edge operation names, or `undefined` when the
   * selected Diagram is not the one that owns it.
   *
   * Asked of `space.lookup.graph`, which answers a Graph *with its owner* — the
   * index built for exactly this question (ADR 0040), and O(1) rather than a
   * walk over one Diagram's Graphs. Comparing the owner's id is what keeps this
   * ownership rather than existence: a Graph a second Diagram owns resolves here
   * and is still not one this Edit may write. Graph ids are unique across the
   * Space (ADR 0045), so there is no second Graph the id could have meant.
   */
  const ownedGraph = (graphId: GraphId): Graph | undefined => {
    const selectedDiagram = selectedResolvedDiagram();
    const owned = currentSpace().lookup.graph(graphId);
    return owned?.owner.diagram.id === selectedDiagram.diagram.id ? owned.graph : undefined;
  };

  /**
   * The Graph a connection drawn right now would land in, or `null` when no
   * selected Diagram owns one.
   *
   * A Diagram the Space no longer holds answers `null` too: it names no Graph,
   * and the completion that follows refuses for that reason rather than this one.
   */
  const targetGraph = (): Graph | null => {
    const { activeGraphId } = navigation.getState();
    return activeGraphId === null ? null : (ownedGraph(activeGraphId) ?? null);
  };

  /**
   * Whether a Thing is one an Edge this gesture authors may name at all.
   *
   * Two conditions, and the second is ADR 0040's closure read forwards. A Thing
   * of the Space is not necessarily a Thing of the Diagram the Edit writes: a
   * Diagram's members **are** its position keys, and the completed placement is
   * what those keys are about to become. An Edge naming a Thing outside it
   * derives a Space intake rejects, and `deriveCompletedEdit` answers an
   * unloadable Space by throwing — right for a bug, wrong for an eligibility
   * query. Refusing here keeps the interaction boundary closed over the Diagram
   * even if a stale caller names a Thing outside it.
   *
   * `members` is the Diagram's own placement, and every caller reads it fresh —
   * so a preview and the completed Edit it previews can still disagree when the
   * Space changed between them, which is why completion asks this again rather
   * than trusting the preview's answer.
   */
  const connectable = (thingId: ThingId, members: Placement): boolean =>
    members.has(thingId) && session.getState().working.things.some((thing) => thing.id === thingId);

  /**
   * Why an Edge this gesture would author cannot be authored, or `null`.
   *
   * One answer for the live preview, the release and the completed Edit, so a
   * gesture the canvas offers cannot be one the completion silently drops — and
   * the completion says *which* rule it hit, which a boolean could not.
   * `to === null` is the Option/Alt empty drop, whose target Thing does not exist
   * yet (ADR 0033).
   *
   * An exact duplicate within one Graph is what intake rejects (ADR 0032), so it
   * can only be a duplicate of an Edge in the Graph the Edge is about to join.
   * A created Thing cannot duplicate anything, which is why the callers differ.
   *
   * `members` and `graph` are the Diagram and Graph this Edit writes, and every
   * caller supplies `members` explicitly — the selected Diagram's own placement
   * for a preview, the in-progress `completedPlacement` for an Edit already
   * assembling one. `graph` alone keeps a default, the Active Graph through
   * `targetGraph()`, because the host canvas is the one caller that never names
   * a Graph of its own; a Space Thing names the Graph it is showing.
   */
  const connectRefusal = (
    from: ThingId,
    to: ThingId | null,
    members: Placement,
    graph: Graph | null = targetGraph(),
  ): AuthoringRefusal | null => {
    if (!connectable(from, members) || (to !== null && !connectable(to, members))) {
      return { code: 'edge-thing-outside-diagram' };
    }
    if (graph === null) return { code: 'diagram-active-graph-required' };
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
    // The selected Diagram's own placement, read fresh — both branches ask
    // about a Graph `ownedGraph`/`targetGraph` already scope to that Diagram,
    // so this is the one Diagram either question could mean.
    const members = diagramPlacement();
    if (proposal.kind !== 'reconnect') {
      const refusal = connectRefusal(
        proposal.from,
        proposal.kind === 'connect' ? proposal.to : null,
        members,
      );
      return refusal === null ? ELIGIBLE : { kind: 'refused', refusal };
    }
    const outcome = reconnectOutcome(ownedGraph(proposal.graphId), proposal, members, (thingId) =>
      session.getState().working.things.some((thing) => thing.id === thingId),
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
   * nothing, names a Thing the Space no longer holds, or targets a Diagram that
   * has gone is simply not an Edit, and the two say which of those it was.
   * Producing an unloadable Space *is* a failure, and it throws — here, where
   * the collaborators are all still level.
   */
  const deriveCompletedEdit = ({
    completion,
    embeddedDiagramId,
  }: ReportedCompletion): DerivedCompletion => {
    const selection = embeddedDiagramId ?? navigation.getState().selectedDiagramId;
    if (completion.kind === 'created-diagram') {
      const snapshot = session.getState().working;
      const diagramId = newId();
      const graphId = newId();
      const emptyPlacement = Placement.fromEntries([]);
      const next = updatePositionedDiagram(snapshot, {
        diagramId,
        title: nextDiagramTitle(snapshot),
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
          nextActiveGraphId: graphId,
          nextDiagramId: diagramId,
        },
      };
    }
    if (completion.kind === 'deleted-diagram') {
      const snapshot = session.getState().working;
      const diagrams = snapshot.document.diagrams ?? [];
      const target = diagrams.find((diagram) => diagram.id === completion.diagramId);
      if (target === undefined) return refuse({ code: 'diagram-not-found' });
      if (diagrams.length === 1) return refuse({ code: 'space-must-keep-diagram' });
      const survivors = diagrams.filter((diagram) => diagram.id !== completion.diagramId);
      const selectedSurvives = survivors.some((diagram) => diagram.id === selection);
      const nextDiagram = selectedSurvives
        ? survivors.find((diagram) => diagram.id === selection)
        : survivors[0];
      if (nextDiagram === undefined) {
        throw new Error('Deleting a Diagram left no survivor after the last Diagram was refused.');
      }
      const next = {
        ...snapshot,
        document: {
          ...snapshot.document,
          diagrams: survivors,
          defaultDiagram:
            snapshot.document.defaultDiagram === completion.diagramId
              ? nextDiagram.id
              : snapshot.document.defaultDiagram,
        },
      };
      assertValidAuthoredSnapshot(next);
      return {
        kind: 'completed',
        edit: {
          snapshot: next,
          nextActiveGraphId: nextDiagram.activeGraph ?? nextDiagram.graphs[0]?.id ?? null,
          nextDiagramId: nextDiagram.id,
        },
      };
    }
    if (completion.kind === 'renamed-space') {
      const snapshot = session.getState().working;
      // Trimmed for the reason a Diagram's and a Graph's titles are: the schema
      // counts characters, so a title of spaces satisfies it and would store a
      // Space with no readable name.
      const title = trimmedNonBlankTitle(completion.title);
      if (title === null) return refuse({ code: 'space-title-required' });
      if (title === snapshot.document.title) return UNCHANGED;
      // The Diagram is resolved for the placement, not for permission: a Space
      // rename is legal whatever is drawing, and this Edit changes neither the
      // selection nor the Diagram it names. So the resolution happens *after*
      // the title checks rather than as the universal gate the Edits below run
      // first — a blank name is a blank name whether or not the canvas has
      // moved on, and answering with the Diagram instead would report the wrong
      // fact about the author's own keystrokes.
      //
      // `diagram-not-found` rather than a code of its own, and no
      // `diagram-required` arm: the refusal is the one the chosen shape
      // already raises, and inventing a second would make an Edit that holds
      // no Diagram say it needed one.
      const diagram = (snapshot.document.diagrams ?? []).find(
        (candidate) => candidate.id === selection,
      );
      if (diagram === undefined) return refuse({ code: 'diagram-not-found' });
      const next = { ...snapshot, document: { ...snapshot.document, title } };
      assertValidAuthoredSnapshot(next);
      return {
        kind: 'completed',
        edit: {
          snapshot: next,
          // **Navigation's Active Graph, not the Diagram's stored one.**
          //
          // Activating a Graph is not an Edit (ADR 0028), so the emphasised
          // Graph routinely differs from the `activeGraph` the Diagram stores
          // until some other Edit writes it. `created-diagram` and
          // `deleted-diagram` re-resolve legitimately, each landing the reader
          // in a *different* Diagram; this Edit changes no Diagram and no
          // selection, so re-resolving would answer a question nobody asked and
          // snap the emphasis, the Dock's Graph cluster and the product URL back
          // to the stored Graph — a rename of the Space silently activating a
          // different Graph. So this carries the current one forward, exactly as
          // the general path below does for the same reason (`navigation.ts`
          // writes out the harm at length).
          //
          // The embedded arm mirrors the one below, and it is written for that
          // reason alone. `selection` is then the embedded Diagram rather than
          // Navigation's, so Navigation's Graph may be one this Diagram does not
          // show — but nothing here reads the answer: `performCompletion`'s
          // embedded path submits and installs and never calls
          // `continueInDiagram`, so `nextActiveGraphId` is discarded whenever
          // `embeddedDiagramId` is given. The arm is consistency with the
          // general path, not a guard against anything, and no gesture reaches a
          // Space rename from an embedded Diagram in any case — the Dock's Space
          // name is not drawn inside one.
          nextActiveGraphId:
            embeddedDiagramId === undefined
              ? navigation.getState().activeGraphId
              : (diagram.activeGraph ?? diagram.graphs[0]?.id ?? null),
          nextDiagramId: diagram.id,
        },
      };
    }
    let snapshot = session.getState().working;
    const previousSnapshot = snapshot;
    const navigationState = navigation.getState();
    const space = currentSpace();
    // A selected Diagram the Space no longer holds is not an Edit. Checked before
    // resolving, because the resolver answers that case by throwing.
    //
    // Not the thing ADR 0045 forbids, which is turning a *thrown*
    // `DiagramNotFoundError` into a refusal — there is no catch here and a
    // resolver that refuses still takes the Edit down with it. This asks a
    // question of the Space instead, and the answer is an author's state rather
    // than a defect: the Diagram this gesture was aimed at is gone, so there is
    // nothing to write it into.
    if (space.lookup.diagram(selection) === undefined) {
      return refuse({ code: 'diagram-not-found' });
    }
    const resolved = resolveDiagram(space, selection);
    /**
     * What this Edit does to the placement, held rather than applied.
     *
     * Thing additions and removals wait here until the complete next Diagram is
     * assembled.
     */
    let createdThing: CreatedThing | null = null;
    let unplacedThingId: ThingId | undefined;
    let deletedThingId: ThingId | undefined;
    let connection: GraphEdge | null = null;
    // The Diagram's own placement, read fresh at derivation — the one source of
    // geometry this Edit starts from. A queued completion derives against this
    // too, at drain time rather than at the moment it was requested, which is
    // what keeps a settled drag from landing against a Diagram that has since
    // moved on.
    let completedPlacement = Placement.fromDiagram(resolved.diagram);
    // The one way a Thing is added: mint it, place it at a free anchor, append it.
    // Add Thing and Add Reference Thing differ in the document they carry and in nothing
    // else — neither creates an Edge, and neither adds a Graph to a Diagram that
    // already has one.
    // Returns rather than assigns: `createdThing` is read further down, and a
    // `let` written only from inside a closure keeps its initial narrowing.
    const createThing = (
      document: ThingDocument,
      at: DiagramPosition,
      avoidingOverlap = true,
    ): CreatedThing => {
      const id = newId();
      snapshot = { ...snapshot, things: [...snapshot.things, { id, document }] };
      return { id, position: at, avoidingOverlap };
    };
    if (completion.kind === 'edited-thing') {
      const thingIndex = snapshot.things.findIndex((thing) => thing.id === completion.thingId);
      const thing = snapshot.things[thingIndex];
      if (thing === undefined) return refuse({ code: 'thing-not-found' });
      // Kind is fixed for a Thing's lifetime, and changing it is out of scope for
      // version 1. Everything else the editor holds — a Markdown Thing's Title
      // and body, or a Reference Thing's Title and Target — is one ordinary Edit of
      // this Thing.
      if (thing.document.kind !== completion.document.kind) {
        return refuse({ code: 'thing-kind-immutable' });
      }
      if (
        thing.document.kind === 'reference' &&
        completion.document.kind === 'reference' &&
        thing.document.target !== completion.document.target
      ) {
        return refuse({ code: 'reference-target-immutable' });
      }
      if (
        thing.document.kind === 'space' &&
        completion.document.kind === 'space' &&
        thing.document.spaceId !== completion.document.spaceId
      ) {
        return refuse({ code: 'space-thing-target-immutable' });
      }
      // Normalized and refused *here* rather than only at the surface that
      // typed it. A blank title is the empty case wearing different bytes, and
      // intake answers an empty one by failing — which this derivation reports
      // by throwing, and an author's mistake may not throw. Every caller of
      // this operation is covered by one rule instead of each remembering it,
      // and that one rule is the schema's own (ADR 0083).
      const title = namedThingTitle(completion.document.title);
      if (title === null) return refuse({ code: THING_TITLE_REQUIRED });
      const document: ThingDocument = { ...completion.document, title };
      if (sameValue(thing.document, document)) return UNCHANGED;
      const refusal = referenceTargetRefusal(space, document);
      if (refusal !== null) return refuse(refusal);
      const things = [...snapshot.things];
      things[thingIndex] = { id: thing.id, document };
      snapshot = { ...snapshot, things };
    } else if (completion.kind === 'opened-thing') {
      const at = completedPlacement.get(completion.thingId);
      if (at === undefined) return refuse({ code: 'thing-not-in-diagram' });
      if (at.open) return UNCHANGED;
      // The size the Thing is actually opening at: the one it remembers, or the
      // default for its kind. The room it takes is that size's growth, so the
      // Close that reverses this reads the same number back off the entry.
      const openSize =
        at.openSize ??
        (space.lookup.thing(completion.thingId)?.kind === 'space'
          ? DEFAULT_SPACE_THING_OPEN_SIZE
          : DEFAULT_OPEN_SIZE);
      completedPlacement = withRoomFor(
        completedPlacement,
        completion.thingId,
        { ...at, open: true, openSize },
        Placement.growth(openSize),
      );
    } else if (completion.kind === 'closed-thing') {
      const at = completedPlacement.get(completion.thingId);
      if (at === undefined) return refuse({ code: 'thing-not-in-diagram' });
      if (!at.open) return UNCHANGED;
      // Read as the Diagram stands, with no record of who this Thing's Open
      // pushed: everything currently clear of it moves back, the Things the author
      // dragged there while it was open included (ADR 0084).
      completedPlacement = closedThing(completedPlacement, completion.thingId, at);
    } else if (completion.kind === 'resized-thing') {
      const at = completedPlacement.get(completion.thingId);
      if (at === undefined) return refuse({ code: 'thing-not-in-diagram' });
      if (!at.open) return refuse({ code: 'thing-not-expanded' });
      if (
        completion.size.width === COLLAPSED_THING_SIZE.width &&
        completion.size.height === COLLAPSED_THING_SIZE.height
      ) {
        // The magnetic Close (ADR 0066). It is a Close, so it takes the Close
        // path rather than restating it — reclaiming the growth of the size the
        // Thing was Open at, not the zero growth of the rect being proposed.
        completedPlacement = closedThing(completedPlacement, completion.thingId, at);
      } else if (
        at.openSize.width === completion.size.width &&
        at.openSize.height === completion.size.height
      ) {
        return UNCHANGED;
      } else {
        completedPlacement = withRoomFor(
          completedPlacement,
          completion.thingId,
          { ...at, openSize: completion.size },
          roomBetween(at.openSize, completion.size),
        );
      }
    } else if (completion.kind === 'created-thing') {
      createdThing = createThing(
        { title: nextThingTitle(snapshot), kind: 'markdown', body: '' },
        completion.anchor,
      );
    } else if (completion.kind === 'created-reference') {
      // An empty title mints the same neutral `Thing N` every other created Thing
      // gets; text the author already entered is never overwritten. `??` cannot
      // express this — the empty string is a value a caller really sends, and
      // the whole point is that it does not count as one.
      //
      // **Copying the Target's Title is now what the one caller does** (ADR 0089).
      // This arm used to carry an argument against it, from when a pane asked for
      // a name before the Edit ran: there is no pane, the Reference Thing is named after
      // its Target and renamed in place afterwards, and two Things sharing a name
      // is not a collision because a title is not an identifier (ADR 0016). What
      // stays this module's is the default and the normalization, not the choice.
      // Normalized the way a rename is, and for the same reason: creation and
      // renaming write one field, so the same typed bytes have to reach the
      // same stored document whichever path wrote them (ADR 0083).
      const entered = namedThingTitle(completion.title ?? '');
      const document: ThingDocument = {
        title: entered ?? nextThingTitle(snapshot),
        kind: 'reference',
        target: completion.target,
      };
      const refusal = referenceTargetRefusal(space, document);
      if (refusal !== null) return refuse(refusal);
      createdThing = createThing(document, completion.anchor);
    } else if (completion.kind === 'added-thing-to-diagram') {
      if (space.lookup.thing(completion.thingId) === undefined) {
        return refuse({ code: 'thing-not-found' });
      }
      if (completedPlacement.has(completion.thingId)) {
        return refuse({ code: 'thing-already-in-diagram' });
      }
      // Membership and a position, and nothing else: a re-added Thing is detached,
      // and the Edges it once had are never inferred back.
      // The anchor is taken as given: a canvas coordinate is an authored one
      // (ADR 0084).
      completedPlacement = Placement.place(
        completedPlacement,
        completion.thingId,
        freeAnchor(completedPlacement, completion.anchor),
      );
    } else if (completion.kind === 'removed-thing-from-diagram') {
      if (!completedPlacement.has(completion.thingId)) {
        return refuse({ code: 'thing-not-in-diagram' });
      }
      unplacedThingId = completion.thingId;
      completedPlacement = removedThing(completedPlacement, completion.thingId);
    } else if (completion.kind === 'deleted-thing') {
      const deleted = space.lookup.thing(completion.thingId);
      if (deleted === undefined) {
        return refuse({ code: 'thing-not-found' });
      }
      // A Space Thing owns the Space it names (ADR 0058), so deleting it deletes
      // that Space and everything below it — one coordinated multi-Space Edit,
      // which is Space Thing lifecycle through the session registry and not
      // a single-Space update this seam can make. Completing it here would store
      // a Space whose target is unreachable, and aggregate intake refuses that
      // commit permanently with the Thing already gone from the working state.
      if (deleted.kind === 'space') {
        return refuse({ code: 'space-thing-deletion-unsupported' });
      }
      // A Reference Thing whose Target vanished is not a Thing intake accepts, so the Space
      // cannot lose one out from under its Reference Things. Removing that Thing from a
      // single Diagram is never blocked this way — only deleting it outright.
      const incoming = incomingReferences(snapshot.things, completion.thingId);
      if (incoming.length > 0) {
        return refuse({
          code: 'thing-has-references',
          // Named, not Titled: the wording joins these into one sentence, and
          // a Title's later lines would break the list across it (ADR 0083).
          referenceTitles: incoming.map((reference) => titleName(reference.document.title)),
        });
      }
      // Deferred like a creation so the complete Diagram changes atomically.
      unplacedThingId = completion.thingId;
      deletedThingId = completion.thingId;
      snapshot = {
        ...snapshot,
        things: snapshot.things.filter((thing) => thing.id !== completion.thingId),
      };
    } else if (completion.kind === 'create-and-connect') {
      const refusal = connectRefusal(completion.from, null, completedPlacement);
      if (refusal !== null) return refuse(refusal);
      // The drop point is aimed at, so it is kept exactly: the gesture only
      // offers an empty-canvas release, and stepping off it would move the Thing
      // away from where the author watched the preview sit.
      createdThing = createThing(
        { title: nextThingTitle(snapshot), kind: 'markdown', body: '' },
        completion.position,
        false,
      );
      connection = { from: completion.from, to: createdThing.id };
    } else if (completion.kind === 'connected-things') {
      const named =
        completion.graphId === undefined
          ? undefined
          : currentSpace().lookup.graph(completion.graphId);
      if (completion.graphId !== undefined && named?.owner.diagram.id !== resolved.diagram.id) {
        return refuse({ code: 'graph-not-owned' });
      }
      const fallbackId = resolved.diagram.activeGraph ?? resolved.diagram.graphs[0]?.id;
      const graph =
        named?.graph ??
        (embeddedDiagramId === undefined
          ? targetGraph()
          : fallbackId === undefined
            ? null
            : (resolved.diagram.graphs.find((candidate) => candidate.id === fallbackId) ?? null));
      const refusal = connectRefusal(completion.from, completion.to, completedPlacement, graph);
      if (refusal !== null) return refuse(refusal);
      connection = { from: completion.from, to: completion.to };
    } else if (completion.kind === 'settled-thing-movement') {
      // The moved Things' drop points, merged over the Diagram's own positions
      // this Edit already started from — `Placement.next` is what keeps each
      // Thing's Open/Closed state and Open Size while overwriting `x`/`y`.
      completedPlacement = Placement.next(
        completedPlacement,
        Placement.fromEntries(completion.moved),
        [...completion.moved.keys()],
      );
    }
    // Which Diagram this Edit writes, and what it owns afterwards.
    const diagramId: UUID = resolved.diagram.id;
    let diagramTitle: string;
    let ownedGraphs: readonly Graph[];
    let activeGraphId: GraphId | null;
    let createdGraphId: GraphId | undefined;
    const { diagram } = resolved;
    diagramTitle = diagram.title;
    ownedGraphs = diagram.graphs;
    activeGraphId =
      embeddedDiagramId === undefined
        ? navigationState.activeGraphId
        : (diagram.activeGraph ?? diagram.graphs[0]?.id ?? null);
    if (completion.kind === 'renamed-diagram') {
      // Addressed by id, exactly as Rename Graph is (ADR 0040) — and the id is
      // checked because this Edit resolves its Diagram from state read *later*
      // than the gesture that named one. `deriveCompletedEdit` takes the
      // selection from `navigation.getState()` at derivation time, and three
      // things put that ahead of the id the author submitted: a completion that
      // arrived while another was completing derives off the queue rather than
      // off the press; the Dock's `IdentityName` closes over the
      // `canvas.selected.id` of its last committed render, so a selection that
      // moved this tick has not reached it yet; and an embedded Diagram Edit
      // resolves `embeddedDiagramId` rather than the selection at all, so a
      // rename aimed at the drawing Diagram names the wrong one by construction.
      // The surface guards are real and are not this one — `IdentityName` ends
      // a draft whose subject changed, `App` ends one the replacement epoch or
      // lost availability invalidated (ADR 0042) — but both end it on the
      // *next* render, and this answers the submit already in flight. So a
      // rename naming a Diagram other than the one this Edit resolves is a
      // gesture aimed at something no longer drawing — an author's state, not a
      // defect.
      if (completion.diagramId !== diagramId) return refuse({ code: 'diagram-not-found' });
      const title = trimmedNonBlankTitle(completion.title);
      if (title === null) return refuse({ code: 'diagram-title-required' });
      if (title === diagramTitle) return UNCHANGED;
      diagramTitle = title;
    }
    // Apply membership changes together to the completed Diagram.
    if (createdThing !== null) {
      // As above: the drop point is authorship, not a coordinate to convert
      // (ADR 0084).
      completedPlacement = Placement.place(
        completedPlacement,
        createdThing.id,
        createdThing.avoidingOverlap
          ? freeAnchor(completedPlacement, createdThing.position)
          : createdThing.position,
      );
    }
    if (deletedThingId !== undefined) {
      completedPlacement = removedThing(completedPlacement, deletedThingId);
    }
    if (connection !== null) {
      const writeGraphId =
        completion.kind === 'connected-things' && completion.graphId !== undefined
          ? completion.graphId
          : activeGraphId;
      const graphIndex = ownedGraphs.findIndex((graph) => graph.id === writeGraphId);
      const graph = ownedGraphs[graphIndex];
      if (graph === undefined) {
        return refuse({ code: 'diagram-active-graph-required' });
      }
      const graphs = [...ownedGraphs];
      graphs[graphIndex] = { ...graph, edges: [...graph.edges, connection] };
      ownedGraphs = graphs;
    } else if (unplacedThingId !== undefined) {
      // A Thing that has left this Diagram cannot be an endpoint of a Graph this
      // Diagram owns (ADR 0040), so its incident Edges leave with it. The Graphs
      // themselves stay, empty ones included: deletion is their own action.
      ownedGraphs = withoutIncidentEdges(ownedGraphs, unplacedThingId);
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
      // Ownership, not existence: a Graph a *second* Diagram owns exists and is
      // still not one this Edit may write (ADR 0040).
      if (graph === undefined) {
        return refuse({ code: 'graph-not-owned' });
      }
      const replacing = (next: Graph): readonly Graph[] =>
        ownedGraphs.map((existing, index) => (index === graphIndex ? next : existing));
      if (completion.kind === 'renamed-graph') {
        // Trimmed, for the reason a Thing title is: `z.string().min(1)` counts
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
        // Every Diagram resolves an Active Graph, so the last one cannot go
        // (ADR 0040). Removing its Edges is the author's way to empty it.
        if (ownedGraphs.length === 1) {
          return refuse({ code: 'diagram-must-keep-graph' });
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
        const outcome = reconnectOutcome(graph, completion, completedPlacement, (thingId) =>
          snapshot.things.some((thing) => thing.id === thingId),
        );
        if (outcome.kind !== 'edge') return outcome;
        const edgeIndex = indexOfEdge(graph.edges, completion.edge);
        // In place, so reconnecting does not reorder a Graph's Edges — that order
        // is what a branching Thing's moves are offered in (ADR 0024).
        ownedGraphs = replacing({
          ...graph,
          edges: graph.edges.map((edge, index) => (index === edgeIndex ? outcome.edge : edge)),
        });
      }
    }
    const next = updatePositionedDiagram(
      // The cascade first, then this Diagram written whole over the top of it.
      // Delete Thing from Space is one Edit over every Diagram (ADR 0040), and the
      // current one is simply the Diagram this Edit was also going to write.
      deletedThingId === undefined
        ? snapshot
        : withThingRemovedFromDiagrams(snapshot, deletedThingId),
      {
        diagramId,
        title: diagramTitle,
        positions: completedPlacement,
        graphs: ownedGraphs,
        activeGraphId,
      },
    );
    if (sameSnapshot(previousSnapshot, next)) return UNCHANGED;
    assertValidAuthoredSnapshot(next);
    const created: { createdThingId?: ThingId; createdGraphId?: GraphId } = {};
    if (createdThing !== null) created.createdThingId = createdThing.id;
    if (createdGraphId !== undefined) created.createdGraphId = createdGraphId;
    return {
      kind: 'completed',
      edit: {
        snapshot: next,
        nextActiveGraphId: activeGraphId,
        nextDiagramId: diagramId,
        ...created,
      },
    };
  };

  /**
   * Install a derived Edit: one fallible step, and then one that refuses
   * nothing this Edit produces.
   *
   * `session.submit` has to come first. `continueInDiagram` resolves the Graph
   * and the Diagram against `currentSpace()`, which reads the working snapshot
   * `submit` installs synchronously — before it, neither exists yet and it
   * would refuse. So the order is forced, and the useful consequence is that
   * the only statement here that can *fail* is also the first: a `submit` that
   * throws leaves Navigation untouched rather than half-applied.
   *
   * **The Diagram is adopted with the Active Graph that belongs to it**, in one
   * call. The Graph is resolved against the Diagram *this Edit produced* rather
   * than the one it began in — a Diagram owns its Graphs (ADR 0040), so the
   * pair is one answer, and an intermediate state where the Diagram has moved
   * and the Graph has not would name a Diagram beside a Graph some other
   * Diagram owns, which Navigation refuses.
   *
   * `continueInDiagram` refuses only a Diagram that does not draw the Active
   * Graph handed with it — which is that Diagram's own `activeGraph`, in a
   * snapshot `loadSpaceSnapshot` accepted a line earlier, and intake is
   * precisely the check that a Diagram's `activeGraph` is one it owns. A null
   * Active Graph names nothing and is exempt. Re-checking any of that *here*
   * would add a branch that cannot be taken, and this repo deletes those rather
   * than keeps them: the guard lives in Navigation because it is Navigation's
   * invariant, held against every caller, and this window is simply a caller
   * that satisfies it.
   */
  const installCompletedEdit = (edit: CompletedEdit): void => {
    installTogether(() => {
      session.submit(edit.snapshot);
      navigation.continueInDiagram(edit.nextDiagramId, edit.nextActiveGraphId);
    });
  };

  const performCompletion = (reported: ReportedCompletion): AuthoringResult => {
    const derived = deriveCompletedEdit(reported);
    // `unchanged` and `refused` are already the answer — the core and the
    // interface share one vocabulary rather than translating between two.
    if (derived.kind !== 'completed') return derived;
    const { createdThingId, createdGraphId } = derived.edit;
    if (reported.embeddedDiagramId === undefined) {
      installCompletedEdit(derived.edit);
    } else {
      const previous = session.getState().working;
      const snapshot = {
        ...derived.edit.snapshot,
        document: {
          ...derived.edit.snapshot.document,
          defaultDiagram: previous.document.defaultDiagram,
        },
      };
      installTogether(() => {
        session.submit(snapshot);
        if (navigation.getState().selectedDiagramId === reported.embeddedDiagramId) {
          // A context menu may delete the Graph the target's own canvas shows.
          // Keep its Diagram, but never leave Navigation naming a removed Graph.
          if (
            reported.completion.kind === 'deleted-graph' &&
            navigation.getState().activeGraphId === reported.completion.graphId
          ) {
            navigation.continueInDiagram(
              reported.embeddedDiagramId,
              derived.edit.nextActiveGraphId,
            );
          }
        }
      });
    }
    const created: { createdThingId?: ThingId; createdGraphId?: GraphId } = {};
    if (createdThingId !== undefined) created.createdThingId = createdThingId;
    if (createdGraphId !== undefined) created.createdGraphId = createdGraphId;
    return { kind: 'completed', ...created };
  };

  let completing = false;
  const queued: QueuedCompletion[] = [];
  const complete = (completion: AuthoringCompletion, embeddedDiagramId?: UUID): AuthoringResult => {
    if (
      embeddedDiagramId !== undefined &&
      currentSpace().lookup.diagram(embeddedDiagramId) === undefined
    ) {
      return { kind: 'refused', refusal: { code: 'diagram-not-found' } };
    }
    const reported: ReportedCompletion = { completion, embeddedDiagramId };
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
        // ADR 0042: an entry was derived from identities, positions and Thing
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
   * Accepting is an edit to this Authoring rather than a new one: the session
   * and Navigation are both replaced in place, and the replacement epoch
   * advancing is what tells the canvas its nodes describe a Space that is gone.
   */
  const acceptStoredSpace = (): StoredSpaceRefusal | null => {
    const { persistence } = session.getState();
    if (persistence.kind !== 'conflicted') return null;
    // The stored side is the newer Space when the conflict named this one, and
    // otherwise the baseline it reverts to — a coordinated edit that did not
    // commit leaves the baseline as what is stored. Only a Space the conflict
    // named and reported gone has neither, and keeping local work is its
    // recovery rather than this one.
    const stored = persistence.current?.snapshot ?? persistence.baseline;
    if (stored === undefined) {
      return { code: 'stored-space-deleted' };
    }
    const accepted = loadSpaceSnapshot(stored);
    if (!accepted.ok) {
      return { code: 'stored-space-invalid', errors: accepted.errors };
    }
    const selection = requireDefaultDiagram(accepted.space);
    installTogether(() => {
      session.acceptRemote();
      navigation.openFresh(selection);
      replacementEpoch += 1;
    });
    return null;
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    diagramPlacement,
    edgeEligibility,
    complete,
    completeInDiagram: (diagramId, completion) => complete(completion, diagramId),
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
