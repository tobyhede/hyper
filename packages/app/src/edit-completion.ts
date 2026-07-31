import { newUuid, type CardId, type RouteId, type SpaceSnapshot, type UUID } from '@project/core';
import { loadSpaceSnapshot, type LayoutPoint, type Space } from '@project/graph';
import type { SpaceSession } from '@project/persistence';
import { createEditorStore, type EditorStore } from './editor';
import { updatePositionedLayout } from './snapshot';
import type { RendererSelection, ViewChoice } from './view';

interface PlacementEditorDependencies {
  readonly initialPositions: ReadonlyMap<string, LayoutPoint> | null;
  readonly viewChoice: ViewChoice;
  readonly currentActiveRoute: () => RouteId | null;
  readonly session: SpaceSession;
  readonly installSpace: (space: Space) => void;
}

interface CurrentEditState {
  readonly snapshot: SpaceSnapshot;
  readonly positions: ReadonlyMap<string, LayoutPoint>;
  readonly renderer: RendererSelection;
  readonly newLayoutId: UUID | null;
  readonly activeRouteId: RouteId | null;
  readonly connection: { readonly from: CardId; readonly to: CardId } | null;
}

interface DerivedEdit {
  readonly snapshot: SpaceSnapshot;
  readonly layoutId: UUID;
  readonly space: Space;
}

function nextLayoutTitle(snapshot: SpaceSnapshot): string {
  let highest = 0n;
  for (const layout of snapshot.document.layouts ?? []) {
    const match = /^Layout ([1-9]\d*)$/.exec(layout.title);
    if (match?.[1] === undefined) continue;
    const number = BigInt(match[1]);
    if (number > highest) highest = number;
  }
  return `Layout ${highest + 1n}`;
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
  const target = targetForEdit(current.snapshot, current.renderer, current.newLayoutId);
  const placed = updatePositionedLayout(
    current.snapshot,
    target.layoutId,
    target.title,
    current.positions,
    current.activeRouteId,
  );
  const snapshot =
    current.connection === null || current.activeRouteId === null
      ? placed
      : appendRouteEdge(
          placed,
          current.activeRouteId,
          current.connection.from,
          current.connection.to,
        );
  if (snapshot === null) return null;
  const loaded = loadSpaceSnapshot(snapshot);
  if (!loaded.ok) {
    throw new Error(
      `EditCompleted was emitted for invalid editing state: ${loaded.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
  return { snapshot, layoutId: target.layoutId, space: loaded.space };
}

export function createPlacementEditor({
  initialPositions,
  viewChoice,
  currentActiveRoute,
  session,
  installSpace,
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
          const next = deriveCompletedEdit({
            snapshot: session.getState().working,
            positions,
            renderer,
            newLayoutId: renderer.kind === 'view' ? newUuid() : null,
            activeRouteId: currentActiveRoute(),
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
    (from, to) => {
      const routeId = currentActiveRoute();
      if (routeId === null) return false;
      return !inspectRouteEdge(session.getState().working, routeId, from, to).exists;
    },
  );
  return editor;
}

export interface PositionedConnection {
  readonly layoutId: UUID;
  readonly routeId: RouteId;
  readonly from: CardId;
  readonly to: CardId;
}

export interface ExistingCardConnection {
  readonly renderer: RendererSelection;
  readonly positions: ReadonlyMap<string, LayoutPoint>;
  readonly newLayoutId: UUID | null;
  readonly routeId: RouteId;
  readonly from: CardId;
  readonly to: CardId;
}

export interface CompletedConnection {
  readonly snapshot: SpaceSnapshot;
  readonly layoutId: UUID;
}

/**
 * Compose placement conversion and one existing-Card Edge as a single Space.
 * A duplicate is detected before conversion because it is not a completed Edit.
 */
export function completeExistingCardConnection(
  base: SpaceSnapshot,
  connection: ExistingCardConnection,
): CompletedConnection | null {
  const placed = deriveCompletedEdit({
    snapshot: base,
    positions: connection.positions,
    renderer: connection.renderer,
    newLayoutId: connection.newLayoutId,
    activeRouteId: connection.routeId,
    connection: { from: connection.from, to: connection.to },
  });
  if (placed === null) return null;
  return { snapshot: placed.snapshot, layoutId: placed.layoutId };
}

/**
 * Compose one completed existing-Card connection into the complete next Space.
 * The chosen React Flow handle sides deliberately do not cross this seam.
 */
export function completePositionedConnection(
  base: SpaceSnapshot,
  connection: PositionedConnection,
): SpaceSnapshot | null {
  const layoutIndex = (base.document.layouts ?? []).findIndex(
    (layout) => layout.id === connection.layoutId,
  );
  if (layoutIndex === -1) {
    throw new Error(`The selected Layout ${connection.layoutId} does not exist.`);
  }

  const connected = appendRouteEdge(base, connection.routeId, connection.from, connection.to);
  if (connected === null) return null;

  const layouts = [...(connected.document.layouts ?? [])];
  const layout = layouts[layoutIndex];
  if (layout === undefined) throw new Error('The selected Layout index became invalid.');
  layouts[layoutIndex] = { ...layout, activeRoute: connection.routeId };

  const snapshot: SpaceSnapshot = {
    ...connected,
    document: {
      ...connected.document,
      layouts,
      defaultView: connection.layoutId,
    },
  };
  const accepted = loadSpaceSnapshot(snapshot);
  if (!accepted.ok) {
    throw new Error(
      `Completed connection produced an invalid Space: ${accepted.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }
  return snapshot;
}
