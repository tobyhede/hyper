import { describe, expectTypeOf, it } from 'vitest';
import type { CardId, RouteId } from '@project/core';
import type { CardHandleSet } from '@project/graph';
import type {
  elkPortId,
  projectCardNodes,
  CardHandle,
  CardNodeData,
  ProjectCardNodesOptions,
  ProjectRouteEdgesOptions,
  RoutedEdgeData,
} from '@project/react-flow-adapter';

describe('React Flow adapter identity types', () => {
  it('preserves validated domain identities through the public projection contract', () => {
    expectTypeOf<CardHandle['routeId']>().toEqualTypeOf<RouteId>();
    expectTypeOf<CardNodeData['cardId']>().toEqualTypeOf<CardId>();
    expectTypeOf<CardNodeData['activeRouteId']>().toEqualTypeOf<RouteId | null>();
    expectTypeOf<ProjectCardNodesOptions['activeCardId']>().toEqualTypeOf<
      CardId | null | undefined
    >();
    expectTypeOf<ProjectCardNodesOptions['activeRouteId']>().toEqualTypeOf<
      RouteId | null | undefined
    >();
    expectTypeOf<ProjectCardNodesOptions['cardIds']>().toEqualTypeOf<
      readonly CardId[] | undefined
    >();
    expectTypeOf<ProjectRouteEdgesOptions['activeRouteId']>().toEqualTypeOf<
      RouteId | null | undefined
    >();
    expectTypeOf<RoutedEdgeData['routeId']>().toEqualTypeOf<RouteId>();
    expectTypeOf<Parameters<typeof elkPortId>[0]>().toEqualTypeOf<CardId>();
    expectTypeOf<Parameters<typeof projectCardNodes>[1]>().toEqualTypeOf<
      ReadonlyMap<CardId, CardHandleSet>
    >();

    // @ts-expect-error Plain strings cannot key a domain-bearing handle map.
    const handlesByCard: Parameters<typeof projectCardNodes>[1] = new Map<string, CardHandleSet>();
    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const activeRouteId: CardNodeData['activeRouteId'] = 'route';
    // @ts-expect-error A synthetic port id may be a string; its card namespace may not.
    const portCardId: Parameters<typeof elkPortId>[0] = 'card';
    void handlesByCard;
    void activeRouteId;
    void portCardId;
  });
});
