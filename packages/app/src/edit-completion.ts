import { newUuid, type CardId, type RouteId, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type LayoutPoint, type Space } from '@project/graph';
import type { SpaceSession } from '@project/persistence';
import {
  createEditorStore,
  type CompletedConnectionEdit,
  type EditorConnectionEligibility,
  type EditorStore,
} from './editor';
import { updatePositionedLayout } from './snapshot';
import type { Navigation } from './navigation';
import type { RendererSelection } from './view';

interface PlacementEditorDependencies {
  readonly initialPositions: ReadonlyMap<string, LayoutPoint> | null;
  readonly navigation: Pick<Navigation, 'getState' | 'continueInRenderer' | 'activateRoute'>;
  readonly session: SpaceSession;
  readonly mintRouteId?: () => RouteId;
}

interface CurrentEditState {
  readonly snapshot: SpaceSnapshot;
  readonly positions: ReadonlyMap<string, LayoutPoint>;
  readonly renderer: RendererSelection;
  readonly newLayoutId: UUID | null;
  readonly activeRouteId: RouteId | null;
  readonly newRouteId?: RouteId | null;
  readonly connection: CompletedConnectionEdit | null;
}

interface DerivedEdit {
  readonly snapshot: SpaceSnapshot;
  readonly layoutId: UUID;
  readonly space: Space;
  readonly activeRouteId: RouteId | null;
}

/**
 * The neutral title a minted Layout, Route or Card takes: `<Prefix> N`, one past
 * the highest N already worn by its kind. Titles that do not follow the form are
 * not counted, so an authored title never pushes the numbering along.
 */
function nextSequentialTitle(prefix: string, titles: Iterable<string>): string {
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

function nextLayoutTitle(snapshot: SpaceSnapshot): string {
  return nextSequentialTitle(
    'Layout',
    (snapshot.document.layouts ?? []).map((layout) => layout.title),
  );
}

function nextRouteTitle(snapshot: SpaceSnapshot): string {
  return nextSequentialTitle(
    'Route',
    snapshot.document.routes.map((route) => route.title),
  );
}

export function nextCardTitle(snapshot: SpaceSnapshot): string {
  return nextSequentialTitle(
    'Card',
    snapshot.cards.map((card) => card.document.title),
  );
}

/**
 * A connection with no active Route is only ever a Space's first, which mints
 * Route 1 to hold it. With Routes already authored, the app cannot choose one on
 * the author's behalf. Both the live acceptance check and the derivation ask
 * this, so a connection the graph accepted cannot fail the derivation.
 */
function connectsWithoutActiveRoute(snapshot: SpaceSnapshot): boolean {
  return snapshot.document.routes.length === 0;
}

function targetForEdit(
  snapshot: SpaceSnapshot,
  renderer: RendererSelection,
  newLayoutId: UUID | null,
): { readonly layoutId: UUID; readonly title: string } {
  if (renderer.kind === 'view') {
    if (newLayoutId === null) throw new Error('Converting a View requires a new Layout id.');
    return {
      layoutId: newLayoutId,
      title: nextLayoutTitle(snapshot),
    };
  }
  const layout = (snapshot.document.layouts ?? []).find(
    (candidate) => candidate.id === renderer.layoutId,
  );
  if (layout === undefined) {
    throw new Error(`The selected Layout ${renderer.layoutId} does not exist.`);
  }
  return { layoutId: layout.id, title: layout.title };
}

/** Locate a Route by id and report whether it already holds this exact Edge. */
function inspectRouteEdge(
  snapshot: SpaceSnapshot,
  routeId: RouteId,
  from: CardId,
  to: CardId,
): {
  readonly routeIndex: number;
  readonly route: SpaceSnapshot['document']['routes'][number];
  readonly exists: boolean;
} {
  const routeIndex = snapshot.document.routes.findIndex((route) => route.id === routeId);
  if (routeIndex === -1) throw new Error(`The active Route ${routeId} does not exist.`);
  const route = snapshot.document.routes[routeIndex];
  if (route === undefined) throw new Error('The active Route index became invalid.');
  return {
    routeIndex,
    route,
    exists: route.edges.some((edge) => edge.from === from && edge.to === to),
  };
}

function appendRouteEdge(
  base: SpaceSnapshot,
  routeId: RouteId,
  from: CardId,
  to: CardId,
): SpaceSnapshot | null {
  const inspected = inspectRouteEdge(base, routeId, from, to);
  if (inspected.exists) return null;
  const routes = [...base.document.routes];
  routes[inspected.routeIndex] = {
    ...inspected.route,
    edges: [...inspected.route.edges, { from, to }],
  };
  return { ...base, document: { ...base.document, routes } };
}

/**
 * Step one — the Card a connection dropped on empty canvas creates, which every
 * later step then sees as an ordinary Card the Space holds.
 */
function createConnectionCard(
  base: SpaceSnapshot,
  connection: CompletedConnectionEdit | null,
): SpaceSnapshot {
  if (connection?.createdCardId === undefined) return base;
  if (connection.createdCardId !== connection.to) {
    throw new Error('A created Card must be the completed connection target.');
  }
  return {
    ...base,
    cards: [
      ...base.cards,
      {
        id: connection.createdCardId,
        document: {
          title: nextCardTitle(base),
          kind: 'markdown',
          body: '',
        },
      },
    ],
  };
}

/**
 * Which Route this Edit's connection belongs to, and whether that Route had to
 * be minted to hold it.
 *
 * A minted Route is created already holding the connection's Edge, so
 * `mintedRouteId` is the one answer to both later questions — which Route the
 * placement step adds to a Layout's explicit filter, and whether the append step
 * still has an Edge to write. Threading it replaces a flag those two steps read
 * at a distance from each other.
 */
interface ConnectionRoute {
  readonly snapshot: SpaceSnapshot;
  readonly activeRouteId: RouteId | null;
  readonly mintedRouteId: RouteId | null;
}

/**
 * Step two — the Route a Space's first connection mints to hold its Edge. Every
 * other connection is authored into the Route already active, and a Space with
 * Routes and none active cannot be connected in at all.
 */
function mintConnectionRoute(
  base: SpaceSnapshot,
  connection: CompletedConnectionEdit | null,
  activeRouteId: RouteId | null,
  newRouteId: RouteId | null | undefined,
): ConnectionRoute {
  if (connection === null || activeRouteId !== null) {
    return { snapshot: base, activeRouteId, mintedRouteId: null };
  }
  if (!connectsWithoutActiveRoute(base)) {
    throw new Error('A Space with Routes must have an active Route before connecting Cards.');
  }
  if (newRouteId === null || newRouteId === undefined) {
    throw new Error('The first connection requires a new Route id.');
  }
  // Only the Route is minted here. Making it visible in an explicit filter is
  // `updatePositionedLayout`'s, which already owns a Layout's `routes` and is
  // handed this same id as `mintedRouteId` — writing the filter here as well
  // would be a second derivation of one answer, agreeing only until the rule
  // changed.
  //
  // Appending rather than replacing: the guard above rejects a Space that
  // already has Routes, so today this appends to nothing. That guard states a
  // policy, though, and a policy is not what should be keeping a data operation
  // from discarding authored structure.
  return {
    snapshot: {
      ...base,
      document: {
        ...base.document,
        routes: [
          ...base.document.routes,
          {
            id: newRouteId,
            title: nextRouteTitle(base),
            edges: [{ from: connection.from, to: connection.to }],
          },
        ],
      },
    },
    activeRouteId: newRouteId,
    mintedRouteId: newRouteId,
  };
}

/**
 * Step four — write the connection's Edge into the Route that holds it, or
 * report that there is nothing to write.
 *
 * A minted Route already carries the Edge, and a placement-only Edit never had
 * one. `null` is the third answer: the Route already holds this exact Edge, so
 * drawing it again is an idempotent no-op rather than an Edit (ADR 0032).
 */
function appendConnectionEdge(
  base: SpaceSnapshot,
  connection: CompletedConnectionEdit | null,
  route: ConnectionRoute,
): SpaceSnapshot | null {
  if (connection === null || route.activeRouteId === null || route.mintedRouteId !== null) {
    return base;
  }
  return appendRouteEdge(base, route.activeRouteId, connection.from, connection.to);
}

/**
 * Private functional core: derive and validate the whole next Space before effects.
 *
 * Four steps fold the current editing state into one snapshot — create Card,
 * mint Route, place, append Edge — each taking the last one's snapshot. The
 * minting step's `mintedRouteId` is what the placement and append steps read;
 * neither asks a second time what the first already decided.
 */
function deriveCompletedEdit(current: CurrentEditState): DerivedEdit | null {
  const created = createConnectionCard(current.snapshot, current.connection);
  const route = mintConnectionRoute(
    created,
    current.connection,
    current.activeRouteId,
    current.newRouteId,
  );
  // Step three — place every Card the editor holds into the target Layout.
  const target = targetForEdit(route.snapshot, current.renderer, current.newLayoutId);
  const placed = updatePositionedLayout(route.snapshot, {
    layoutId: target.layoutId,
    title: target.title,
    positions: current.positions,
    activeRouteId: route.activeRouteId,
    mintedRouteId: route.mintedRouteId,
  });
  const snapshot = appendConnectionEdge(placed, current.connection, route);
  if (snapshot === null) return null;
  const loaded = loadSpaceSnapshot(snapshot);
  if (!loaded.ok) {
    throw new Error(
      `EditCompleted was emitted for invalid editing state: ${loaded.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
  return {
    snapshot,
    layoutId: target.layoutId,
    space: loaded.space,
    activeRouteId: route.activeRouteId,
  };
}

type ActiveConnectionRoute =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'new-route' }
  | {
      readonly kind: 'active-route';
      readonly route: SpaceSnapshot['document']['routes'][number];
    };

/**
 * Whether the graph may accept this Edge as things currently stand.
 *
 * One policy answers both kinds of target. React Flow asks during the drag to
 * state an existing target's validity or decide whether an empty drop may create
 * a Card; the editor asks again on release before emitting a completed Edit.
 * Sharing the policy keeps the preview, drop and completed Edit in agreement.
 */
export function createConnectionEligibility(
  currentActiveRoute: () => RouteId | null,
  session: SpaceSession,
): EditorConnectionEligibility {
  const activeRoute = (): ActiveConnectionRoute => {
    const snapshot = session.getState().working;
    const routeId = currentActiveRoute();
    if (routeId === null) {
      return connectsWithoutActiveRoute(snapshot) ? { kind: 'new-route' } : { kind: 'unavailable' };
    }
    const route = snapshot.document.routes.find((candidate) => candidate.id === routeId);
    return route === undefined ? { kind: 'unavailable' } : { kind: 'active-route', route };
  };
  return {
    acceptsExistingTarget: (from, to) => {
      const route = activeRoute();
      if (route.kind === 'unavailable') return false;
      if (route.kind === 'new-route') return true;
      return !route.route.edges.some((edge) => edge.from === from && edge.to === to);
    },
    acceptsNewTarget: () => activeRoute().kind !== 'unavailable',
  };
}

/**
 * One effect a completed Edit installs on a collaborator. Effects are
 * independent: an earlier one throwing must not cost a later one its turn.
 */
type CompletionEffect = () => void;

/**
 * The Edit-completion reentrancy protocol, as one notification handler.
 *
 * `pass` derives one completed Edit and answers the ordered effects it installs,
 * or `null` when the notification turned out to be nothing to install. It is the
 * whole of the derivation: a `pass` that throws propagates immediately, before
 * any effect of that pass has run.
 *
 * A notification arriving while a pass is already running is **queued**, not
 * re-entered — installing an effect can complete a second Edit synchronously,
 * because a session listener may — and the loop already running drains it.
 *
 * Effects run through their whole list even when one throws, so a failing
 * collaborator cannot cost the ones after it their turn. Only the first failure
 * is kept, and it propagates once the queue has drained, so a queued Edit is
 * installed before the caller learns anything failed.
 */
function serializeCompletion(pass: () => readonly CompletionEffect[] | null): () => void {
  let running = false;
  let queued = false;
  const takeQueued = (): boolean => {
    const wasQueued = queued;
    queued = false;
    return wasQueued;
  };
  return () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    let firstEffectError: { readonly error: unknown } | null = null;
    try {
      do {
        for (const effect of pass() ?? []) {
          try {
            effect();
          } catch (error) {
            firstEffectError ??= { error };
          }
        }
      } while (takeQueued());
      if (firstEffectError !== null) throw firstEffectError.error;
    } finally {
      running = false;
      // A `pass` that threw produced no completed state for anything queued
      // during it to follow, so those notifications are stale. Leaving the flag
      // set would spend the next notification's drain on a pass nobody asked for.
      queued = false;
    }
  };
}

export function createPlacementEditor({
  initialPositions,
  navigation,
  session,
  mintRouteId,
}: PlacementEditorDependencies): EditorStore {
  // Each completed Edit installs a fresh positions map before notifying. Record
  // that identity before effects so a synchronous listener cannot resubmit it.
  let submittedPositions: ReadonlyMap<string, LayoutPoint> | null = null;
  const currentActiveRoute = () => navigation.getState().activeRouteId;
  const connectionEligibility = createConnectionEligibility(currentActiveRoute, session);
  const editor = createEditorStore(
    initialPositions,
    serializeCompletion(() => {
      const positions = editor.getState().positions;
      if (positions === null) {
        throw new Error('EditCompleted was emitted without authored placement.');
      }
      if (positions === submittedPositions) return null;
      const renderer = navigation.getState().selectedRenderer;
      const connection = editor.getState().completedConnection;
      const activeRouteId = currentActiveRoute();
      const next = deriveCompletedEdit({
        snapshot: session.getState().working,
        positions,
        renderer,
        newLayoutId: renderer.kind === 'view' ? newUuid() : null,
        activeRouteId,
        newRouteId:
          connection !== null && activeRouteId === null ? (mintRouteId?.() ?? newUuid()) : null,
        connection,
      });
      editor.setState({ completedConnection: null });
      if (next === null) return null;
      submittedPositions = positions;
      // A Route is activated only when this Edit minted the Space's first;
      // activating one is not itself an Edit (ADR 0028).
      const activatedRouteId = activeRouteId === null ? next.activeRouteId : null;
      return [
        () => session.submit(next.snapshot),
        ...(activatedRouteId === null ? [] : [() => navigation.activateRoute(activatedRouteId)]),
        () => navigation.continueInRenderer({ kind: 'layout', layoutId: next.layoutId }),
      ];
    }),
    connectionEligibility,
  );
  return editor;
}
