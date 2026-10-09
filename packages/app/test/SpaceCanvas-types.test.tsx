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
 * The canvas takes its surface, that surface's reading, placement, and the
 * Space-level collaborators no surface holds, and nothing else. Whatever the
 * surface or its reading answers — the Map, its Graphs, the projection,
 * selection and availability — is read from them, so the canvas cannot draw
 * one Map while its surface names another. Any prop added or removed fails here.
 */
it('takes exactly its surface, reading, placement and Space-level collaborators', () => {
  expectTypeOf<keyof SpaceCanvasProps>().toEqualTypeOf<
    | 'surface'
    | 'reading'
    | 'placement'
    | 'onDrawnClipboardFailuresChange'
    | 'onDrawnSpacesChange'
    | 'commandOutcomes'
    | 'deleteConfirmation'
    | 'imageReplacement'
    | 'nameOnCreation'
    | 'spaceSession'
    | 'spaceTitle'
    | 'spaceResourceTargets'
    | 'resourceEntityActions'
  >();
});
