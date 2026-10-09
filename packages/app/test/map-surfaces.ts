import type { AuthoringInProgress } from '../src/authoring-availability';
import { authoringAvailability } from '../src/authoring-availability';
import { canvasContent } from '../src/canvas-content';
import type { CanvasNodesAndEdges } from '../src/canvas-projection';
import type { CanvasRendering } from '../src/canvas-rendering';
import type { SpaceCanvasProps } from '../src/components/SpaceCanvas';
import type { MapSurface } from '../src/map-surface';
import type { Projection, ResourceResize } from '../src/render-adapter';
import { renderedFacts, type MapSurfaceReading } from '../src/use-map-surface';
import type { MapSurfacePolicy } from '../src/map-surface-policy';
import { nextResourceTitle } from '../src/titles';

/**
 * Hold a canvas surface at one policy, at the Map and Graph it draws now.
 *
 * `composeApp` composes the canvas's surface authoring; a test that needs the
 * canvas under another policy fixes its context through the surface's own
 * `update`, which stops it following Navigation from then on.
 */
export function holdCanvasPolicy(surface: MapSurface, policy: MapSurfacePolicy): void {
  const current = surface.context();
  if (current.kind !== 'canvas') throw new Error('holdCanvasPolicy takes the canvas surface');
  surface.update({ ...current, policy });
}

const ignore = (): void => undefined;

const IDLE_RESIZE: ResourceResize = {
  beginResize: ignore,
  previewResize: ignore,
  finishResize: ignore,
  cancelResize: ignore,
};

/**
 * The availability facts a canvas test sets. `editable` and
 * `editingEmbeddedMap` are absent because the reading answers them from its
 * own render-adapter half, as `useMapSurface` does.
 */
export type CanvasFacts = Partial<Omit<AuthoringInProgress, 'editable' | 'editingEmbeddedMap'>>;

/** The render adapter's reading, and the editing reports, a canvas test sets itself. */
export interface CanvasReadingParts extends Partial<
  Omit<CanvasRendering, 'liveProjection' | 'hasResourcesOnCanvas' | 'projected' | 'canvas'>
> {
  /**
   * What the render adapter holds, and so what React Flow draws: `null` when
   * it holds nothing. Resources are on the canvas exactly when it is not
   * `null`, as `useCanvasRendering` answers (`app-hooks.test.tsx`, "lays the
   * Map out and hands the projection to the render adapter"). Empty by default.
   */
  readonly projection?: Projection | null;
  /**
   * What the drawn Map's placement projects to: `null` while a placement
   * resolves. The held projection by default, as once a placement has
   * resolved and the adapter has taken it; set it to `null` beside a held
   * projection for a replacement placement that is still resolving.
   */
  readonly projected?: CanvasNodesAndEdges | null;
  readonly facts?: CanvasFacts;
  readonly setEditingResourceBody?: (editing: boolean) => void;
  readonly setEditingResourceTitle?: (editing: boolean) => void;
}

/**
 * A reading of `surface` as `useMapSurface` answers one, over the surface's
 * own view. The test sets what the render adapter holds, what the placement
 * projects to and the in-progress facts. Whether Resources are on the canvas
 * and the canvas content follow from those two as `useCanvasRendering` derives
 * them; availability is answered from the facts and narrowed by the surface's
 * own policy.
 */
export function canvasReading(
  surface: MapSurface,
  {
    projection = { nodes: [], edges: [] },
    projected = projection,
    facts = {},
    setEditingResourceBody = ignore,
    setEditingResourceTitle = ignore,
    ...rendering
  }: CanvasReadingParts = {},
): MapSurfaceReading {
  const hasResourcesOnCanvas = projection !== null;
  const editingEmbeddedMap = rendering.editingEmbeddedMap ?? false;
  const view = surface.view();
  return {
    view,
    newResourceTitle: nextResourceTitle(surface.authoring.getState().session.working),
    canvasRendering: {
      selection: { kind: 'none' },
      changeNodes: ignore,
      changeEdges: ignore,
      resourceResize: IDLE_RESIZE,
      reportEmbeddedMapEditing: ignore,
      selectResource: ignore,
      selectEdge: ignore,
      ...rendering,
      editingEmbeddedMap,
      liveProjection: projection,
      hasResourcesOnCanvas,
      projected,
      canvas: canvasContent(
        projected === null
          ? { kind: 'pending' }
          : { kind: 'ready', strategyGraph: view.projection.strategyGraph },
        hasResourcesOnCanvas,
      ),
    },
    availability: surface.availability(
      authoringAvailability({
        replacingImage: false,
        presenting: false,
        editingResourceBody: false,
        editingResourceTitle: false,
        editingChromeTitle: false,
        spaceOnCanvas: true,
        creatingSpaceResource: false,
        ...facts,
        ...renderedFacts({ hasResourcesOnCanvas, editingEmbeddedMap }),
      }),
    ),
    editingResourceBody: facts.editingResourceBody ?? false,
    setEditingResourceBody,
    setEditingResourceTitle,
    setEditingChromeTitle: ignore,
  };
}

/** Resource placement that places nothing, for a canvas test that drops nothing. */
export const IDLE_PLACEMENT: SpaceCanvasProps['placement'] = {
  createResource: ignore,
  dropExistingResource: ignore,
  dropSpace: ignore,
  dropImages: ignore,
  pasteImageUrl: ignore,
};
