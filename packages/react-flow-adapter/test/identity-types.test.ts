import { describe, expectTypeOf, it } from 'vitest';
import type { ThingId, GraphId } from '@project/core';
import type {
  ThingNodeData,
  ProjectThingNodesOptions,
  ProjectGraphEdgesOptions,
  RoutedEdgeData,
} from '@project/react-flow-adapter';

describe('React Flow adapter identity types', () => {
  it('preserves validated domain identities through the public projection contract', () => {
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

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const activeGraphId: ThingNodeData['activeGraphId'] = 'graph';
    void activeGraphId;
  });
});
