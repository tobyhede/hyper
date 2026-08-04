import { describe, expectTypeOf, it } from 'vitest';
import type { CardId, RouteId } from '@project/core';
import {
  Placement,
  positionedStrategy,
  type GraphEdge,
  type LayoutCard,
  type LayoutEdge,
  type LayoutPoint,
  type RouteHandleRef,
} from '@project/graph';

describe('graph identity types', () => {
  it('preserves validated identities through projection and layout', () => {
    expectTypeOf<GraphEdge['routeId']>().toEqualTypeOf<RouteId>();
    expectTypeOf<GraphEdge['source']>().toEqualTypeOf<CardId>();
    expectTypeOf<GraphEdge['target']>().toEqualTypeOf<CardId>();
    expectTypeOf<RouteHandleRef['routeId']>().toEqualTypeOf<RouteId>();
    expectTypeOf<LayoutCard['id']>().toEqualTypeOf<CardId>();
    expectTypeOf<LayoutEdge['source']>().toEqualTypeOf<CardId>();
    expectTypeOf<LayoutEdge['target']>().toEqualTypeOf<CardId>();
    expectTypeOf(Placement.fromLayoutGraph).returns.toEqualTypeOf<Placement>();
    expectTypeOf(positionedStrategy).parameter(0).toEqualTypeOf<Placement>();
    // A Placement is a readable card→position map; only construction is closed.
    expectTypeOf<Placement>().toExtend<ReadonlyMap<CardId, LayoutPoint>>();

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const cardId: LayoutCard['id'] = 'card';
    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const routeId: GraphEdge['routeId'] = 'route';
    // @ts-expect-error Plain strings cannot key a graph-owned position map.
    positionedStrategy(new Map<string, LayoutPoint>());
    // @ts-expect-error A Placement is built through the module, never by hand.
    positionedStrategy(new Map<CardId, LayoutPoint>());
    // @ts-expect-error A rendered position's key crosses the seam at its caller.
    Placement.fromEntries([['card', { x: 0, y: 0 }]]);
    void cardId;
    void routeId;
  });
});
