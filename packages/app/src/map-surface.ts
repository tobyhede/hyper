import type { GraphId, MapId, ResourceId } from '@project/core';
import { Placement, type LayoutStrategyGraph } from '@project/graph';
import { createObservableState } from '@project/persistence';
import type { ComposedApp, EdgeCollaborators } from './compose-app';
import type { CanvasNodesAndEdges } from './canvas-projection';
import { mapView, type MapView } from './map-view';
import { createRenderAdapter, type RenderAdapter } from './render-adapter';
import { createEdgeAuthoring, type EdgeAuthoring } from './edge-authoring';
import { createConnectionCompletion, type ConnectionCompletion } from './connection-completion';
import {
  CANVAS,
  type EditTarget,
  type SpaceAuthoringState,
  type SurfaceAuthoring,
} from './space-authoring';
import {
  surfaceAvailability,
  surfaceOffers,
  type MapSurfacePolicy,
  type SurfaceOffers,
} from './map-surface-policy';
import type { AuthoringAvailability } from './authoring-availability';
import { createContinuation, type Continuation } from './continuation';

/**
 * Which drawing an occurrence names: the path of drawing Resources from the
 * canvas's own Map to it (ADR 0112). The canvas's own Map is the empty path.
 */
export type Occurrence = string;

export const CANVAS_OCCURRENCE: Occurrence = '';

interface SurfaceContextBase {
  readonly mapId: MapId;
  readonly graphId: GraphId | null;
  readonly policy: MapSurfacePolicy;
}

/** The canvas's own Map: Navigation's selection, presented from here alone. */
export interface CanvasSurfaceContext extends SurfaceContextBase {
  readonly kind: 'canvas';
  readonly presentingResourceId: ResourceId | null;
}

/** A Map drawn inside the canvas, at an explicit Map and Graph. */
export interface DrawnSurfaceContext extends SurfaceContextBase {
  readonly kind: 'drawn';
  readonly occurrence: Occurrence;
}

export type MapSurfaceContext = CanvasSurfaceContext | DrawnSurfaceContext;

export interface MapSurface {
  readonly offers: () => SurfaceOffers;
  readonly availability: (available: AuthoringAvailability) => AuthoringAvailability;
  readonly continuation: Continuation;
  readonly authoring: SurfaceAuthoring;
  readonly adapter: RenderAdapter;
  readonly edgeAuthoring: EdgeAuthoring;
  readonly context: () => MapSurfaceContext;
  /** Where this drawing's Edits land. */
  readonly target: () => EditTarget;
  readonly occurrence: () => Occurrence;
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

const targetOf = (context: MapSurfaceContext): EditTarget =>
  context.kind === 'canvas'
    ? CANVAS
    : { kind: 'drawn', mapId: context.mapId, graphId: context.graphId };

/**
 * One drawing of a Map. `follow` is read whenever the surface needs its
 * context, so the canvas's surface follows Navigation; `update` replaces it
 * with a fixed one, which is how a drawn Map follows its Space Resource.
 */
export function createMapSurface(
  app: SurfaceComposition,
  follow: () => MapSurfaceContext,
  connections?: (collaborators: EdgeCollaborators) => ConnectionCompletion,
): MapSurface {
  let readContext = follow;
  const context = () => readContext();
  const target = () => targetOf(context());
  let lastSpace: ReturnType<ComposedApp['currentSpace']> | undefined;
  let lastMap: MapId | undefined;
  let lastView: MapView;
  const view = () => {
    const space = app.currentSpace();
    const { mapId } = context();
    if (space !== lastSpace || mapId !== lastMap) {
      lastView = mapView(space, mapId);
      lastSpace = space;
      lastMap = mapId;
    }
    return lastView;
  };
  const state = (): SpaceAuthoringState => {
    const current = context();
    const presentingResourceId = current.kind === 'canvas' ? current.presentingResourceId : null;
    return {
      ...app.authoring.getState(),
      navigation:
        presentingResourceId === null
          ? { mode: 'overview', selectedMapId: current.mapId, activeGraphId: current.graphId }
          : {
              mode: 'presenting',
              selectedMapId: current.mapId,
              activeGraphId: current.graphId,
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
  const authoring: SurfaceAuthoring = {
    getState: observable.getState,
    subscribe: observable.subscribe,
    complete: (completion) => {
      const lands = target();
      return lands.kind === 'canvas'
        ? app.authoring.complete(lands, completion)
        : app.authoring.complete(lands, completion);
    },
    edgeEligibility: (proposal) => app.authoring.edgeEligibility(target(), proposal),
    mapPlacement: () => {
      const resolved = app.currentSpace().lookup.map(context().mapId);
      return resolved === undefined ? Placement.empty() : Placement.fromMap(resolved.map);
    },
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
        readonly input: AuthoringAvailability;
        readonly context: MapSurfaceContext;
        readonly result: AuthoringAvailability;
      }
    | undefined;
  return {
    offers: () => surfaceOffers(context().policy, context().kind),
    availability: (available) => {
      const current = context();
      if (
        lastAvailability?.input === available &&
        lastAvailability.context.policy === current.policy &&
        lastAvailability.context.kind === current.kind
      )
        return lastAvailability.result;
      const result = surfaceAvailability(available, current.policy, current.kind);
      lastAvailability = { input: available, context: current, result };
      return result;
    },
    authoring,
    adapter,
    edgeAuthoring,
    continuation,
    context,
    target,
    occurrence: () => {
      const current = context();
      return current.kind === 'canvas' ? CANVAS_OCCURRENCE : current.occurrence;
    },
    update: (next) => {
      const before = context();
      readContext = () => next;
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

/**
 * The composition a drawn Map's commands run over: the Space's own, drawing
 * through this surface. Space-owned lifetimes — authoring, outcomes,
 * confirmation, image work — stay the Space's; the drawn collaborators are
 * the surface's.
 */
export function mapSurfaceComposition(app: ComposedApp, surface: MapSurface): ComposedApp {
  return {
    ...app,
    surface,
    continuation: surface.continuation,
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
