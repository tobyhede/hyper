import {
  newUuid,
  type CardDocument,
  type CardId,
  type SpaceSnapshot,
  type UUID,
} from '@project/core';
import { loadSpaceSnapshot, Placement, type LayoutPoint } from '@project/graph';
import type { SpaceSession, SpaceSessionState } from '@project/persistence';
import type { Navigation, NavigationState } from './navigation';
import { updatePositionedLayout } from './snapshot';
import { defaultRenderer, resolveView, type RendererSelection } from './view';

export type AuthoringCompletion =
  | { readonly kind: 'settled-card-movement' }
  | { readonly kind: 'connected-cards'; readonly from: CardId; readonly to: CardId }
  | { readonly kind: 'edited-card'; readonly cardId: CardId }
  | {
      readonly kind: 'create-and-connect';
      readonly from: CardId;
      readonly position: LayoutPoint;
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
  /** Advances when a replacement Space is opened without recreating Authoring. */
  readonly opening: number;
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
  readonly installPlacement: (placement: Placement | null) => void;
  /**
   * Install an editor's completed Card value before it reports the Edit.
   *
   * One hand-off, not a standing entry: the value is consumed by the
   * `edited-card` completion that carries it, whether or not that produced an
   * Edit. An editor that installs and then never reports leaves nothing behind.
   */
  readonly installCardDocument: (cardId: CardId, document: CardDocument) => void;
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
  /** The Route this same Edit minted, which Navigation must therefore activate. */
  readonly mintedRouteId: UUID | null;
  /** The Layout this Edit wrote, which Navigation continues in. */
  readonly nextRenderer: RendererSelection;
  readonly createdCardId?: CardId;
}

interface SpaceAuthoringDependencies {
  readonly session: SpaceSession;
  readonly navigation: Navigation;
  readonly initialPlacement?: Placement | null;
  readonly reportObserverError?: (error: unknown) => void;
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

const nextRouteTitle = (snapshot: SpaceSnapshot): string =>
  nextNumberedTitle(
    'Route',
    snapshot.document.routes.map((route) => route.title),
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

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { readonly then?: unknown }).then === 'function'
  );
}

export function createSpaceAuthoring({
  session,
  navigation,
  initialPlacement = null,
  reportObserverError = (error) => console.error('SpaceAuthoring observer failed', error),
}: SpaceAuthoringDependencies): SpaceAuthoring {
  let placement: Placement | null = initialPlacement;
  const cardDocuments = new Map<CardId, CardDocument>();
  let opening = 0;
  let installing = 0;
  let state: SpaceAuthoringState;
  // Held as `() => unknown` although `subscribe` accepts `() => void`: a `void`
  // expression cannot be inspected, which is exactly how an async listener's
  // rejection gets to disappear. Widening here keeps the published contract
  // synchronous while letting `publish` see what came back.
  const listeners = new Set<() => unknown>();

  // The one way placement is written — every path goes through here, including
  // Edit completion and accepting a stored Space.
  //
  // Identity is load-bearing, not just the value: `usePlacementRendering`
  // rebuilds the positioned strategy whenever this changes identity and re-runs
  // layout, so an equal placement pushed in by a projection must keep the one it
  // already has or every projection would re-arrange a settled graph. A
  // completed Edit needs no help getting its re-layout — it replaces the working
  // snapshot, and the `LayoutGraph` derived from it re-fires the same effect.
  const install = (nextPlacement: Placement | null): void => {
    if (Placement.equals(placement, nextPlacement)) return;
    placement = nextPlacement;
  };

  const snapshotState = (): SpaceAuthoringState => ({
    opening,
    session: session.getState(),
    navigation: navigation.getState(),
  });
  state = snapshotState();

  const safelyReport = (error: unknown): void => {
    try {
      reportObserverError(error);
    } catch {
      // Diagnostics cannot interrupt Authoring.
    }
  };

  const publish = (): void => {
    state = snapshotState();
    // Iterate a copy: a Set visits entries added mid-iteration, so a listener
    // that subscribes during publication would be notified about a state it was
    // not yet watching — and how many times depends on where it was added.
    for (const listener of [...listeners]) {
      try {
        // Notification stays synchronous — `useSyncExternalStore` reads
        // `getState` straight after and nothing here awaits. But `() => void`
        // admits an async listener by TypeScript's return-type bivariance, and
        // its rejection would land nowhere near this catch: Node answers an
        // unhandled rejection by ending the process, which is the one outcome a
        // non-throwing publisher exists to prevent.
        const settled = listener();
        if (isThenable(settled)) void settled.then(undefined, safelyReport);
      } catch (error) {
        safelyReport(error);
      }
    }
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
    const routeId = navigation.getState().activeRouteId;
    if (routeId === null) return snapshot.document.routes.length === 0;
    const route = snapshot.document.routes.find((candidate) => candidate.id === routeId);
    return route !== undefined && !route.edges.some((edge) => edge.from === from && edge.to === to);
  };

  const canCreateConnectedCard = (from: CardId): boolean => {
    if (placement === null) return false;
    const snapshot = session.getState().working;
    if (!snapshot.cards.some((card) => card.id === from)) return false;
    const routeId = navigation.getState().activeRouteId;
    return (
      (routeId === null && snapshot.document.routes.length === 0) ||
      snapshot.document.routes.some((route) => route.id === routeId)
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
  const deriveCompletedEdit = (
    completion: AuthoringCompletion,
    completedPlacementInput: Placement | null,
    completedCardDocuments: ReadonlyMap<CardId, CardDocument>,
  ): CompletedEdit | null => {
    if (completedPlacementInput === null) return null;
    let snapshot = session.getState().working;
    const previousSnapshot = snapshot;
    const navigationState = navigation.getState();
    let activeRouteId = navigationState.activeRouteId;
    let mintedRouteId: UUID | null = null;
    let createdCardId: CardId | undefined;
    let connection: { readonly from: CardId; readonly to: CardId } | null = null;
    let completedPlacement = completedPlacementInput;
    if (completion.kind === 'edited-card') {
      const document = completedCardDocuments.get(completion.cardId);
      const cardIndex = snapshot.cards.findIndex((card) => card.id === completion.cardId);
      const card = snapshot.cards[cardIndex];
      if (
        document === undefined ||
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
      if (activeRouteId === null) {
        mintedRouteId = newUuid();
        activeRouteId = mintedRouteId;
        snapshot = {
          ...snapshot,
          document: {
            ...snapshot.document,
            routes: [
              ...snapshot.document.routes,
              {
                id: mintedRouteId,
                title: nextRouteTitle(snapshot),
                edges: [connection],
              },
            ],
          },
        };
      } else {
        const routeIndex = snapshot.document.routes.findIndex(
          (route) => route.id === activeRouteId,
        );
        const route = snapshot.document.routes[routeIndex];
        if (route === undefined) return null;
        const routes = [...snapshot.document.routes];
        routes[routeIndex] = {
          ...route,
          edges: [...route.edges, connection],
        };
        snapshot = { ...snapshot, document: { ...snapshot.document, routes } };
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
      activeRouteId,
      mintedRouteId,
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
      mintedRouteId,
      nextRenderer: { kind: 'layout', layoutId },
      ...(createdCardId !== undefined ? { createdCardId } : {}),
    };
  };

  /**
   * Install a derived Edit: one fallible step, and then three that cannot fail.
   *
   * `session.submit` has to come first. Both Navigation calls resolve the Route
   * and the Layout against `currentSpace()`, which reads the working snapshot
   * `submit` installs synchronously — before it, neither exists yet and both
   * would refuse. So the order is forced, and the useful consequence is that
   * the only statement here that can throw is also the first: no later failure
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
   * The three statements below are total given the session honoured `submit`,
   * which is its documented synchronous contract. Re-checking the Route and the
   * Layout here against the snapshot that just passed domain intake would add a
   * branch that cannot be taken, and this repo deletes those rather than keeps
   * them.
   */
  const installCompletedEdit = (edit: CompletedEdit): void => {
    installTogether(() => {
      session.submit(edit.snapshot);
      install(edit.placement);
      if (edit.mintedRouteId !== null) navigation.activateRoute(edit.mintedRouteId);
      navigation.continueInRenderer(edit.nextRenderer);
    });
  };

  const performCompletion = (
    completion: AuthoringCompletion,
    completedPlacementInput: Placement | null,
    completedCardDocuments: ReadonlyMap<CardId, CardDocument>,
  ): AuthoringResult => {
    const edit = deriveCompletedEdit(completion, completedPlacementInput, completedCardDocuments);
    if (edit === null) return { kind: 'no-edit' };
    installCompletedEdit(edit);
    return edit.createdCardId === undefined
      ? { kind: 'completed' }
      : { kind: 'completed', createdCardId: edit.createdCardId };
  };

  let completing = false;
  const queued: {
    readonly completion: AuthoringCompletion;
    readonly placement: Placement | null;
    readonly cardDocuments: ReadonlyMap<CardId, CardDocument>;
  }[] = [];
  const complete = (completion: AuthoringCompletion): AuthoringResult => {
    const installedPlacement = placement;
    const installedCardDocuments = new Map(cardDocuments);
    // An installed Card value is one hand-off, consumed by the report that
    // carries it — including a queued one, which took its copy above. Left
    // standing by a completion that produced no Edit it becomes state waiting to
    // be applied by whatever `edited-card` arrives next: a rename the author
    // abandoned, landing on a Space they have since changed. Copied first, so
    // the completion this call reports still reads what it installed.
    if (completion.kind === 'edited-card') cardDocuments.delete(completion.cardId);
    if (completing) {
      queued.push({
        completion,
        placement: installedPlacement,
        cardDocuments: installedCardDocuments,
      });
      return { kind: 'queued' };
    }
    completing = true;
    try {
      const result = performCompletion(completion, installedPlacement, installedCardDocuments);
      // Drain what arrived during publication. A queued Edit that cannot produce
      // a valid Space is a diagnostic, not this Edit's outcome: the completion
      // that drained the queue already installed and published, and charging it
      // someone else's failure would name the wrong Edit as the broken one.
      // Draining stops there — the rest of the queue was written against state
      // that never came about.
      while (queued.length > 0) {
        const next = queued.shift();
        if (next === undefined) continue;
        try {
          performCompletion(next.completion, next.placement, next.cardDocuments);
        } catch (error) {
          safelyReport(error);
          break;
        }
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
   * the placement and Navigation are all replaced in place, and `opening`
   * advancing is what tells the renderer its nodes describe a Space that is
   * gone.
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
      cardDocuments.clear();
      navigation.openFresh(renderer);
      opening += 1;
    });
    return null;
  };

  return {
    getState: () => state,
    authoredPlacement: () =>
      navigation.getState().selectedRenderer.kind === 'layout' ? placement : null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    installPlacement: install,
    installCardDocument: (cardId, document) => cardDocuments.set(cardId, document),
    canConnect,
    canCreateConnectedCard,
    complete,
    retryPersistence: session.retry,
    acceptStoredSpace,
    dispose: () => {
      unsubscribeSession();
      unsubscribeNavigation();
      listeners.clear();
    },
  };
}
