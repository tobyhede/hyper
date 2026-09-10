import { describe, expectTypeOf, it } from 'vitest';
import type { ThingId, DiagramPosition, GraphId } from '@project/core';
import {
  Placement,
  positionedStrategy,
  type GraphRenderEdge,
  type LayoutStrategyThing,
  type LayoutStrategyEdge,
  type GraphRenderHandleRef,
} from '@project/graph';

describe('graph identity types', () => {
  it('preserves validated identities through projection and diagram', () => {
    expectTypeOf<GraphRenderEdge['graphId']>().toEqualTypeOf<GraphId>();
    expectTypeOf<GraphRenderEdge['source']>().toEqualTypeOf<ThingId>();
    expectTypeOf<GraphRenderEdge['target']>().toEqualTypeOf<ThingId>();
    expectTypeOf<GraphRenderHandleRef['graphId']>().toEqualTypeOf<GraphId>();
    expectTypeOf<LayoutStrategyThing['id']>().toEqualTypeOf<ThingId>();
    expectTypeOf<LayoutStrategyEdge['source']>().toEqualTypeOf<ThingId>();
    expectTypeOf<LayoutStrategyEdge['target']>().toEqualTypeOf<ThingId>();
    expectTypeOf(Placement.fromLayoutStrategyGraph).returns.toEqualTypeOf<Placement>();
    expectTypeOf(positionedStrategy).parameter(0).toEqualTypeOf<Placement>();
    // A Placement is a readable thing→position map; writing it is what is closed.
    expectTypeOf<Placement>().toExtend<ReadonlyMap<ThingId, Readonly<DiagramPosition>>>();

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const thingId: LayoutStrategyThing['id'] = 'thing';
    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const graphId: GraphRenderEdge['graphId'] = 'graph';
    // @ts-expect-error Plain strings cannot key a graph-owned position map.
    positionedStrategy(new Map<string, DiagramPosition>());
    // @ts-expect-error A Placement is built through the module, never by hand.
    positionedStrategy(new Map<ThingId, DiagramPosition>());
    // @ts-expect-error Nor through the sanctioned constructor: closing construction
    // would mean nothing if `fromEntries` re-opened the seam it exists to hold.
    Placement.fromEntries([['thing', { x: 0, y: 0, open: false }]]);

    // A stored point is a value, not a handle into the map. Writing through one
    // would author a position no Edit made, past `next` and `place` both.
    const mutateStoredPoint = (placement: Placement, thingId: ThingId): void => {
      const at = placement.get(thingId);
      // @ts-expect-error A Placement hands out readonly points.
      if (at !== undefined) at.x = 1;
    };
    void mutateStoredPoint;
    void thingId;
    void graphId;
  });
});
