import { expectTypeOf, it } from 'vitest';
import type { SpaceCanvasProps } from '../src/components/SpaceCanvas';
import type { MapSurface } from '../src/map-surface';
import type { ResourcePlacementCommands } from '../src/resource-placement';
import type { MapSurfaceReading } from '../src/use-map-surface';

/**
 * These assertions are a runtime no-op: `expectTypeOf` compiles to nothing and
 * `pnpm test` will pass this file whatever the props type says. The root
 * `pnpm typecheck` is what enforces it.
 */

/**
 * A canvas mounted without a Map surface would have no policy of its own to
 * draw under (ADR 0112), so there is no way to mount one.
 */
it('requires the Map surface it draws', () => {
  expectTypeOf<SpaceCanvasProps['surface']>().toEqualTypeOf<MapSurface>();
});

/**
 * The canvas reads its surface the way a drawn Map does: through the one
 * reading `useMapSurface` answers, so the projection, selection, view and
 * availability it draws are the ones that reading holds.
 */
it('takes the reading its surface answers', () => {
  expectTypeOf<SpaceCanvasProps['reading']>().toEqualTypeOf<MapSurfaceReading>();
});

/** Every way a Resource arrives on the canvas has one owner, passed whole. */
it('takes Resource placement as one value', () => {
  expectTypeOf<ResourcePlacementCommands>().toExtend<SpaceCanvasProps['placement']>();
});

/**
 * Nothing the surface or its reading already answers is a prop, so the canvas
 * cannot draw one Map while its surface names another.
 */
it('takes nothing its surface or reading answers', () => {
  type Answered =
    | 'nodes'
    | 'edges'
    | 'projectedNodes'
    | 'presenting'
    | 'placementReady'
    | 'availability'
    | 'onNodesChange'
    | 'onEdgesChange'
    | 'edgeAuthoring'
    | 'selection'
    | 'onSelectResource'
    | 'onSelectEdge'
    | 'placedResources'
    | 'newResourceTitle'
    | 'onAddResource'
    | 'onAddExistingResource'
    | 'onPlaceSpace'
    | 'onDropImages'
    | 'onPasteImageUrl'
    | 'authoring'
    | 'onBodyEditingChange'
    | 'onTitleEditingChange'
    | 'resourceResize'
    | 'reportEmbeddedMapEditing'
    | 'mapId'
    | 'mapTitle'
    | 'graphs'
    | 'colorByGraphId'
    | 'activeGraphId';
  expectTypeOf<Extract<keyof SpaceCanvasProps, Answered>>().toBeNever();
});
