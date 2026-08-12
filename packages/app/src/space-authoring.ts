import {
  newUuid,
  type CardDocument,
  type CardId,
  type GraphId,
  type LayoutPosition,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
import {
  createNonThrowingReporter,
  createObservableState,
  type ObserverErrorReporter,
  type SpaceSession,
  type SpaceSessionState,
} from '@project/persistence';
import type { Navigation, NavigationState } from './navigation';
import { updatePositionedLayout } from './snapshot';
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
  /** The Graph this same Edit minted, which Navigation must therefore activate. */
  readonly mintedGraphId: GraphId | null;
  /** The Layout this Edit wrote, which Navigation continues in. */
  readonly nextRenderer: RendererSelection;
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
  readonly initialPlacement?: Placement | null;
  readonly reportObserverError?: ObserverErrorReporter;
}

/**
 * The next `<Prefix> N` above the highest one already taken.
 *
 * One past the highest rather than one past the count, so deleting the middle
 * of a numbered set never mints a title that is already in use. Unnumbered
 * titles an author wrote contribute nothing. `BigInt` because the number comes
 * from a title and has no bound; the prefixes are the three literals below, so
 * the built pattern carries nothing to escape.
 */
function nextNumberedTitle(prefix: string, titles: Iterable<string>): string {
  const numbered = new RegExp(`^${prefix} ([1-9]\\d*)$`);
  let highest = 0n;
  for (const title of titles) {
    const match = numbered.exec(title);
    if (match?.[1] === undefined) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `${prefix} ${highest + 1n}`;
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

const nextGraphTitle = (snapshot: SpaceSnapshot): string =>
  nextNumberedTitle(
    'Graph',
    snapshot.document.graphs.map((graph) => graph.title),
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
  initialPlacement = null,
  reportObserverError = (error) => console.error('SpaceAuthoring observer failed', error),
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

  const canConnect = (from: CardId, to: CardId): boolean => {
    if (placement === null) return false;
    const snapshot = session.getState().working;
    if (!snapshot.cards.some((card) => card.id === from)) return false;
    if (!snapshot.cards.some((card) => card.id === to)) return false;
    const graphId = navigation.getState().activeGraphId;
    if (graphId === null) return snapshot.document.graphs.length === 0;
    const graph = snapshot.document.graphs.find((candidate) => candidate.id === graphId);
    return graph !== undefined && !graph.edges.some((edge) => edge.from === from && edge.to === to);
  };

  const canCreateConnectedCard = (from: CardId): boolean => {
    if (placement === null) return false;
    const snapshot = session.getState().working;
    if (!snapshot.cards.some((card) => card.id === from)) return false;
    const graphId = navigation.getState().activeGraphId;
    return (
      (graphId === null && snapshot.document.graphs.length === 0) ||
      snapshot.document.graphs.some((graph) => graph.id === graphId)
    );
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
    let activeGraphId = navigationState.activeGraphId;
    let mintedGraphId: GraphId | null = null;
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
      createdCardId = newUuid();
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
    if (connection !== null) {
      if (activeGraphId === null) {
        mintedGraphId = newUuid();
        activeGraphId = mintedGraphId;
        snapshot = {
          ...snapshot,
          document: {
            ...snapshot.document,
            graphs: [
              ...snapshot.document.graphs,
              {
                id: mintedGraphId,
                title: nextGraphTitle(snapshot),
                edges: [connection],
              },
            ],
          },
        };
      } else {
        const graphIndex = snapshot.document.graphs.findIndex(
          (graph) => graph.id === activeGraphId,
        );
        const graph = snapshot.document.graphs[graphIndex];
        if (graph === undefined) return null;
        const graphs = [...snapshot.document.graphs];
        graphs[graphIndex] = {
          ...graph,
          edges: [...graph.edges, connection],
        };
        snapshot = { ...snapshot, document: { ...snapshot.document, graphs } };
      }
    }
    const renderer = navigationState.selectedRenderer;
    const layoutId: UUID = renderer.kind === 'view' ? newUuid() : renderer.layoutId;
    const existing =
      renderer.kind === 'layout'
        ? (snapshot.document.layouts ?? []).find((layout) => layout.id === renderer.layoutId)
        : undefined;
    if (renderer.kind === 'layout' && existing === undefined) return null;
    const next = updatePositionedLayout(snapshot, {
      layoutId,
      title: existing?.title ?? nextLayoutTitle(snapshot),
      positions: completedPlacement,
      activeGraphId,
      mintedGraphId,
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
      mintedGraphId,
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
   * **The renderer is adopted before the minted Graph is activated**, because
   * Navigation's guards resolve the *selected* renderer and this Edit's answer
   * is `nextRenderer`. Activating first asked the renderer the Edit began in,
   * which is not the renderer the Edit produced, and it only ever agreed by
   * accident: an outgoing Layout happens to share the id of the Layout written
   * back into it, and an outgoing Algorithmic View filters nothing so any
   * answer passed. Neither accident is a reason, and the second hides the case
   * that would break.
   *
   * In that order the three statements below refuse nothing, and each for a
   * reason this Edit established rather than by having no guard to trip:
   *
   * - `install` decides nothing and reads nothing.
   * - `continueInRenderer` resolves a Layout `updatePositionedLayout` wrote into
   *   the snapshot `submit` just installed, and refuses only a Layout that does
   *   not show the current Active Graph — which is the same Graph that Layout
   *   names as its `activeGraph`, on a snapshot `loadSpaceSnapshot` accepted a
   *   line earlier, and intake is exactly what checks that pairing. A null
   *   Active Graph names nothing and is exempt.
   * - `activateGraph` resolves that same adopted Layout. The minted Graph is in
   *   the snapshot's Graphs, and the Layout shows it either by carrying no
   *   filter (a Layout converted from an Algorithmic View has none) or by the
   *   widening `updatePositionedLayout` performed in the write that added it.
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
      navigation.continueInRenderer(edit.nextRenderer);
      if (edit.mintedGraphId !== null) navigation.activateGraph(edit.mintedGraphId);
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
