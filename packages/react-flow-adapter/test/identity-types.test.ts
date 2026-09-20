import { describe, expectTypeOf, it } from 'vitest';
import type { ResourceId, GraphId } from '@project/core';
import type {
  ResourceNodeData,
  ProjectResourceNodesOptions,
  ProjectGraphEdgesOptions,
  RoutedEdgeData,
} from '@project/react-flow-adapter';

describe('React Flow adapter identity types', () => {
  it('preserves validated domain identities through the public projection contract', () => {
    expectTypeOf<ResourceNodeData['resourceId']>().toEqualTypeOf<ResourceId>();
    expectTypeOf<ResourceNodeData['activeGraphId']>().toEqualTypeOf<GraphId | null>();
    expectTypeOf<ProjectResourceNodesOptions['activeResourceId']>().toEqualTypeOf<
      ResourceId | null | undefined
    >();
    expectTypeOf<ProjectResourceNodesOptions['activeGraphId']>().toEqualTypeOf<
      GraphId | null | undefined
    >();
    expectTypeOf<ProjectResourceNodesOptions['resourceIds']>().toEqualTypeOf<
      readonly ResourceId[] | undefined
    >();
    expectTypeOf<ProjectGraphEdgesOptions['activeGraphId']>().toEqualTypeOf<
      GraphId | null | undefined
    >();
    expectTypeOf<RoutedEdgeData['graphId']>().toEqualTypeOf<GraphId>();

    // @ts-expect-error A plain string has not crossed the UUID validation seam.
    const activeGraphId: ResourceNodeData['activeGraphId'] = 'graph';
    void activeGraphId;
  });
});
