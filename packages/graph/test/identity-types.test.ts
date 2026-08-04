import { describe, expectTypeOf, it } from 'vitest';
import type { CardId, LayoutPosition, RouteId } from '@project/core';
import {
  Placement,
  positionedStrategy,
  type GraphEdge,
  type LayoutCard,
  type LayoutEdge,
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
    // A Placement is a readable card→position map; writing it is what is closed.
    expectTypeOf<Placement>().toExtend<ReadonlyMap<CardId, Readonly<LayoutPosition>>>();

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const cardId: LayoutCard['id'] = 'card';
    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const routeId: GraphEdge['routeId'] = 'route';
    // @ts-expect-error Plain strings cannot key a graph-owned position map.
    positionedStrategy(new Map<string, LayoutPosition>());
    // @ts-expect-error A Placement is built through the module, never by hand.
    positionedStrategy(new Map<CardId, LayoutPosition>());
    // @ts-expect-error Nor through the sanctioned constructor: closing construction
    // would mean nothing if `fromEntries` re-opened the seam it exists to hold.
    Placement.fromEntries([['card', { x: 0, y: 0 }]]);

    // A stored point is a value, not a handle into the map. Writing through one
    // would author a position no Edit made, past `next` and `place` both.
    const mutateStoredPoint = (placement: Placement, cardId: CardId): void => {
      const at = placement.get(cardId);
      // @ts-expect-error A Placement hands out readonly points.
      if (at !== undefined) at.x = 1;
    };
    void mutateStoredPoint;
    void cardId;
    void routeId;
  });
});
