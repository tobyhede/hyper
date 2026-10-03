import type { GraphId, MapId, ResourceId } from '@project/core';
import { Placement, type LayoutStrategyGraph } from '@project/graph';
import type { ComposedApp, EdgeCollaborators } from './compose-app';
import type { CanvasNodesAndEdges } from './canvas-projection';
import { mapView, type MapView } from './map-view';
import { createObservableState } from '@project/persistence';
import { createRenderAdapter, type RenderAdapter } from './render-adapter';
import { createEdgeAuthoring, type EdgeAuthoring } from './edge-authoring';
import { createConnectionCompletion, type ConnectionCompletion } from './connection-completion';
import type { SpaceAuthoring, SpaceAuthoringState } from './space-authoring';

import { surfaceOffers, surfaceAvailability, type MapSurfacePolicy } from './map-surface-policy';
import type { AuthoringAvailability } from './authoring-availability';
import { createContinuation, type Continuation } from './continuation';

export interface MapSurfaceContext {
  readonly mapId: MapId;
  readonly graphId: GraphId | null;
  readonly policy: MapSurfacePolicy;
  readonly depth?: number;
  readonly occurrence?: string;
  readonly presentingResourceId?: ResourceId | null;
}

export interface MapSurface {
  readonly offers: () => ReturnType<typeof surfaceOffers>;
  readonly availability: (available: AuthoringAvailability) => AuthoringAvailability;
  readonly continuation: Continuation;
  readonly authoring: SpaceAuthoring;
  readonly adapter: RenderAdapter;
  readonly edgeAuthoring: EdgeAuthoring;
  readonly context: () => MapSurfaceContext;
  readonly update: (context: MapSurfaceContext) => void;
  readonly observe: () => () => void;
  readonly view: () => MapView;
  readonly project: (
    placed: LayoutStrategyGraph,
    interaction?: {
      readonly activeResourceId?: ResourceId | null;
      readonly selectedResourceId?: ResourceId | null;
      readonly presenting?: boolean;
    },
  ) => CanvasNodesAndEdges;
  readonly dispose: () => void;
}

/** One drawing of an explicit Map, over the Space's one composition. */
type SurfaceComposition = Pick<
  ComposedApp,
  'authoring' | 'currentSpace' | 'deleteConfirmation' | 'reportObserverError'
>;

export function createMapSurface(
  app: SurfaceComposition,
  supplied: MapSurfaceContext | (() => MapSurfaceContext),
  connections?: (collaborators: EdgeCollaborators) => ConnectionCompletion,
): MapSurface {
  let heldContext = typeof supplied === 'function' ? supplied() : supplied;
  let readContext = typeof supplied === 'function' ? supplied : () => heldContext;
  const context = () => readContext();
  let lastSpace: ReturnType<ComposedApp['currentSpace']> | undefined;
  let lastMap: MapId | undefined;
  let lastPolicy: MapSurfacePolicy | undefined;
  let lastView: MapView;
  const view = () => {
    const space = app.currentSpace();
    const mapId = context().mapId;
    const policy = context().policy;
    if (space !== lastSpace || mapId !== lastMap || policy !== lastPolicy) {
      const derived = mapView(space, mapId);
      lastView = {
        ...derived,
        projection: {
          ...derived.projection,
          project: (placed, interaction) => {
            const projected = derived.projection.project(placed, {
              ...interaction,
              activeGraphId: context().graphId,
            });
            const permitted = surfaceOffers(context().policy, context().depth ?? 0);
            return {
              ...projected,
              nodes: projected.nodes.map((node) => ({
                ...node,
                ...(permitted.authoring
                  ? {}
                  : { draggable: false, selectable: false, connectable: false, focusable: false }),
                data: { ...node.data, readOnly: permitted.readOnly },
              })),
            };
          },
        },
      };
      lastPolicy = policy;
      lastSpace = space;
      lastMap = mapId;
    }
    return lastView;
  };
  const state = (): SpaceAuthoringState => {
    const { mapId, graphId, presentingResourceId } = context();
    return {
      ...app.authoring.getState(),
      navigation:
        presentingResourceId == null
          ? { mode: 'overview', selectedMapId: mapId, activeGraphId: graphId }
          : {
              mode: 'presenting',
              selectedMapId: mapId,
              activeGraphId: graphId,
              traversalHistory: [presentingResourceId],
              branchIndex: 0,
            },
    };
  };
  const observable = createObservableState(state(), app.reportObserverError);
  let unsubscribe: (() => void) | null = null;
  const stopObserving = () => {
    unsubscribe?.();
    unsubscribe = null;
    ownedContinuation.take();
  };
  const observe = () => {
    if (unsubscribe === null) {
      unsubscribe = app.authoring.subscribe(() => observable.publish(state()));
      observable.publish(state());
    }
    return stopObserving;
  };
  const authoring: SpaceAuthoring = {
    ...app.authoring,
    getState: observable.getState,
    subscribe: observable.subscribe,
    complete: (completion) => app.authoring.completeInContext(context(), completion),
    edgeEligibility: (proposal) => app.authoring.edgeEligibilityInContext(context(), proposal),
    mapPlacement: () => {
      const resolved = app.currentSpace().lookup.map(context().mapId);
      return resolved === undefined ? Placement.empty() : Placement.fromMap(resolved.map);
    },
    dispose: stopObserving,
  };
  let disposed = false;
  const ownedContinuation = createContinuation({
    authoring,
    reportObserverError: app.reportObserverError,
  });
  const continuation: Continuation = {
    ...ownedContinuation,
    request: (request) => {
      if (!disposed && unsubscribe !== null) ownedContinuation.request(request);
    },
  };
  const adapter = createRenderAdapter(authoring);
  const edgeAuthoring = createEdgeAuthoring({
    authoring,
    adapter,
    connections:
      connections?.({ adapter, authoring }) ??
      createConnectionCompletion({ adapter, authoring, reportInvariant: app.reportObserverError }),
    continuation,
    deleteConfirmation: app.deleteConfirmation,
    reportObserverError: app.reportObserverError,
  });
  let lastAvailability:
    | {
        input: AuthoringAvailability;
        policy: MapSurfacePolicy;
        depth: number;
        result: AuthoringAvailability;
      }
    | undefined;
  return {
    offers: () => surfaceOffers(context().policy, context().depth ?? 0),
    availability: (available) => {
      const { policy, depth = 0 } = context();
      if (
        lastAvailability?.input === available &&
        lastAvailability.policy === policy &&
        lastAvailability.depth === depth
      )
        return lastAvailability.result;
      const result = surfaceAvailability(available, policy, depth);
      lastAvailability = { input: available, policy, depth, result };
      return result;
    },
    authoring,
    adapter,
    edgeAuthoring,
    continuation,
    context,
    update: (next) => {
      const before = context();
      heldContext = next;
      readContext = () => heldContext;
      if (before.mapId !== next.mapId) adapter.getState().selectMap();
      observable.publish(state());
    },
    observe,
    view,
    project: (placed, interaction = {}) =>
      view().projection.project(placed, {
        activeGraphId: context().graphId,
        activeResourceId: interaction.activeResourceId ?? null,
        selectedResourceId: interaction.selectedResourceId ?? null,
        presenting: interaction.presenting ?? false,
      }),
    dispose: () => {
      disposed = true;
      continuation.take();
      continuation.dispose();
      edgeAuthoring.dispose();
      stopObserving();
      observable.clearSubscribers();
    },
  };
}

/** Contextual collaborators for commands; the Space-owned lifetimes stay shared. */
export function mapSurfaceComposition(app: ComposedApp, surface: MapSurface): ComposedApp {
  return {
    ...app,
    surface,
    continuation: surface.continuation,
    authoring: surface.authoring,
    adapter: surface.adapter,
    edgeAuthoring: surface.edgeAuthoring,
  };
}

/** One canvas has one selected occurrence and one outstanding continuation. */
export function observeMapSurfaces(drawn: readonly MapSurface[]): () => void {
  const unsubscribes = drawn.flatMap((current) => [
    current.adapter.subscribe((next, previous) => {
      if (next.selection === previous.selection || next.selection.kind === 'none') return;
      for (const other of drawn) {
        if (other !== current) other.adapter.getState().clearSelection();
      }
    }),
    current.continuation.subscribe(() => {
      if (current.continuation.getState().pending === null) return;
      for (const other of drawn) {
        if (other !== current) other.continuation.take();
      }
    }),
  ]);
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe();
  };
}
