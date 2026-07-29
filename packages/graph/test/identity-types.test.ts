import { describe, expectTypeOf, it } from 'vitest';
import type { CardId, RouteId } from '@project/core';
import {
  layoutPositions,
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
    expectTypeOf(layoutPositions).returns.toEqualTypeOf<ReadonlyMap<CardId, LayoutPoint>>();
    expectTypeOf(positionedStrategy).parameter(0).toEqualTypeOf<ReadonlyMap<CardId, LayoutPoint>>();

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const cardId: LayoutCard['id'] = 'card';
    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const routeId: GraphEdge['routeId'] = 'route';
    // @ts-expect-error Plain strings cannot key a graph-owned position map.
    positionedStrategy(new Map<string, LayoutPoint>());
    void cardId;
    void routeId;
  });
});
