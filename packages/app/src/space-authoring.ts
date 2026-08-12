import {
  newUuid,
  type CardDocument,
  type CardId,
  type Graph,
  type GraphId,
  type LayoutPosition,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { getLayout, loadSpaceSnapshot, Placement, type Space } from '@project/graph';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type SpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import type { Navigation, NavigationState } from './navigation';
import { updatePositionedLayout } from './snapshot';
import { nextNumberedTitle } from './titles';
import { defaultRenderer, resolveView, type RendererSelection } from './view';

export type AuthoringCompletion =
  | {
      readonly kind: 'settled-card-movement';
      readonly rendered: Placement;
      readonly placed: readonly CardId[];
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
    };

export type AuthoringResult =
  | { readonly kind: 'completed'; readonly createdCardId?: CardId }
  | { readonly kind: 'no-edit' }
  | { readonly kind: 'queued' };

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
   * The installed placement, and only when the selected renderer is an authored
   * Layout — an Algorithmic View computes its own positions.
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
  readonly canConnect: (from: CardId, to: CardId) => boolean;
  readonly canCreateConnectedCard: (from: CardId) => boolean;
  readonly complete: (completion: AuthoringCompletion) => AuthoringResult;
  readonly retryPersistence: () => void;
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
  readonly nextRenderer: RendererSelection;
  /**
   * The Active Graph of that Layout, which Navigation adopts along with it.
   *
   * Not "the Graph this Edit minted": under ADR 0040 a Layout owns its Graphs,
   * so which one is active is a fact about the Layout this Edit wrote and not a
   * separate consequence. A conversion answers the Graph it minted, an Edit on a
   * selected Layout answers the one already active there, and the two reach
   * Navigation the same way.
   */
  readonly nextActiveGraphId: GraphId | null;
  readonly createdCardId?: CardId;
}

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
   * The same reader Navigation is given, so both resolve a view against one
   * `Space` identity and one parse. Authoring needs it because which Layout an
   * Edit writes, and what that Layout owns, is the *View's* answer now — and
   * `resolveView` takes a Space (ADR 0045).
   */
  readonly currentSpace: () => Space;
  readonly initialPlacement?: Placement | null;
  readonly reportObserverError?: ObserverErrorReporter;
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
   */
  readonly newId?: () => UUID;
}

function isSupportedCardEdit(previous: CardDocument, next: CardDocument): boolean {
  if (previous.kind !== next.kind) return false;
  if (previous.kind === 'markdown') return next.kind === 'markdown';
  return (
    next.kind === 'alias' &&
    previous.target === next.target &&
    previous.description === next.description
  );
}

const nextLayoutTitle = (snapshot: SpaceSnapshot): string =>
  nextNumberedTitle(
    'Layout',
    (snapshot.document.layouts ?? []).map((layout) => layout.title),
  );

export const nextCardTitle = (snapshot: SpaceSnapshot): string =>
  nextNumberedTitle(
    'Card',
    snapshot.cards.map((card) => card.document.title),
  );

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
  initialPlacement = null,
  reportObserverError = (error) => console.error('SpaceAuthoring observer failed', error),
  newId = newUuid,
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

  const mergeBase = (): Placement | null =>
    navigation.getState().selectedRenderer.kind === 'layout' ? placement : null;

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
   * The Graph a connection drawn right now would land in, or `null` when the
   * Edit would mint one.
   *
   * **Only a selected Layout has an answer.** An Algorithmic View is *converted*
   * by the Edit (ADR 0025), and the Layout that conversion produces owns a Graph
   * the View mints on the way out (ADR 0045) — so the Edge joins a Graph that
   * does not exist yet, whatever Graph the author happens to be emphasising.
   * That emphasis belongs to some other Layout and is not where the Edge goes.
   *
   * A Layout the Space no longer holds answers `null` too: it names no Graph,
   * and the completion that follows refuses for that reason rather than this one.
   */
  const targetGraph = (): Graph | null => {
    const { selectedRenderer, activeGraphId } = navigation.getState();
    if (selectedRenderer.kind === 'view') return null;
    // Through `currentSpace()` and its index rather than scanning the working
    // document, so ownership is resolved the one way the derivation resolves it
    // (ADR 0040). Two walks over the same layouts would be two answers to
    // "which Layout is selected" the moment either learned something.
    const layout = getLayout(currentSpace(), selectedRenderer.layoutId);
    return layout?.graphs.find((graph) => graph.id === activeGraphId) ?? null;
  };

  /**
   * Whether a Card is one an Edge this gesture authors may name at all.
   *
   * Two conditions, and the second is ADR 0040's closure read forwards. A Card
   * of the Space is not necessarily a Card of the Layout the Edit writes: a
   * Layout's members **are** its position keys, and the completed placement is
   * what those keys are about to become. An Edge naming a Card outside it
   * derives a Space intake rejects, and `deriveCompletedEdit` answers an
   * unloadable Space by throwing — right for a bug, wrong for a gesture the
   * author can make. While the omitted-Card fallback band still draws a Card its
   * Layout leaves out, they can: refusing here is what keeps that a refusal.
   *
   * Reading the installed placement rather than the stored Layout is deliberate.
   * It is the same value the completion reports, so the preview and the
   * completion cannot disagree; and it is the only one that answers on an
   * Algorithmic View, which has no Layout to consult and whose conversion
   * returns exactly these Cards.
   */
  const connectable = (cardId: CardId): boolean =>
    placement !== null &&
    placement.has(cardId) &&
    session.getState().working.cards.some((card) => card.id === cardId);

  /**
   * Whether an Edge from one Card to another is one this gesture may author.
   *
   * The duplicate refusal is **conditional on a selected Layout**, and that is
   * not an omission on the other branch. An exact duplicate within one Graph is
   * what intake rejects (ADR 0032), so it can only be a duplicate of an Edge in
   * the Graph the Edge is about to join — and on an Algorithmic View that Graph
   * is the empty one conversion is about to mint, which holds nothing to
   * duplicate. Refusing there would refuse the *first* connection an author
   * draws on a Space that already has Graphs, silently and with no way to tell
   * why.
   */
  const canConnect = (from: CardId, to: CardId): boolean => {
    if (!connectable(from) || !connectable(to)) return false;
    if (navigation.getState().selectedRenderer.kind === 'view') return true;
    const graph = targetGraph();
    return graph !== null && !graph.edges.some((edge) => edge.from === from && edge.to === to);
  };

  /**
   * The mirror of the above for an Option/Alt empty drop, which authors a Card
   * and the Edge reaching it in one Edit (ADR 0033).
   *
   * No duplicate is possible against a Card that does not exist yet, so what is
   * left is whether the Edge has a Graph to land in: on an Algorithmic View,
   * conversion mints one, so the answer is simply true; on a selected Layout,
   * the Active Graph must be one that Layout owns.
   *
   * The signature is `(from: CardId) => boolean` and stays that way —
   * `connection-gesture` consumes it as its `accepts` capability, asked per
   * pointer frame by both the live preview and the release.
   */
  const canCreateConnectedCard = (from: CardId): boolean => {
    if (!connectable(from)) return false;
    if (navigation.getState().selectedRenderer.kind === 'view') return true;
    return targetGraph() !== null;
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
   * `null` is a refusal, and refusing is not a failure: an Edit that changes
   * nothing, names a Card the Space no longer holds, or targets a Layout that
   * has gone is simply not an Edit. Producing an unloadable Space *is* a
   * failure, and it throws — here, where the collaborators are all still level.
   */
  const deriveCompletedEdit = ({
    completion,
    placement: reportedPlacement,
  }: ReportedCompletion): CompletedEdit | null => {
    if (reportedPlacement === null) return null;
    let snapshot = session.getState().working;
    const previousSnapshot = snapshot;
    const navigationState = navigation.getState();
    const renderer = navigationState.selectedRenderer;
    const space = currentSpace();
    // A selected Layout the Space no longer holds is not an Edit. Checked before
    // resolving, because `resolveView` answers that case by throwing.
    if (renderer.kind === 'layout' && getLayout(space, renderer.layoutId) === undefined) {
      return null;
    }
    const view = resolveView(space, renderer);
    let createdCardId: CardId | undefined;
    let connection: { readonly from: CardId; readonly to: CardId } | null = null;
    let completedPlacement = reportedPlacement;
    if (completion.kind === 'edited-card') {
      const { document } = completion;
      const cardIndex = snapshot.cards.findIndex((card) => card.id === completion.cardId);
      const card = snapshot.cards[cardIndex];
      if (
        card === undefined ||
        !isSupportedCardEdit(card.document, document) ||
        sameValue(card.document, document)
      ) {
        return null;
      }
      const cards = [...snapshot.cards];
      cards[cardIndex] = { id: card.id, document };
      snapshot = { ...snapshot, cards };
    } else if (completion.kind === 'create-and-connect') {
      if (!canCreateConnectedCard(completion.from)) return null;
      createdCardId = newId();
      connection = { from: completion.from, to: createdCardId };
      completedPlacement = Placement.place(completedPlacement, createdCardId, completion.position);
      snapshot = {
        ...snapshot,
        cards: [
          ...snapshot.cards,
          {
            id: createdCardId,
            document: { title: nextCardTitle(snapshot), kind: 'markdown', body: '' },
          },
        ],
      };
    } else if (completion.kind === 'connected-cards') {
      if (!canConnect(completion.from, completion.to)) return null;
      connection = { from: completion.from, to: completion.to };
    }
    // Which Layout this Edit writes, and what it owns afterwards.
    //
    // The two branches are the whole of ADR 0025's "editing an Algorithmic View
    // converts it", now that a Graph is an owned value (ADR 0040). Converting
    // asks the *View* for the Layout's content, because that is where the choice
    // lives (ADR 0045) — Flow answers a fresh empty Graph, and `convertView` has
    // already held that answer to closure and fresh identity. A selected Layout
    // is not converted: it keeps its id, its title and the Graph identities it
    // already owns, and the Edit writes into them.
    let layoutId: UUID;
    let layoutTitle: string;
    let ownedGraphs: readonly Graph[];
    let activeGraphId: GraphId | null;
    if (view.layout === null) {
      const converted = view.convert(completedPlacement, newId);
      completedPlacement = converted.positions;
      layoutId = newId();
      layoutTitle = nextLayoutTitle(snapshot);
      ownedGraphs = converted.graphs;
      // The first Graph a conversion returns is the one the new Layout opens
      // on — the same rule an absent `activeGraph` is read by (ADR 0026), taken
      // here rather than left to be resolved because what is written down must
      // not depend on Graph order (ADR 0028). The Graph the author was merely
      // emphasising belongs to another Layout and does not come across.
      activeGraphId = converted.graphs[0].id;
    } else {
      layoutId = view.layout.id;
      layoutTitle = view.layout.title;
      ownedGraphs = view.layout.graphs;
      activeGraphId = navigationState.activeGraphId;
    }
    if (connection !== null) {
      const graphIndex = ownedGraphs.findIndex((graph) => graph.id === activeGraphId);
      const graph = ownedGraphs[graphIndex];
      if (graph === undefined) return null;
      const graphs = [...ownedGraphs];
      graphs[graphIndex] = { ...graph, edges: [...graph.edges, connection] };
      ownedGraphs = graphs;
    }
    const next = updatePositionedLayout(snapshot, {
      layoutId,
      title: layoutTitle,
      positions: completedPlacement,
      graphs: ownedGraphs,
      activeGraphId,
    });
    if (sameSnapshot(previousSnapshot, next)) return null;
    const loaded = loadSpaceSnapshot(next);
    if (!loaded.ok) {
      throw new Error(
        `Authoring produced an invalid Space: ${loaded.errors
          .map((error) => error.message)
          .join('; ')}`,
      );
    }
    return {
      snapshot: next,
      placement: completedPlacement,
      nextActiveGraphId: activeGraphId,
      nextRenderer: { kind: 'layout', layoutId },
      ...(createdCardId !== undefined ? { createdCardId } : {}),
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
   * where the renderer has moved and the Graph has not is no longer merely
   * awkward: on a conversion it names a Layout beside a Graph some *other*
   * Layout owns, which is exactly the pair Navigation refuses.
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
    const edit = deriveCompletedEdit(reported);
    if (edit === null) return { kind: 'no-edit' };
    installCompletedEdit(edit);
    return edit.createdCardId === undefined
      ? { kind: 'completed' }
      : { kind: 'completed', createdCardId: edit.createdCardId };
  };

  let completing = false;
  const queued: QueuedCompletion[] = [];
  const complete = (completion: AuthoringCompletion): AuthoringResult => {
    const completedPlacement =
      completion.kind === 'edited-card'
        ? placement
        : Placement.next(
            mergeBase(),
            completion.rendered,
            completion.kind === 'settled-card-movement' ? completion.placed : [],
          );
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
        // save it, and why this skips rather than stops, is AGENTS.md's
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
   * leaving the stale workspace on screen.
   *
   * Refusing changes nothing — local work, conflict and every control survive —
   * so it answers with the reason and leaves the workspace alone. The caller
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
    const accepted = loadSpaceSnapshot(persistence.current.snapshot);
    if (!accepted.ok) {
      return `The remote space is invalid and was not accepted:\n${accepted.errors
        .map((error) => `  - ${error.message}`)
        .join('\n')}`;
    }
    const renderer = defaultRenderer(accepted.space);
    const resolved = resolveView(accepted.space, renderer);
    const acceptedPlacement =
      resolved.layout === null ? null : Placement.fromLayout(resolved.layout);
    installTogether(() => {
      session.acceptRemote();
      install(acceptedPlacement);
      navigation.openFresh(renderer);
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
    canConnect,
    canCreateConnectedCard,
    complete,
    retryPersistence: session.retry,
    acceptStoredSpace,
    dispose: () => {
      unsubscribeSession();
      unsubscribeNavigation();
      observable.clearSubscribers();
    },
  };
}
