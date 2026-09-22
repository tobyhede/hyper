import {
  type ResourceDocument,
  type ResourceId,
  type Graph,
  type GraphEdge,
  type GraphId,
  type Map,
  type MapId,
  type MapPosition,
  RESOURCE_TITLE_REQUIRED,
  normalizeTitle,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import {
  loadSpaceSnapshot,
  Placement,
  SnapshotEdit,
  type SnapshotEditOutcome,
  type SnapshotEditRefusal,
  type ResolvedMap,
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
import { mapShowsGraph } from './navigation';
import type { Navigation, NavigationState } from './navigation';
import { updatePositionedMap } from './snapshot';
import { nextResourceTitle, nextGraphTitle, nextMapTitle } from './titles';
import { requireDefaultMap, resolveMap } from './map-resolution';

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
 * endpoint to the Resource it came from is eligible rather than looking like an
 * Edge that already exists.
 *
 * `create-and-connect` names no target because the Option/Alt empty drop has
 * none yet (ADR 0033); the Resource it would author is minted by the Edit.
 */
export type EdgeProposal =
  | { readonly kind: 'connect'; readonly from: ResourceId; readonly to: ResourceId }
  | { readonly kind: 'create-and-connect'; readonly from: ResourceId }
  | {
      readonly kind: 'reconnect';
      readonly graphId: GraphId;
      readonly edge: GraphEdge;
      readonly endpoint: EdgeEndpoint;
      readonly resourceId: ResourceId;
    };

/**
 * Whether a proposal may be offered, and why not.
 *
 * Two states rather than three: a reconnect returning an endpoint to its
 * original Resource is **eligible**, and settles as `unchanged` when it completes.
 * Eligibility answers what the author may still do, not what the Edit will
 * turn out to have changed — a picker that greyed out the Resource an endpoint
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
 * `settled-resource-movement` alone carries geometry — the moved Resources' own drop
 * points — because a pointer gesture is the only input that knows where React
 * Flow drew them; every other kind is written against the Map the Edit
 * derives against.
 */
export type AuthoringCompletion =
  | { readonly kind: 'created-map' }
  | {
      readonly kind: 'settled-resource-movement';
      /**
       * The moved Resources' drop points, exactly. Applied over the Map's own
       * positions at derivation — drain time for a queued completion — rather
       * than merged here, so a drag that queues behind another Edit lands
       * against the Map as it stands when it is finally derived, not the
       * one that was current when the gesture settled.
       */
      readonly moved: ReadonlyMap<ResourceId, MapPosition>;
    }
  | { readonly kind: 'opened-resource'; readonly resourceId: ResourceId }
  | { readonly kind: 'closed-resource'; readonly resourceId: ResourceId }
  | {
      readonly kind: 'resized-resource';
      readonly resourceId: ResourceId;
      readonly size: { readonly width: number; readonly height: number };
    }
  | {
      readonly kind: 'connected-resources';
      readonly from: ResourceId;
      readonly to: ResourceId;
      /**
       * The Graph this Edge joins. Host canvas omits it and writes the Active
       * Graph. A Space Resource names the Graph it is showing.
       */
      readonly graphId?: GraphId;
    }
  | {
      readonly kind: 'edited-resource';
      readonly resourceId: ResourceId;
      readonly document: ResourceDocument;
    }
  | {
      readonly kind: 'create-and-connect';
      readonly from: ResourceId;
      readonly position: MapPosition;
    }
  /** Add Resource: a detached Markdown Resource at the visible centre, neutrally titled. */
  | { readonly kind: 'created-resource'; readonly anchor: MapPosition }
  /**
   * Add Reference Resource: created only once its Target is chosen, because a Reference Resource without
   * one is not a valid Resource. An empty title mints `Resource N` like any other Resource
   * rather than copying the Target's, which is what stopped two Resources arriving
   * with one name (ADR 0083 refines ADR 0046).
   */
  | {
      readonly kind: 'created-reference';
      readonly target: ResourceId;
      readonly title?: string;
      readonly anchor: MapPosition;
    }
  /** Add to Map: membership and a first position for a Resource already in the Space. */
  | {
      readonly kind: 'added-resource-to-map';
      readonly resourceId: ResourceId;
      readonly anchor: MapPosition;
    }
  /** Remove from Map: membership, position and incident Edges, in this Map only. */
  | { readonly kind: 'removed-resource-from-map'; readonly resourceId: ResourceId }
  /** Delete Resource from Space: the same removal, cascaded through every Map. */
  | { readonly kind: 'deleted-resource'; readonly resourceId: ResourceId }
  | { readonly kind: 'renamed-map'; readonly mapId: UUID; readonly title: string }
  | { readonly kind: 'deleted-map'; readonly mapId: UUID }
  /**
   * Rename Space: the one Edit on the Space document *above* any Map.
   *
   * It writes `document.title` and nothing else. No Space Resource pointing at this
   * Space changes with it — a Space's name and the Title of a Resource that
   * references it are two stored values that agree only at creation, and ADR
   * 0083 keeps the target's name off the Resource's front, so nothing in another
   * Space draws what this writes.
   *
   * Derived beside `created-map` and `deleted-map`, ahead of the general
   * per-Map path below: all three write keys of `document` directly, read
   * `session.getState().working` themselves, and still owe `CompletedEdit` a
   * Map and Active Graph to continue in even though this one changes
   * neither. It resolves the selected Map only for that pair.
   *
   * The shape rejected for it was parallel to `renamed-map`, below the
   * general path: a `MapRequiredOperation` answer and a Map lookup for
   * an Edit that touches no Map, both wrong about what this Edit is.
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
      readonly resourceId: ResourceId;
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
      readonly createdResourceId?: ResourceId;
      readonly createdGraphId?: GraphId;
    }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'refused'; readonly refusal: AuthoringRefusal }
  | { readonly kind: 'queued' };

type MapRequiredOperation = Extract<
  AuthoringCompletion,
  | { readonly kind: 'added-resource-to-map' }
  | { readonly kind: 'removed-resource-from-map' }
  | { readonly kind: 'opened-resource' }
  | { readonly kind: 'closed-resource' }
  | { readonly kind: 'resized-resource' }
  | { readonly kind: 'renamed-map' }
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
  | { readonly code: 'map-not-found' }
  | { readonly code: 'map-required'; readonly operation: MapRequiredOperation }
  | { readonly code: 'resource-not-found' }
  | { readonly code: 'resource-kind-immutable' }
  | { readonly code: 'reference-target-immutable' }
  | { readonly code: 'space-resource-target-immutable' }
  | { readonly code: 'space-resource-deletion-unsupported' }
  // The one code here the domain owns rather than this module: `@project/core`
  // raises it from the Resource schema, so both ends spell it from one constant.
  | { readonly code: typeof RESOURCE_TITLE_REQUIRED }
  | { readonly code: 'map-title-required' }
  /**
   * Rename Space with nothing left after the trim. `spaceFileSchema` declares
   * the title as `z.string().min(1)`, which counts characters, so blank is the
   * empty case wearing different bytes and only this Edit can refuse it.
   */
  | { readonly code: 'space-title-required' }
  | { readonly code: 'space-must-keep-map' }
  | { readonly code: 'reference-target-not-found'; readonly targetId: ResourceId }
  | { readonly code: 'reference-target-must-own-content'; readonly targetId: ResourceId }
  | { readonly code: 'resource-already-in-map' }
  | { readonly code: 'resource-not-in-map' }
  | { readonly code: 'resource-not-expanded' }
  | {
      readonly code: 'resource-has-references';
      /** The Reference Resources by **name**, which is what a sentence listing Resources says (ADR 0083). */
      readonly referenceTitles: readonly string[];
    }
  | { readonly code: 'graph-title-required' }
  | { readonly code: 'map-must-keep-graph' }
  | { readonly code: 'graph-not-owned' }
  | { readonly code: 'edge-not-found' }
  | { readonly code: 'edge-resource-outside-map' }
  | { readonly code: 'edge-already-exists' }
  | { readonly code: 'map-active-graph-required' };

/**
 * The published state: what the collaborators say, plus the one fact only
 * Authoring knows — that a replacement Space has been opened over them.
 *
 * Placement is absent because Authoring holds none: every Edit derives it
 * fresh, from the Map it is writing, at the moment it derives. A caller
 * that wants the selected Map's current placement reads it the same way —
 * `Placement.fromMap` over the Map Navigation names.
 */
export interface SpaceAuthoringState {
  /**
   * ADR 0042's replacement signal: advances when a replacement Space is opened
   * over this Authoring without recreating it, and at no other time. Retry,
   * Keep local, persistence status changes, Map selection and completed
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
   * The selected Map's own placement, derived fresh from the working
   * snapshot.
   *
   * Not published state — every reader that wants it asks at the point of use,
   * the same way a completed Edit derives its own. The render adapter's resize
   * seed is the one caller outside this module.
   */
  readonly mapPlacement: () => Placement;
  /**
   * Whether an Edge gesture may be offered as resources stand, and why not.
   *
   * The one eligibility query for every Edge path — connect, create-and-connect
   * and reconnect — asked by the live preview, by React Flow's
   * `isValidConnection` during a drag, and by a picker deciding which Resources to
   * disable. Completion validates the same proposal again, because the Space can
   * change while a preview or a picker is open.
   */
  readonly edgeEligibility: (proposal: EdgeProposal) => EdgeEligibility;
  readonly complete: (completion: AuthoringCompletion) => AuthoringResult;
  /**
   * Author the explicitly addressed Map without switching this Space's canvas.
   * Deleting its visible Active Graph advances that selection to a survivor.
   */
  readonly completeInMap: (
    mapId: UUID,
    completion: EmbeddedResourceCompletion | EmbeddedContextCompletion,
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
  /** The Map this Edit wrote, which Navigation continues in. */
  readonly nextMapId: MapId;
  /**
   * The Active Graph of that Map, which Navigation adopts along with it.
   *
   * Under ADR 0040 a Map owns its Graphs, so which one is active is a fact
   * about the Map this Edit wrote and not a separate consequence.
   */
  readonly nextActiveGraphId: GraphId | null;
  readonly createdResourceId?: ResourceId;
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
  readonly embeddedMapId?: UUID | undefined;
}

export type EmbeddedResourceCompletion = Extract<
  AuthoringCompletion,
  {
    kind:
      | 'opened-resource'
      | 'closed-resource'
      | 'resized-resource'
      | 'edited-resource'
      | 'settled-resource-movement'
      | 'removed-resource-from-map'
      | 'connected-resources';
  }
>;

/** Commands addressed to the Map shown by a Space Resource. */
export type EmbeddedContextCompletion = Extract<
  AuthoringCompletion,
  {
    kind: 'renamed-map' | 'added-graph' | 'renamed-graph' | 'recolored-graph' | 'deleted-graph';
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
   * The same reader Navigation is given, so both resolve a Map against one
   * `Space` identity and one parse — and both read entity context through that
   * Space's own `lookup`.
   */
  readonly currentSpace: () => Space;
  readonly reportObserverError?: ObserverErrorReporter | undefined;
  /**
   * Mints the identity of every Resource, Map and Graph a completed Edit creates.
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

/**
 * Every `SnapshotEdit` refusal, in Authoring's vocabulary.
 *
 * The identity, and deliberately so: each code `SnapshotEdit` raises is one
 * Authoring already names, with the same typed context, so the compiler is
 * what holds the mapping — a new module code that Authoring does not name
 * fails to typecheck here rather than reaching the author unworded.
 */
const authoringRefusal = (refusal: SnapshotEditRefusal): AuthoringRefusal => refusal;

/** A `SnapshotEdit` answer that is not an Edit, as the derivation answers it. */
const notCompleted = (
  outcome: Exclude<SnapshotEditOutcome, { readonly kind: 'completed' }>,
): DerivedCompletion =>
  outcome.kind === 'unchanged' ? UNCHANGED : refuse(authoringRefusal(outcome.refusal));

/** Two Edges are the same Edge when they join the same Resources the same way (ADR 0032). */
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
 * membership**, because a Resource that is already this Edge's endpoint is by
 * definition in this Map, and asking the placement first would refuse a
 * dragged endpoint dropped back where it started on a Map still arranging.
 */
const reconnectOutcome = (
  graph: Graph | undefined,
  proposal: {
    readonly graphId: GraphId;
    readonly edge: GraphEdge;
    readonly endpoint: EdgeEndpoint;
    readonly resourceId: ResourceId;
  },
  placement: Placement,
  /**
   * Whether the Space still holds the Resource, which the placement does not answer.
   *
   * The same second condition `connectable` applies to a connection, and the
   * asymmetry was a latent trap rather than a nicety: an Edge naming a Resource the
   * Space has lost derives a snapshot intake rejects, and this derivation answers
   * an unloadable Space by *throwing* — putting a defect in front of the author
   * as their own mistake. A picker open across such a deletion is the way there.
   */
  holdsResource: (resourceId: ResourceId) => boolean,
): ReconnectOutcome => {
  // Ownership, not existence: a Graph a *second* Map owns exists and is
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
      ? { from: proposal.resourceId, to: proposal.edge.to }
      : { from: proposal.edge.from, to: proposal.resourceId };
  if (sameEdge(proposal.edge, reconnected)) return UNCHANGED;
  // Checked together and after `unchanged`, so an endpoint returned to its own
  // Resource is still eligible on a Map that has not finished arranging.
  if (!placement.has(proposal.resourceId) || !holdsResource(proposal.resourceId)) {
    return { kind: 'refused', refusal: { code: 'edge-resource-outside-map' } };
  }
  if (indexOfEdge(graph.edges, reconnected) !== -1) {
    return { kind: 'refused', refusal: { code: 'edge-already-exists' } };
  }
  return { kind: 'edge', edge: reconnected };
};

/**
 * A single-line title normalized for authorship, or `null` when it has no name.
 *
 * Spaces, Maps and Graphs. Their titles are single-line by ADR 0083, so the
 * whole string is one line and trimming it is the whole rule. A Resource's Title is
 * Title Lines and normalizes by a rule of its own — {@link namedResourceTitle}.
 */
const trimmedNonBlankTitle = (title: string): string | null => {
  const trimmed = title.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * A Resource Title normalized as the schema normalizes it, or `null` when it
 * carries no name.
 *
 * `normalizeTitle` and not `trim()`, because on a Title of more than one line
 * the two give different answers: a whole-string trim cannot reach the trailing
 * whitespace on an interior line, and it strips a first line's leading
 * whitespace, which ADR 0083 says is that line's own. A write path that
 * disagreed with the parse boundary would store a Resource whose Title differs from
 * the one intake mints from the same bytes — derived state disagreeing with the
 * code that derives it, which this repo fixes at the source.
 */
const namedResourceTitle = (title: string): string | null => {
  const normalized = normalizeTitle(title);
  return normalized.length === 0 ? null : normalized;
};

/**
 * Structural equality over the JSON values a snapshot is built from.
 *
 * Serializing both sides and comparing the text was the same answer only when
 * the two agreed on key order, and nothing promises that: a snapshot loaded
 * from the database or an import carries whatever order it was written in,
 * while a completed Edit rebuilds each Map in the writer's order. A
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

  const selectedResolvedMap = (): ResolvedMap =>
    resolveMap(currentSpace(), navigation.getState().selectedMapId);

  const mapPlacement = (): Placement => Placement.fromMap(selectedResolvedMap().map);

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
   * Placement needs no sibling repair: it is derived fresh from the Map at
   * every read, so a snapshot this module did not write already answers it.
   * Navigation's own selection, though, is state that has to be moved back in
   * step deliberately. Every other replacement of the working snapshot answers
   * the selection as it
   * installs — a completed Edit resolves the Map and its Active Graph before
   * `continueInMap`, and `acceptStoredSpace` re-opens Navigation on the
   * Space it accepted. The coordinated Space Resource lifecycle is the exception:
   * its recovery restores *every participant's* snapshot
   * (`session-registry.ts`), and only the Space whose conflict the author
   * answered had a `SpaceAuthoring` to re-open. A second open Space rolled back
   * past structure it held locally went on naming that structure, and nothing
   * corrected it.
   *
   * **Both halves of the selection, because a recovery can take either.** A
   * restore past a locally added Graph leaves the Active Graph naming a Graph
   * the Map no longer owns, which made the Dock command a Graph the canvas
   * was not drawing as active. A restore past a locally *created* Map leaves
   * the selection itself dangling, and that one is worse: the Space still loads,
   * so `resolveMap` throws `MapNotFoundError` for a Space with nothing
   * wrong with it and `SpaceApp` draws the failure surface. One repair answers
   * both, because `selectMap` resolves the pair.
   *
   * **Re-resolving here is not the repair `continueInMap` refuses.** That
   * call declines to invent an Active Graph because its caller states one and is
   * held to it, and because inventing one would interrupt a traversal of the
   * Graph that was active. Neither holds here: no caller stated anything — the
   * Space was replaced out from under this one — and the structure the traversal
   * belonged to is the structure that is gone. `selectMap` is what says so,
   * the same operation an author spends to land on a Map's own Active Graph,
   * and it drops out of presentation because there is nothing left to present.
   * An absent Active Graph is exempt, as it is there: it names nothing, so there
   * is nothing about it to be stale.
   *
   * Membership is asked of `mapShowsGraph` and of the Space's own index
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
    const { selectedMapId, activeGraphId } = navigation.getState();
    const selected = space.lookup.map(selectedMapId);
    if (selected === undefined) {
      // The Map is gone, so its Active Graph is not worth asking about. A
      // Space whose own opening selection does not resolve either is the bug
      // `requireDefaultMap` documents rather than a state to repair, so it
      // is left for the surface to report.
      const opening = space.defaultMap;
      if (opening !== undefined && space.lookup.map(opening) !== undefined) {
        navigation.selectMap(opening);
      }
      return;
    }
    if (activeGraphId === null || mapShowsGraph(selected, activeGraphId)) return;
    navigation.selectMap(selectedMapId);
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
   * The Graph a Map-owned Edge operation names, or `undefined` when the
   * selected Map is not the one that owns it.
   *
   * Asked of `space.lookup.graph`, which answers a Graph *with its owner* — the
   * index built for exactly this question (ADR 0040), and O(1) rather than a
   * walk over one Map's Graphs. Comparing the owner's id is what keeps this
   * ownership rather than existence: a Graph a second Map owns resolves here
   * and is still not one this Edit may write. Graph ids are unique across the
   * Space (ADR 0045), so there is no second Graph the id could have meant.
   */
  const ownedGraph = (graphId: GraphId): Graph | undefined => {
    const selectedMap = selectedResolvedMap();
    const owned = currentSpace().lookup.graph(graphId);
    return owned?.owner.map.id === selectedMap.map.id ? owned.graph : undefined;
  };

  /**
   * The Graph a connection drawn right now would land in, or `null` when no
   * selected Map owns one.
   *
   * A Map the Space no longer holds answers `null` too: it names no Graph,
   * and the completion that follows refuses for that reason rather than this one.
   */
  const targetGraph = (): Graph | null => {
    const { activeGraphId } = navigation.getState();
    return activeGraphId === null ? null : (ownedGraph(activeGraphId) ?? null);
  };

  /**
   * Whether a Resource is one an Edge this gesture authors may name at all.
   *
   * Two conditions, and the second is ADR 0040's closure read forwards. A Resource
   * of the Space is not necessarily a Resource of the Map the Edit writes: a
   * Map's members **are** its position keys, and the completed placement is
   * what those keys are about to become. An Edge naming a Resource outside it
   * derives a Space intake rejects, and `deriveCompletedEdit` answers an
   * unloadable Space by throwing — right for a bug, wrong for an eligibility
   * query. Refusing here keeps the interaction boundary closed over the Map
   * even if a stale caller names a Resource outside it.
   *
   * `members` is the Map's own placement, and every caller reads it fresh —
   * so a preview and the completed Edit it previews can still disagree when the
   * Space changed between them, which is why completion asks this again rather
   * than trusting the preview's answer.
   */
  const connectable = (resourceId: ResourceId, members: Placement): boolean =>
    members.has(resourceId) &&
    session.getState().working.resources.some((resource) => resource.id === resourceId);

  /**
   * Why an Edge this gesture would author cannot be authored, or `null`.
   *
   * One answer for the live preview, the release and the completed Edit, so a
   * gesture the canvas offers cannot be one the completion silently drops — and
   * the completion says *which* rule it hit, which a boolean could not.
   * `to === null` is the Option/Alt empty drop, whose target Resource does not exist
   * yet (ADR 0033).
   *
   * An exact duplicate within one Graph is what intake rejects (ADR 0032), so it
   * can only be a duplicate of an Edge in the Graph the Edge is about to join.
   * A created Resource cannot duplicate anything, which is why the callers differ.
   *
   * `members` and `graph` are the Map and Graph this Edit writes, and every
   * caller supplies `members` explicitly — the selected Map's own placement
   * for a preview, and the placement a completed Edit derives from for an Edit. `graph` alone keeps a default, the Active Graph through
   * `targetGraph()`, because the host canvas is the one caller that never names
   * a Graph of its own; a Space Resource names the Graph it is showing.
   */
  const connectRefusal = (
    from: ResourceId,
    to: ResourceId | null,
    members: Placement,
    graph: Graph | null = targetGraph(),
  ): AuthoringRefusal | null => {
    if (!connectable(from, members) || (to !== null && !connectable(to, members))) {
      return { code: 'edge-resource-outside-map' };
    }
    if (graph === null) return { code: 'map-active-graph-required' };
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
    // The selected Map's own placement, read fresh — both branches ask
    // about a Graph `ownedGraph`/`targetGraph` already scope to that Map,
    // so this is the one Map either question could mean.
    const members = mapPlacement();
    if (proposal.kind !== 'reconnect') {
      const refusal = connectRefusal(
        proposal.from,
        proposal.kind === 'connect' ? proposal.to : null,
        members,
      );
      return refusal === null ? ELIGIBLE : { kind: 'refused', refusal };
    }
    const outcome = reconnectOutcome(
      ownedGraph(proposal.graphId),
      proposal,
      members,
      (resourceId) =>
        session.getState().working.resources.some((resource) => resource.id === resourceId),
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
   * nothing, names a Resource the Space no longer holds, or targets a Map that
   * has gone is simply not an Edit, and the two say which of those it was.
   * Producing an unloadable Space *is* a failure, and it throws — here, where
   * the collaborators are all still level.
   */
  const deriveCompletedEdit = ({
    completion,
    embeddedMapId,
  }: ReportedCompletion): DerivedCompletion => {
    const selection = embeddedMapId ?? navigation.getState().selectedMapId;
    if (completion.kind === 'created-map') {
      const snapshot = session.getState().working;
      const mapId = newId();
      const graphId = newId();
      // The one Edit that makes a Map rather than writing into one, so it
      // builds the whole Map here: empty, owning one empty Graph that it opens
      // on, and the Space's opening Map from now on (ADR 0079).
      const next: SpaceSnapshot = {
        ...snapshot,
        document: {
          ...snapshot.document,
          maps: [
            ...(snapshot.document.maps ?? []),
            {
              id: mapId,
              title: nextMapTitle(snapshot),
              kind: 'positioned',
              positions: {},
              graphs: [
                {
                  id: graphId,
                  title: 'Graph 1',
                  color: nextGraphColor(0),
                  edges: [],
                },
              ],
              activeGraph: graphId,
            },
          ],
          defaultMap: mapId,
        },
      };
      assertValidAuthoredSnapshot(next);
      return {
        kind: 'completed',
        edit: {
          snapshot: next,
          nextActiveGraphId: graphId,
          nextMapId: mapId,
        },
      };
    }
    if (completion.kind === 'deleted-map') {
      const snapshot = session.getState().working;
      const maps = snapshot.document.maps ?? [];
      const target = maps.find((map) => map.id === completion.mapId);
      if (target === undefined) return refuse({ code: 'map-not-found' });
      if (maps.length === 1) return refuse({ code: 'space-must-keep-map' });
      const survivors = maps.filter((map) => map.id !== completion.mapId);
      const selectedSurvives = survivors.some((map) => map.id === selection);
      const nextMap = selectedSurvives
        ? survivors.find((map) => map.id === selection)
        : survivors[0];
      if (nextMap === undefined) {
        throw new Error('Deleting a Map left no survivor after the last Map was refused.');
      }
      const next = {
        ...snapshot,
        document: {
          ...snapshot.document,
          maps: survivors,
          defaultMap:
            snapshot.document.defaultMap === completion.mapId
              ? nextMap.id
              : snapshot.document.defaultMap,
        },
      };
      assertValidAuthoredSnapshot(next);
      return {
        kind: 'completed',
        edit: {
          snapshot: next,
          nextActiveGraphId: nextMap.activeGraph ?? nextMap.graphs[0]?.id ?? null,
          nextMapId: nextMap.id,
        },
      };
    }
    if (completion.kind === 'renamed-space') {
      const snapshot = session.getState().working;
      // Trimmed for the reason a Map's and a Graph's titles are: the schema
      // counts characters, so a title of spaces satisfies it and would store a
      // Space with no readable name.
      const title = trimmedNonBlankTitle(completion.title);
      if (title === null) return refuse({ code: 'space-title-required' });
      if (title === snapshot.document.title) return UNCHANGED;
      // The Map is resolved for the placement, not for permission: a Space
      // rename is legal whatever is drawing, and this Edit changes neither the
      // selection nor the Map it names. So the resolution happens *after*
      // the title checks rather than as the universal gate the Edits below run
      // first — a blank name is a blank name whether or not the canvas has
      // moved on, and answering with the Map instead would report the wrong
      // fact about the author's own keystrokes.
      //
      // `map-not-found` rather than a code of its own, and no
      // `map-required` arm: the refusal is the one the chosen shape
      // already raises, and inventing a second would make an Edit that holds
      // no Map say it needed one.
      const map = (snapshot.document.maps ?? []).find((candidate) => candidate.id === selection);
      if (map === undefined) return refuse({ code: 'map-not-found' });
      const next = { ...snapshot, document: { ...snapshot.document, title } };
      assertValidAuthoredSnapshot(next);
      return {
        kind: 'completed',
        edit: {
          snapshot: next,
          // **Navigation's Active Graph, not the Map's stored one.**
          //
          // Activating a Graph is not an Edit (ADR 0028), so the emphasised
          // Graph routinely differs from the `activeGraph` the Map stores
          // until some other Edit writes it. `created-map` and
          // `deleted-map` re-resolve legitimately, each landing the reader
          // in a *different* Map; this Edit changes no Map and no
          // selection, so re-resolving would answer a question nobody asked and
          // snap the emphasis, the Dock's Graph cluster and the product URL back
          // to the stored Graph — a rename of the Space silently activating a
          // different Graph. So this carries the current one forward, exactly as
          // the general path below does for the same reason (`navigation.ts`
          // writes out the harm at length).
          //
          // The embedded arm mirrors the one below, and it is written for that
          // reason alone. `selection` is then the embedded Map rather than
          // Navigation's, so Navigation's Graph may be one this Map does not
          // show — but nothing here reads the answer: `performCompletion`'s
          // embedded path submits and installs and never calls
          // `continueInMap`, so `nextActiveGraphId` is discarded whenever
          // `embeddedMapId` is given. The arm is consistency with the
          // general path, not a guard against anything, and no gesture reaches a
          // Space rename from an embedded Map in any case — the Dock's Space
          // name is not drawn inside one.
          nextActiveGraphId:
            embeddedMapId === undefined
              ? navigation.getState().activeGraphId
              : (map.activeGraph ?? map.graphs[0]?.id ?? null),
          nextMapId: map.id,
        },
      };
    }
    let snapshot = session.getState().working;
    const previousSnapshot = snapshot;
    const navigationState = navigation.getState();
    const space = currentSpace();
    // A selected Map the Space no longer holds is not an Edit. Checked before
    // resolving, because the resolver answers that case by throwing.
    //
    // Not the case ADR 0045 forbids, which is turning a *thrown*
    // `MapNotFoundError` into a refusal — there is no catch here and a
    // resolver that refuses still takes the Edit down with it. This asks a
    // question of the Space instead, and the answer is an author's state rather
    // than a defect: the Map this gesture was aimed at is gone, so there is
    // nothing to write it into.
    if (space.lookup.map(selection) === undefined) {
      return refuse({ code: 'map-not-found' });
    }
    const resolved = resolveMap(space, selection);
    // Which Map this Edit writes. Every arm below that changes its positions
    // or its Graphs writes them into `snapshot` itself, and the tail folds only
    // the Map's identity over the result — so an arm answered by a
    // whole-snapshot operation is never overwritten by a copy of the Map taken
    // before that operation ran.
    const mapId: UUID = resolved.map.id;
    let createdResourceId: ResourceId | undefined;
    let connection: GraphEdge | null = null;
    // The Map's own placement, read fresh at derivation — the one source of
    // geometry this Edit starts from. A queued completion derives against this
    // too, at drain time rather than at the moment it was requested, which is
    // what keeps a settled drag from landing against a Map that has since
    // moved on.
    const placement = Placement.fromMap(resolved.map);
    const writeMap = (write: (map: Map) => Map): void => {
      snapshot = {
        ...snapshot,
        document: {
          ...snapshot.document,
          maps: (snapshot.document.maps ?? []).map((map) => (map.id === mapId ? write(map) : map)),
        },
      };
    };
    const writePlacement = (next: Placement): void => {
      writeMap((map) => ({ ...map, positions: Placement.toPositions(next) }));
    };
    const writeGraphs = (graphs: readonly Graph[]): void => {
      writeMap((map) => ({ ...map, graphs: [...graphs] }));
    };
    // The one way a Resource is added: mint it, and let `SnapshotEdit` add and
    // place it. Add Resource and Add Reference Resource differ in the document
    // they carry and in nothing else — neither creates an Edge, and neither adds
    // a Graph to a Map that already has one. Answers the new id, or the
    // derivation's answer when the module refused.
    const createResource = (
      document: ResourceDocument,
      at: MapPosition,
      /**
       * A gesture that dropped on empty canvas aimed at its point and keeps it
       * (`exact`); a Resource created from a menu has no aimed-at point and
       * would otherwise stack (`avoidingOverlap`).
       */
      mode: 'exact' | 'avoidingOverlap',
    ): { readonly id: ResourceId } | DerivedCompletion => {
      const id = newId();
      const outcome = SnapshotEdit.createInMap(snapshot, mapId, id, document, at, mode);
      if (outcome.kind !== 'completed') return notCompleted(outcome);
      snapshot = outcome.snapshot;
      return { id };
    };
    if (completion.kind === 'edited-resource') {
      const resourceIndex = snapshot.resources.findIndex(
        (resource) => resource.id === completion.resourceId,
      );
      const resource = snapshot.resources[resourceIndex];
      if (resource === undefined) return refuse({ code: 'resource-not-found' });
      // Kind is fixed for a Resource's lifetime, and changing it is out of scope for
      // version 1. Everything else the editor holds — a Markdown Resource's Title
      // and body, or a Reference Resource's Title and Target — is one ordinary Edit of
      // this Resource.
      if (resource.document.kind !== completion.document.kind) {
        return refuse({ code: 'resource-kind-immutable' });
      }
      if (
        resource.document.kind === 'reference' &&
        completion.document.kind === 'reference' &&
        resource.document.target !== completion.document.target
      ) {
        return refuse({ code: 'reference-target-immutable' });
      }
      if (
        resource.document.kind === 'space' &&
        completion.document.kind === 'space' &&
        resource.document.spaceId !== completion.document.spaceId
      ) {
        return refuse({ code: 'space-resource-target-immutable' });
      }
      // Normalized and refused *here* rather than only at the surface that
      // typed it. A blank title is the empty case wearing different bytes, and
      // intake answers an empty one by failing — which this derivation reports
      // by throwing, and an author's mistake may not throw. Every caller of
      // this operation is covered by one rule instead of each remembering it,
      // and that one rule is the schema's own (ADR 0083).
      const title = namedResourceTitle(completion.document.title);
      if (title === null) return refuse({ code: RESOURCE_TITLE_REQUIRED });
      const document: ResourceDocument = { ...completion.document, title };
      if (sameValue(resource.document, document)) return UNCHANGED;
      const resources = [...snapshot.resources];
      resources[resourceIndex] = { id: resource.id, document };
      snapshot = { ...snapshot, resources };
    } else if (completion.kind === 'opened-resource') {
      const outcome = SnapshotEdit.open(snapshot, mapId, completion.resourceId);
      if (outcome.kind !== 'completed') return notCompleted(outcome);
      snapshot = outcome.snapshot;
    } else if (completion.kind === 'closed-resource') {
      const outcome = SnapshotEdit.close(snapshot, mapId, completion.resourceId);
      if (outcome.kind !== 'completed') return notCompleted(outcome);
      snapshot = outcome.snapshot;
    } else if (completion.kind === 'resized-resource') {
      // Only an exact Closed Size reaches here as a Close: the magnetic range
      // that snaps a near miss to it is the canvas's (ADR 0066).
      const outcome = SnapshotEdit.resize(snapshot, mapId, completion.resourceId, completion.size);
      if (outcome.kind !== 'completed') return notCompleted(outcome);
      snapshot = outcome.snapshot;
    } else if (completion.kind === 'created-resource') {
      const created = createResource(
        { title: nextResourceTitle(snapshot), kind: 'markdown', body: '' },
        completion.anchor,
        'avoidingOverlap',
      );
      if ('kind' in created) return created;
      createdResourceId = created.id;
    } else if (completion.kind === 'created-reference') {
      // An empty title mints the same neutral `Resource N` every other created Resource
      // gets; text the author already entered is never overwritten. `??` cannot
      // express this — the empty string is a value a caller really sends, and
      // the whole point is that it does not count as one.
      //
      // **Copying the Target's Title is now what the one caller does** (ADR 0089).
      // This arm used to carry an argument against it, from when a pane asked for
      // a name before the Edit ran: there is no pane, the Reference Resource is named after
      // its Target and renamed in place afterwards, and two Resources sharing a name
      // is not a collision because a title is not an identifier (ADR 0016). What
      // stays this module's is the default and the normalization, not the choice.
      // Normalized the way a rename is, and for the same reason: creation and
      // renaming write one field, so the same typed bytes have to reach the
      // same stored document whichever path wrote them (ADR 0083).
      const entered = namedResourceTitle(completion.title ?? '');
      const document: ResourceDocument = {
        title: entered ?? nextResourceTitle(snapshot),
        kind: 'reference',
        target: completion.target,
      };
      const created = createResource(document, completion.anchor, 'avoidingOverlap');
      if ('kind' in created) return created;
      createdResourceId = created.id;
    } else if (completion.kind === 'added-resource-to-map') {
      const outcome = SnapshotEdit.addToMap(
        snapshot,
        mapId,
        completion.resourceId,
        completion.anchor,
        'avoidingOverlap',
      );
      if (outcome.kind !== 'completed') return notCompleted(outcome);
      snapshot = outcome.snapshot;
    } else if (completion.kind === 'removed-resource-from-map') {
      const outcome = SnapshotEdit.removeFromMap(snapshot, mapId, completion.resourceId);
      if (outcome.kind !== 'completed') return notCompleted(outcome);
      snapshot = outcome.snapshot;
    } else if (completion.kind === 'deleted-resource') {
      const deleted = space.lookup.resource(completion.resourceId);
      if (deleted === undefined) {
        return refuse({ code: 'resource-not-found' });
      }
      // A Space Resource owns the Space it names (ADR 0058), so deleting it deletes
      // that Space and everything below it — one coordinated multi-Space Edit,
      // which is Space Resource lifecycle through the session registry and not
      // a single-Space update this seam can make. Completing it here would store
      // a Space whose target is unreachable, and aggregate intake refuses that
      // commit permanently with the Resource already gone from the working state.
      // Decided before the module, so a Space Resource a Reference Resource
      // targets still answers this rather than `resource-has-references`.
      if (deleted.kind === 'space') {
        return refuse({ code: 'space-resource-deletion-unsupported' });
      }
      // Everything else — a Reference Resource still targeting it, and the
      // cascade through every Map, the one this Edit is drawing included — is
      // the module's (ADR 0040, ADR 0070, ADR 0084).
      const outcome = SnapshotEdit.deleteFromSpace(snapshot, completion.resourceId);
      if (outcome.kind !== 'completed') return notCompleted(outcome);
      snapshot = outcome.snapshot;
    } else if (completion.kind === 'create-and-connect') {
      const refusal = connectRefusal(completion.from, null, placement);
      if (refusal !== null) return refuse(refusal);
      // The drop point is aimed at, so it is kept exactly: the gesture only
      // offers an empty-canvas release, and stepping off it would move the Resource
      // away from where the author watched the preview sit.
      const created = createResource(
        { title: nextResourceTitle(snapshot), kind: 'markdown', body: '' },
        completion.position,
        'exact',
      );
      if ('kind' in created) return created;
      createdResourceId = created.id;
      connection = { from: completion.from, to: created.id };
    } else if (completion.kind === 'connected-resources') {
      const named =
        completion.graphId === undefined
          ? undefined
          : currentSpace().lookup.graph(completion.graphId);
      if (completion.graphId !== undefined && named?.owner.map.id !== resolved.map.id) {
        return refuse({ code: 'graph-not-owned' });
      }
      const fallbackId = resolved.map.activeGraph ?? resolved.map.graphs[0]?.id;
      const graph =
        named?.graph ??
        (embeddedMapId === undefined
          ? targetGraph()
          : fallbackId === undefined
            ? null
            : (resolved.map.graphs.find((candidate) => candidate.id === fallbackId) ?? null));
      const refusal = connectRefusal(completion.from, completion.to, placement, graph);
      if (refusal !== null) return refuse(refusal);
      connection = { from: completion.from, to: completion.to };
    } else if (completion.kind === 'settled-resource-movement') {
      // The moved Resources' drop points, merged over the Map's own positions
      // this Edit already started from — `Placement.next` is what keeps each
      // Resource's Open/Closed state and Open Size while overwriting `x`/`y`.
      writePlacement(
        Placement.next(placement, Placement.fromEntries(completion.moved), [
          ...completion.moved.keys(),
        ]),
      );
    }
    // What the tail writes as the Map's identity.
    let mapTitle: string;
    let activeGraphId: GraphId | null;
    let createdGraphId: GraphId | undefined;
    const { map } = resolved;
    mapTitle = map.title;
    // The Graphs as they stand after the arm above: the arms that write Graphs
    // below are never the ones that wrote them above, so this is the Map's own.
    const ownedGraphs = map.graphs;
    activeGraphId =
      embeddedMapId === undefined
        ? navigationState.activeGraphId
        : (map.activeGraph ?? map.graphs[0]?.id ?? null);
    if (completion.kind === 'renamed-map') {
      // Addressed by id, exactly as Rename Graph is (ADR 0040) — and the id is
      // checked because this Edit resolves its Map from state read *later*
      // than the gesture that named one. `deriveCompletedEdit` takes the
      // selection from `navigation.getState()` at derivation time, and three
      // resources put that ahead of the id the author submitted: a completion that
      // arrived while another was completing derives off the queue rather than
      // off the press; the Dock's `IdentityName` closes over the
      // `canvas.selected.id` of its last committed render, so a selection that
      // moved this tick has not reached it yet; and an embedded Map Edit
      // resolves `embeddedMapId` rather than the selection at all, so a
      // rename aimed at the drawing Map names the wrong one by construction.
      // The surface guards are real and are not this one — `IdentityName` ends
      // a draft whose subject changed, `App` ends one the replacement epoch or
      // lost availability invalidated (ADR 0042) — but both end it on the
      // *next* render, and this answers the submit already in flight. So a
      // rename naming a Map other than the one this Edit resolves is a
      // gesture aimed at something no longer drawing — an author's state, not a
      // defect.
      if (completion.mapId !== mapId) return refuse({ code: 'map-not-found' });
      const title = trimmedNonBlankTitle(completion.title);
      if (title === null) return refuse({ code: 'map-title-required' });
      if (title === mapTitle) return UNCHANGED;
      mapTitle = title;
    }
    if (connection !== null) {
      const writeGraphId =
        completion.kind === 'connected-resources' && completion.graphId !== undefined
          ? completion.graphId
          : activeGraphId;
      const graphIndex = ownedGraphs.findIndex((graph) => graph.id === writeGraphId);
      const graph = ownedGraphs[graphIndex];
      if (graph === undefined) {
        return refuse({ code: 'map-active-graph-required' });
      }
      const graphs = [...ownedGraphs];
      graphs[graphIndex] = { ...graph, edges: [...graph.edges, connection] };
      writeGraphs(graphs);
    } else if (completion.kind === 'added-graph') {
      const graph: Graph = {
        id: newId(),
        title: nextGraphTitle(space.graphs),
        color: nextGraphColor(ownedGraphs.length),
        edges: [],
      };
      writeGraphs([...ownedGraphs, graph]);
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
      // Ownership, not existence: a Graph a *second* Map owns exists and is
      // still not one this Edit may write (ADR 0040).
      if (graph === undefined) {
        return refuse({ code: 'graph-not-owned' });
      }
      const replacing = (next: Graph): readonly Graph[] =>
        ownedGraphs.map((existing, index) => (index === graphIndex ? next : existing));
      if (completion.kind === 'renamed-graph') {
        // Trimmed, for the reason a Resource title is: `z.string().min(1)` counts
        // characters, so blank is the empty case wearing different bytes.
        const title = trimmedNonBlankTitle(completion.title);
        if (title === null) {
          return refuse({ code: 'graph-title-required' });
        }
        if (title === graph.title) return UNCHANGED;
        writeGraphs(replacing({ ...graph, title }));
      } else if (completion.kind === 'recolored-graph') {
        if (completion.color === graph.color) return UNCHANGED;
        writeGraphs(replacing({ ...graph, color: completion.color }));
      } else if (completion.kind === 'deleted-graph') {
        // Every Map resolves an Active Graph, so the last one cannot go
        // (ADR 0040). Removing its Edges is the author's way to empty it.
        if (ownedGraphs.length === 1) {
          return refuse({ code: 'map-must-keep-graph' });
        }
        const survivors = ownedGraphs.filter((_, index) => index !== graphIndex);
        writeGraphs(survivors);
        // Order among the survivors is untouched, and the first of them becomes
        // active when the deleted Graph was the one being emphasised.
        if (activeGraphId === graph.id) activeGraphId = survivors[0]?.id ?? null;
      } else if (completion.kind === 'deleted-edge') {
        const edgeIndex = indexOfEdge(graph.edges, completion.edge);
        if (edgeIndex === -1) {
          return refuse({ code: 'edge-not-found' });
        }
        writeGraphs(
          replacing({
            ...graph,
            edges: graph.edges.filter((_, index) => index !== edgeIndex),
          }),
        );
      } else {
        // The same rule `edgeEligibility` offered the gesture under, asked again
        // because the Space can have changed since — and answering with the
        // resulting Edge rather than a boolean, so there is nothing to rederive.
        const outcome = reconnectOutcome(graph, completion, placement, (resourceId) =>
          snapshot.resources.some((resource) => resource.id === resourceId),
        );
        if (outcome.kind !== 'edge') return outcome;
        const edgeIndex = indexOfEdge(graph.edges, completion.edge);
        // In place, so reconnecting does not reorder a Graph's Edges — that order
        // is what a branching Resource's moves are offered in (ADR 0024).
        writeGraphs(
          replacing({
            ...graph,
            edges: graph.edges.map((edge, index) => (index === edgeIndex ? outcome.edge : edge)),
          }),
        );
      }
    }
    const next = updatePositionedMap(snapshot, { mapId, title: mapTitle, activeGraphId });
    if (sameSnapshot(previousSnapshot, next)) return UNCHANGED;
    assertValidAuthoredSnapshot(next);
    const created: { createdResourceId?: ResourceId; createdGraphId?: GraphId } = {};
    if (createdResourceId !== undefined) created.createdResourceId = createdResourceId;
    if (createdGraphId !== undefined) created.createdGraphId = createdGraphId;
    return {
      kind: 'completed',
      edit: {
        snapshot: next,
        nextActiveGraphId: activeGraphId,
        nextMapId: mapId,
        ...created,
      },
    };
  };

  /**
   * Install a derived Edit: one fallible step, and then one that refuses
   * nothing this Edit produces.
   *
   * `session.submit` has to come first. `continueInMap` resolves the Graph
   * and the Map against `currentSpace()`, which reads the working snapshot
   * `submit` installs synchronously — before it, neither exists yet and it
   * would refuse. So the order is forced, and the useful consequence is that
   * the only statement here that can *fail* is also the first: a `submit` that
   * throws leaves Navigation untouched rather than half-applied.
   *
   * **The Map is adopted with the Active Graph that belongs to it**, in one
   * call. The Graph is resolved against the Map *this Edit produced* rather
   * than the one it began in — a Map owns its Graphs (ADR 0040), so the
   * pair is one answer, and an intermediate state where the Map has moved
   * and the Graph has not would name a Map beside a Graph some other
   * Map owns, which Navigation refuses.
   *
   * `continueInMap` refuses only a Map that does not draw the Active
   * Graph handed with it — which is that Map's own `activeGraph`, in a
   * snapshot `loadSpaceSnapshot` accepted a line earlier, and intake is
   * precisely the check that a Map's `activeGraph` is one it owns. A null
   * Active Graph names nothing and is exempt. Re-checking any of that *here*
   * would add a branch that cannot be taken, and this repo deletes those rather
   * than keeps them: the guard lives in Navigation because it is Navigation's
   * invariant, held against every caller, and this window is simply a caller
   * that satisfies it.
   */
  const installCompletedEdit = (edit: CompletedEdit): void => {
    installTogether(() => {
      session.submit(edit.snapshot);
      navigation.continueInMap(edit.nextMapId, edit.nextActiveGraphId);
    });
  };

  const performCompletion = (reported: ReportedCompletion): AuthoringResult => {
    const derived = deriveCompletedEdit(reported);
    // `unchanged` and `refused` are already the answer — the core and the
    // interface share one vocabulary rather than translating between two.
    if (derived.kind !== 'completed') return derived;
    const { createdResourceId, createdGraphId } = derived.edit;
    if (reported.embeddedMapId === undefined) {
      installCompletedEdit(derived.edit);
    } else {
      const previous = session.getState().working;
      const snapshot = {
        ...derived.edit.snapshot,
        document: {
          ...derived.edit.snapshot.document,
          defaultMap: previous.document.defaultMap,
        },
      };
      installTogether(() => {
        session.submit(snapshot);
        if (navigation.getState().selectedMapId === reported.embeddedMapId) {
          // A context menu may delete the Graph the target's own canvas shows.
          // Keep its Map, but never leave Navigation naming a removed Graph.
          if (
            reported.completion.kind === 'deleted-graph' &&
            navigation.getState().activeGraphId === reported.completion.graphId
          ) {
            navigation.continueInMap(reported.embeddedMapId, derived.edit.nextActiveGraphId);
          }
        }
      });
    }
    const created: { createdResourceId?: ResourceId; createdGraphId?: GraphId } = {};
    if (createdResourceId !== undefined) created.createdResourceId = createdResourceId;
    if (createdGraphId !== undefined) created.createdGraphId = createdGraphId;
    return { kind: 'completed', ...created };
  };

  let completing = false;
  const queued: QueuedCompletion[] = [];
  const complete = (completion: AuthoringCompletion, embeddedMapId?: UUID): AuthoringResult => {
    if (embeddedMapId !== undefined && currentSpace().lookup.map(embeddedMapId) === undefined) {
      return { kind: 'refused', refusal: { code: 'map-not-found' } };
    }
    const reported: ReportedCompletion = { completion, embeddedMapId };
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
        // ADR 0042: an entry was derived from identities, positions and Resource
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
    const selection = requireDefaultMap(accepted.space);
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
    mapPlacement,
    edgeEligibility,
    complete,
    completeInMap: (mapId, completion) => complete(completion, mapId),
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
