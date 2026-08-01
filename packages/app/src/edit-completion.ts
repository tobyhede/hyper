import { newUuid, type CardId, type RouteId, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type LayoutPoint, type Space } from '@project/graph';
import type { SpaceSession } from '@project/persistence';
import { createEditorStore, type EditorConnectionEligibility, type EditorStore } from './editor';
import { updatePositionedLayout } from './snapshot';
import type { RendererSelection, ViewChoice } from './view';

interface PlacementEditorDependencies {
  readonly initialPositions: ReadonlyMap<string, LayoutPoint> | null;
  readonly viewChoice: ViewChoice;
  readonly currentActiveRoute: () => RouteId | null;
  readonly session: SpaceSession;
  readonly installSpace: (space: Space) => void;
  readonly activateRoute?: (routeId: RouteId) => void;
  readonly mintRouteId?: () => RouteId;
}

interface CurrentEditState {
  readonly snapshot: SpaceSnapshot;
  readonly positions: ReadonlyMap<string, LayoutPoint>;
  readonly renderer: RendererSelection;
  readonly newLayoutId: UUID | null;
  readonly activeRouteId: RouteId | null;
  readonly newRouteId?: RouteId | null;
  readonly connection: {
    readonly from: CardId;
    readonly to: CardId;
    readonly createdCardId?: CardId;
  } | null;
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

/** Private functional core: derive and validate the whole next Space before effects. */
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

function deriveCompletedEdit(current: CurrentEditState): DerivedEdit | null {
  let base = current.snapshot;
  if (current.connection?.createdCardId !== undefined) {
    if (current.connection.createdCardId !== current.connection.to) {
      throw new Error('A created Card must be the completed connection target.');
    }
    base = {
      ...base,
      cards: [
        ...base.cards,
        {
          id: current.connection.createdCardId,
          document: {
            title: nextCardTitle(base),
            kind: 'markdown',
            body: '',
          },
        },
      ],
    };
  }
  let activeRouteId = current.activeRouteId;
  let connectionAlreadyAdded = false;
  if (current.connection !== null && activeRouteId === null) {
    if (!connectsWithoutActiveRoute(base)) {
      throw new Error('A Space with Routes must have an active Route before connecting Cards.');
    }
    if (current.newRouteId === null || current.newRouteId === undefined) {
      throw new Error('The first connection requires a new Route id.');
    }
    const mintedRouteId = current.newRouteId;
    const selectedLayoutId = current.renderer.kind === 'layout' ? current.renderer.layoutId : null;
    activeRouteId = mintedRouteId;
    connectionAlreadyAdded = true;
    base = {
      ...base,
      document: {
        ...base.document,
        routes: [
          {
            id: activeRouteId,
            title: nextRouteTitle(base),
            edges: [{ from: current.connection.from, to: current.connection.to }],
          },
        ],
        ...(selectedLayoutId !== null && base.document.layouts !== undefined
          ? {
              layouts: base.document.layouts.map((layout) =>
                layout.id === selectedLayoutId && layout.routes !== undefined
                  ? { ...layout, routes: [...layout.routes, mintedRouteId] }
                  : layout,
              ),
            }
          : {}),
      },
    };
  }
  const target = targetForEdit(base, current.renderer, current.newLayoutId);
  const placed = updatePositionedLayout(
    base,
    target.layoutId,
    target.title,
    current.positions,
    activeRouteId,
  );
  const snapshot =
    current.connection === null || activeRouteId === null || connectionAlreadyAdded
      ? placed
      : appendRouteEdge(placed, activeRouteId, current.connection.from, current.connection.to);
  if (snapshot === null) return null;
  const loaded = loadSpaceSnapshot(snapshot);
  if (!loaded.ok) {
    throw new Error(
      `EditCompleted was emitted for invalid editing state: ${loaded.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
  return { snapshot, layoutId: target.layoutId, space: loaded.space, activeRouteId };
}

/**
 * Whether the graph may accept this Edge as things currently stand.
 *
 * One policy answers both kinds of target. React Flow asks during the drag to
 * state an existing target's validity or decide whether an empty drop may create
 * a Card; the editor asks again on release before emitting a completed Edit.
 * Sharing the policy keeps the preview, drop and completed Edit in agreement.
 */
type ActiveConnectionRoute =
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'new-route' }
  | {
      readonly kind: 'active-route';
      readonly route: SpaceSnapshot['document']['routes'][number];
    };

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

export function createPlacementEditor({
  initialPositions,
  viewChoice,
  currentActiveRoute,
  session,
  installSpace,
  activateRoute,
  mintRouteId,
}: PlacementEditorDependencies): EditorStore {
  // Each completed Edit installs a fresh positions map before notifying. Record
  // that identity before effects so a synchronous listener cannot resubmit it.
  let submittedPositions: ReadonlyMap<string, LayoutPoint> | null = null;
  let completing = false;
  let completionQueued = false;
  const takeQueuedCompletion = (): boolean => {
    const queued = completionQueued;
    completionQueued = false;
    return queued;
  };
  const connectionEligibility = createConnectionEligibility(currentActiveRoute, session);
  const editor = createEditorStore(
    initialPositions,
    () => {
      if (completing) {
        completionQueued = true;
        return;
      }
      completing = true;
      let firstEffectError: { readonly error: unknown } | null = null;
      try {
        do {
          const positions = editor.getState().positions;
          if (positions === null) {
            throw new Error('EditCompleted was emitted without authored placement.');
          }
          if (positions === submittedPositions) continue;
          const renderer = viewChoice.current();
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
          if (next === null) continue;
          submittedPositions = positions;
          try {
            session.submit(next.snapshot);
          } catch (error) {
            firstEffectError ??= { error };
          }
          try {
            installSpace(next.space);
          } catch (error) {
            firstEffectError ??= { error };
          }
          if (activeRouteId === null && next.activeRouteId !== null) {
            try {
              activateRoute?.(next.activeRouteId);
            } catch (error) {
              firstEffectError ??= { error };
            }
          }
          try {
            viewChoice.select({ kind: 'layout', layoutId: next.layoutId });
          } catch (error) {
            firstEffectError ??= { error };
          }
        } while (takeQueuedCompletion());
        if (firstEffectError !== null) throw firstEffectError.error;
      } finally {
        completing = false;
      }
    },
    connectionEligibility,
  );
  return editor;
}
