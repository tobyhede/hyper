import { describe, expectTypeOf, it } from 'vitest';
import type { ThingId, GraphId } from '@project/core';
import type { ThingHandleSet } from '@project/graph';
import type {
  elkPortId,
  projectThingNodes,
  ThingHandle,
  ThingNodeData,
  ProjectThingNodesOptions,
  ProjectGraphEdgesOptions,
  RoutedEdgeData,
} from '@project/react-flow-adapter';

describe('React Flow adapter identity types', () => {
  it('preserves validated domain identities through the public projection contract', () => {
    expectTypeOf<ThingHandle['graphId']>().toEqualTypeOf<GraphId>();
    expectTypeOf<ThingNodeData['thingId']>().toEqualTypeOf<ThingId>();
    expectTypeOf<ThingNodeData['activeGraphId']>().toEqualTypeOf<GraphId | null>();
    expectTypeOf<ProjectThingNodesOptions['activeThingId']>().toEqualTypeOf<
      ThingId | null | undefined
    >();
    expectTypeOf<ProjectThingNodesOptions['activeGraphId']>().toEqualTypeOf<
      GraphId | null | undefined
    >();
    expectTypeOf<ProjectThingNodesOptions['thingIds']>().toEqualTypeOf<
      readonly ThingId[] | undefined
    >();
    expectTypeOf<ProjectGraphEdgesOptions['activeGraphId']>().toEqualTypeOf<
      GraphId | null | undefined
    >();
    expectTypeOf<RoutedEdgeData['graphId']>().toEqualTypeOf<GraphId>();
    expectTypeOf<Parameters<typeof elkPortId>[0]>().toEqualTypeOf<ThingId>();
    expectTypeOf<Parameters<typeof projectThingNodes>[1]>().toEqualTypeOf<
      ReadonlyMap<ThingId, ThingHandleSet>
    >();

    // @ts-expect-error Plain strings cannot key a domain-bearing handle map.
    const handlesByThing: Parameters<typeof projectThingNodes>[1] = new Map<
      string,
      ThingHandleSet
    >();
    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const activeGraphId: ThingNodeData['activeGraphId'] = 'graph';
    // @ts-expect-error A synthetic port id may be a string; its thing namespace may not.
    const portThingId: Parameters<typeof elkPortId>[0] = 'thing';
    void handlesByThing;
    void activeGraphId;
    void portThingId;
  });
});
