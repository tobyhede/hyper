import { describe, expectTypeOf, it } from 'vitest';
import type { ResourceId, MapPosition, GraphId } from '@project/core';
import {
  Placement,
  positionedStrategy,
  type GraphRenderEdge,
  type LayoutStrategyResource,
  type LayoutStrategyEdge,
} from '@project/graph';

describe('graph identity types', () => {
  it('preserves validated identities through projection and map', () => {
    expectTypeOf<GraphRenderEdge['graphId']>().toEqualTypeOf<GraphId>();
    expectTypeOf<GraphRenderEdge['source']>().toEqualTypeOf<ResourceId>();
    expectTypeOf<GraphRenderEdge['target']>().toEqualTypeOf<ResourceId>();
    expectTypeOf<LayoutStrategyResource['id']>().toEqualTypeOf<ResourceId>();
    expectTypeOf<LayoutStrategyEdge['source']>().toEqualTypeOf<ResourceId>();
    expectTypeOf<LayoutStrategyEdge['target']>().toEqualTypeOf<ResourceId>();
    expectTypeOf(Placement.fromLayoutStrategyGraph).returns.toEqualTypeOf<Placement>();
    expectTypeOf(positionedStrategy).parameter(0).toEqualTypeOf<Placement>();
    // A Placement is a readable resource→position map; writing it is what is closed.
    expectTypeOf<Placement>().toExtend<ReadonlyMap<ResourceId, Readonly<MapPosition>>>();

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const resourceId: LayoutStrategyResource['id'] = 'resource';
    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const graphId: GraphRenderEdge['graphId'] = 'graph';
    // @ts-expect-error Plain strings cannot key a graph-owned position map.
    positionedStrategy(new Map<string, MapPosition>());
    // @ts-expect-error A Placement is built through the module, never by hand.
    positionedStrategy(new Map<ResourceId, MapPosition>());
    // @ts-expect-error Nor through the sanctioned constructor: closing construction
    // would mean nothing if `fromEntries` re-opened the seam it exists to hold.
    Placement.fromEntries([['resource', { x: 0, y: 0, open: false }]]);

    // A stored point is a value, not a handle into the map. Writing through one
    // would author a position no Edit made, past `next` and `place` both.
    const mutateStoredPoint = (placement: Placement, resourceId: ResourceId): void => {
      const at = placement.get(resourceId);
      // @ts-expect-error A Placement hands out readonly points.
      if (at !== undefined) at.x = 1;
    };
    void mutateStoredPoint;
    void resourceId;
    void graphId;
  });
});
