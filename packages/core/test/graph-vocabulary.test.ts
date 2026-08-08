import { describe, expect, it } from 'vitest';
import { BUILT_IN_VIEW_IDS, graphSchema, spaceFileSchema } from '../src/schema';

const SPACE_ID = '00000000-0000-4000-8000-000000000001';
const GRAPH_ID = '00000000-0000-4000-8000-000000000002';

describe('first-public Graph vocabulary', () => {
  it('accepts Graph document names and rejects the superseded Graph names', () => {
    expect(
      graphSchema.parse({
        id: GRAPH_ID,
        title: 'Main Graph',
        edges: [{ from: SPACE_ID, to: SPACE_ID }],
      }),
    ).toEqual({
      id: GRAPH_ID,
      title: 'Main Graph',
      edges: [{ from: SPACE_ID, to: SPACE_ID }],
    });

    expect(
      spaceFileSchema.safeParse({
        version: 2,
        id: SPACE_ID,
        title: 'Example',
        graphs: [],
        defaultView: 'flow',
      }).success,
    ).toBe(true);
    expect(
      spaceFileSchema.safeParse({
        version: 2,
        id: SPACE_ID,
        title: 'Example',
        routes: [],
        defaultView: 'graph',
      }).success,
    ).toBe(false);
    expect(BUILT_IN_VIEW_IDS).toEqual(['flow', 'grid']);
  });
});
