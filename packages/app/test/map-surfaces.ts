import type { Edge } from '@xyflow/react';
import type { ResourceFlowNode } from '@project/react-flow-adapter';
import type { AuthoringAvailability } from '../src/authoring-availability';
import type { CanvasRendering } from '../src/canvas-rendering';
import type { SpaceCanvasProps } from '../src/components/SpaceCanvas';
import type { MapSurface } from '../src/map-surface';
import type { ResourceResize } from '../src/render-adapter';
import type { MapSurfaceReading } from '../src/use-map-surface';
import type { MapSurfacePolicy } from '../src/map-surface-policy';

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

/** The render adapter's reading, and the editing reports, a canvas test sets itself. */
export interface CanvasReadingParts extends Partial<CanvasRendering> {
  readonly availability: AuthoringAvailability;
  /** What the adapter holds; the live projection's nodes. */
  readonly nodes?: ResourceFlowNode[];
  readonly edges?: Edge[];
  readonly setEditingResourceBody?: (editing: boolean) => void;
  readonly setEditingResourceTitle?: (editing: boolean) => void;
}

/**
 * A reading of `surface` as `useMapSurface` answers one, over the surface's
 * own view, with the render adapter's half and the availability set by the
 * test. Placement is ready unless the test says otherwise.
 */
export function canvasReading(
  surface: MapSurface,
  {
    availability,
    nodes = [],
    edges = [],
    setEditingResourceBody = ignore,
    setEditingResourceTitle = ignore,
    ...rendering
  }: CanvasReadingParts,
): MapSurfaceReading {
  return {
    view: surface.view(),
    canvasRendering: {
      selection: { kind: 'none' },
      liveProjection: { nodes, edges },
      hasResourcesOnCanvas: true,
      editingEmbeddedMap: false,
      projected: null,
      canvas: { kind: 'resources' },
      changeNodes: ignore,
      changeEdges: ignore,
      resourceResize: IDLE_RESIZE,
      reportEmbeddedMapEditing: ignore,
      selectResource: ignore,
      selectEdge: ignore,
      ...rendering,
    },
    availability,
    editingResourceBody: false,
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
