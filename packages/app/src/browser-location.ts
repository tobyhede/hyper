import type { CardId, GraphId, LayoutId } from '@project/core';
import { productDestinationPath, type ProductDestination } from '@project/http';
import { createObservableState, type ObserverErrorReporter } from '@project/persistence';
import { openingPlacement, type ComposedApp } from './compose-app';
import {
  destinationRestoration,
  destinationSync,
  samePosition,
  type AddressedPosition,
} from './destination-coordination';
import type { DestinationOpening } from './destination-opening';
import { resolveLayout } from './layout-resolution';
import { navigationAddress } from './navigation';

/**
 * The whole of what this application asks a browser for.
 *
 * Five members and no more: two reads, two writes and the one event. Injected
 * at composition and **required with no default** — the same rule ADR 0016
 * applies to `newId`, and for the same reason. A default would reinstate the
 * ambient `window` behind the owner's back, and the module would then be
 * reachable only by mounting a DOM.
 *
 * `href` answers the whole current location rather than the path alone, because
 * Copy link resolves a product path against it into an absolute URL.
 */
export interface HistoryApi {
  readonly pathname: () => string;
  readonly href: () => string;
  readonly push: (path: string) => void;
  readonly replace: (path: string) => void;
  readonly onPopState: (listener: () => void) => () => void;
}

/**
 * What the browser location tells the application, and the whole of it.
 *
 * The position this module last decided about is deliberately **not** here: a
 * reader of it could decide about that position a second time, which is exactly
 * what the private bookkeeping exists to prevent.
 */
export interface BrowserLocationState {
  /** The Card the location names, or `null` once a deliberate move leaves it. */
  readonly addressedCardId: CardId | null;
  /** Whether the location the reader arrived at failed to resolve. */
  readonly destinationNotFound: boolean;
}

/** The one module between the application's position and the browser's location. */
export interface BrowserLocation {
  readonly getState: () => BrowserLocationState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * The one Space the location now names.
   *
   * There is one browser location and one history stack, so this module follows
   * exactly one composition at a time — which is what the type says and the
   * mounting used to leave implicit.
   */
  readonly follow: (app: ComposedApp) => void;
  /** A deliberate switch between already composed Spaces updates the address. */
  readonly activate: (app: ComposedApp) => void;
  readonly chooseLayout: (layoutId: LayoutId) => void;
  readonly activateGraph: (graphId: GraphId) => void;
  /** The absolute URL of a destination, for the clipboard to carry. */
  readonly href: (destination: ProductDestination) => string;
  readonly dispose: () => void;
}

/**
 * Own the browser's location for whichever Space is on the canvas (ADR 0081).
 *
 * Navigation answers where the reader is and never learns what a URL is; this
 * asks what the browser should do about that position, and does it. Every rule
 * below was reachable only by mounting a React tree before this module existed,
 * which is why the seam it takes is a five-member interface rather than
 * `window`.
 */
export function createBrowserLocation(
  history: HistoryApi,
  reportObserverError: ObserverErrorReporter = (error) =>
    console.error('Browser location observer failed', error),
  openPath?: (pathname: string) => Promise<void>,
): BrowserLocation {
  let followed: ComposedApp | null = null;
  let unfollow: (() => void) | null = null;
  let addressedCardId: CardId | null = null;
  let destinationNotFound = false;
  /**
   * The position the browser was last told about.
   *
   * Private, and with no reader outside the sync below: publishing it would let
   * a caller decide about a position this has already decided about, which is
   * what makes a redundant notification — StrictMode's second invocation
   * included — write nothing at all. `null` only before the first `follow`.
   */
  let syncedPosition: AddressedPosition | null = null;
  /**
   * Whether the location the reader is on failed to resolve, as the sync last
   * saw it.
   *
   * The decision reads the location, which nothing else can depend on, so this
   * is the one signal that the location moved somewhere the position does not
   * name. Clearing the report is what asks for the stale location to be
   * corrected, which is why it is read here as much as the address is.
   */
  let syncedUnresolved = false;

  const observable = createObservableState<BrowserLocationState>(
    { addressedCardId, destinationNotFound },
    reportObserverError,
  );

  const publish = (): void => {
    const published = observable.getState();
    if (
      published.addressedCardId === addressedCardId &&
      published.destinationNotFound === destinationNotFound
    ) {
      return;
    }
    observable.publish({ addressedCardId, destinationNotFound });
  };

  const positionOf = (app: ComposedApp): AddressedPosition => ({
    ...navigationAddress(app.navigation.getState()),
    addressedCardId,
  });

  /**
   * The one place a position becomes a browser history entry (ADR 0081).
   *
   * It decides exactly once per position: a position it has already decided
   * about is skipped, and the decision then reads the current location rather
   * than tracking whether it wrote it, so after Back the location already opens
   * the restored position and the answer is `none`.
   */
  const sync = (): void => {
    const app = followed;
    const previous = syncedPosition;
    if (app === null || previous === null) return;
    const position = positionOf(app);
    const moved = !samePosition(previous, position);
    if (!moved && syncedUnresolved === destinationNotFound) return;
    syncedUnresolved = destinationNotFound;
    // A location this Space could not resolve is the reader's *arrival*, and
    // only that. It is reported rather than corrected, because rewriting it on
    // arrival would take the entry they navigated to — but the report is
    // answered the moment the position moves, whether the move came from a
    // choice or from presenting, and holding it past that would strand every
    // move after it behind a path that 404s on reload and is what Copy link
    // copies. So the guard holds the arrival and nothing after it.
    if (destinationNotFound && !moved) return;
    syncedPosition = position;
    const decision = destinationSync({
      space: app.currentSpace(),
      snapshot: app.authoring.getState().session.working,
      pathname: history.pathname(),
      position,
      synced: previous,
    });
    if (decision.kind === 'none') return;
    // Writing the location is what clears the report, rather than a second
    // thing every caller has to remember.
    destinationNotFound = false;
    syncedUnresolved = false;
    const path = productDestinationPath(decision.destination);
    if (decision.kind === 'push') history.push(path);
    else history.replace(path);
  };

  /**
   * Decide about the result of an operation, and tell subscribers.
   *
   * Every operation below writes the whole of its own state *before* it moves a
   * collaborator, so a notification a collaborator raises part-way through
   * already sees the settled position and decides the same thing this does. The
   * second decision is then a no-op: `sync` skips a position it has recorded
   * and `publish` skips a state that has not changed. That ordering is the
   * functional-core rule the repository already asks for, and it is what makes
   * a window around each operation unnecessary.
   */
  const settle = (): void => {
    sync();
    publish();
  };

  /**
   * Open the complete application state a destination names.
   *
   * One decision resolved from one Space, applied in an order that cannot leave
   * the two collaborators disagreeing: both steps that may refuse the selection
   * run first — the resolve here and Navigation's own — and the render adapter
   * update is a plain store write that cannot fail.
   *
   * Private, because arriving is not a capability a surface spends: both the
   * reader's Back and their Layout choice are arrivals, and a third caller
   * would be a third answer to "what does this destination open".
   */
  const arriveAt = (opening: DestinationOpening): void => {
    const app = followed;
    if (app === null) return;
    // Choosing a destination is what answers a failed restoration, and it
    // answers it whether or not the choice moves the address — so this
    // belongs to the choice rather than to the history entry it may not earn.
    destinationNotFound = false;
    const resolved = resolveLayout(app.currentSpace(), opening.selection);
    const changesLayout = app.navigation.getState().selectedLayoutId !== opening.selection;
    if (opening.graphId === null) app.navigation.selectLayout(opening.selection);
    else if (opening.presentationCardId === null) {
      app.navigation.openGraph(opening.selection, opening.graphId);
    } else {
      app.navigation.openPresentation(
        opening.selection,
        opening.graphId,
        opening.presentationCardId,
      );
    }
    // A current row can be chosen again. Its UUID is already the Navigation
    // value, so no Layout dependency will change and no placement effect will
    // rerun; clearing the published projection here would strand the canvas in
    // its pending state. Navigation still receives the choice so it can apply
    // its own same-Layout semantics.
    if (!changesLayout) return;
    app.adapter.getState().selectLayout(openingPlacement(resolved));
  };

  /**
   * A move the reader made: it clears the addressed Card and answers the report.
   *
   * Shared rather than written out per operation, because the two that make one
   * — choosing a Layout row and activating a Graph — differed only in that one
   * of them got the report clear transitively and the other hand-rolled it.
   * What they still differ in is the render adapter, and that difference is the
   * point: activating a Graph does not change the Layout, so it must not clear
   * the published projection.
   */
  const deliberateMove = (move: () => void): void => {
    addressedCardId = null;
    destinationNotFound = false;
    move();
    settle();
  };

  /**
   * Choosing a Layout row, including the row already current.
   *
   * The repeated choice is not a no-op and must not be skipped:
   * `navigation.selectLayout` publishes `mode: 'overview'`, so choosing the
   * current row is how an author leaves a presentation. Whether that earns a
   * history entry is not asked here at all — the position it produces is what
   * the sync decides from (ADR 0081).
   */
  const chooseLayout = (layoutId: LayoutId): void => {
    deliberateMove(() => {
      arriveAt({
        selection: layoutId,
        graphId: null,
        presentationCardId: null,
        cardId: null,
      });
    });
  };

  /**
   * Same rule as {@link chooseLayout}, for the same reason: activating the
   * Graph that is already active publishes `mode: 'overview'`, which is how the
   * Graph row leaves a presentation, so the call may not be skipped.
   */
  const activateGraph = (graphId: GraphId): void => {
    const app = followed;
    if (app === null) return;
    deliberateMove(() => app.navigation.activateGraph(graphId));
  };

  const restoreFollowed = (): void => {
    const app = followed;
    if (app === null) return;
    const restoration = destinationRestoration(
      app.currentSpace(),
      app.authoring.getState().session.working,
      history.pathname(),
    );
    if (restoration.kind !== 'opening') {
      destinationNotFound = restoration.kind === 'not-found';
      settle();
      return;
    }
    // Before `arriveAt`, not after: the Card is known the moment the
    // restoration resolves, and moving Navigation first would notify against a
    // position carrying the Card the reader is leaving.
    addressedCardId = restoration.opening.cardId;
    destinationNotFound = false;
    arriveAt(restoration.opening);
    settle();
  };

  let restorationRequest = 0;
  const restore = (): void => {
    if (openPath === undefined) {
      restoreFollowed();
      return;
    }
    const request = ++restorationRequest;
    const pathname = history.pathname();
    void openPath(pathname).then(
      () => {
        if (request === restorationRequest && history.pathname() === pathname) restoreFollowed();
      },
      () => {
        if (request !== restorationRequest || history.pathname() !== pathname) return;
        destinationNotFound = true;
        publish();
      },
    );
  };
  const releasePopState = history.onPopState(restore);

  /**
   * Begin following one composition, deciding nothing.
   *
   * The position recorded here is the one the application is already at, which
   * is what makes following decide nothing at all: startup read the location
   * once and composed from it, so correcting the location here could only undo
   * a Back the reader took before this listener existed. The addressed Card is
   * read off that same location rather than carried in — it is a fact about the
   * location and the Space now shown, not about a mounted component's lifetime.
   */
  const follow = (app: ComposedApp): void => {
    if (followed === app) return;
    unfollow?.();
    followed = app;
    const restoration = destinationRestoration(
      app.currentSpace(),
      app.authoring.getState().session.working,
      history.pathname(),
    );
    addressedCardId = restoration.kind === 'opening' ? restoration.opening.cardId : null;
    destinationNotFound = false;
    syncedUnresolved = false;
    syncedPosition = positionOf(app);
    unfollow = app.authoring.subscribe(settle);
    publish();
  };

  return {
    getState: observable.getState,
    subscribe: observable.subscribe,
    follow,
    activate: (app) => {
      const previous = syncedPosition;
      follow(app);
      // Back and Forward have already moved the browser. Restore that complete
      // destination before deriving a write from the arriving Space's retained
      // Navigation, which may still name a different Layout or Graph.
      const restoration = destinationRestoration(
        app.currentSpace(),
        app.authoring.getState().session.working,
        history.pathname(),
      );
      if (restoration.kind === 'opening') {
        restoreFollowed();
        return;
      }
      if (previous !== null) {
        syncedPosition = previous;
        settle();
      }
    },
    chooseLayout,
    activateGraph,
    href: (destination) => new URL(productDestinationPath(destination), history.href()).href,
    dispose: () => {
      restorationRequest += 1;
      releasePopState();
      unfollow?.();
      unfollow = null;
      followed = null;
      observable.clearSubscribers();
    },
  };
}
