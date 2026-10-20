import { uuidSchema, type SpaceSnapshot } from '@project/core';
import type { LoadedAggregate } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import { classifyInitializedAggregate } from '../src/aggregate-lifecycle';

const META_ID = uuidSchema.parse('11111111-1111-4111-8111-111111111111');
const OTHER_ID = uuidSchema.parse('22222222-2222-4222-8222-222222222222');
const FIRST_RESOURCE = uuidSchema.parse('33333333-3333-4333-8333-333333333333');
const SECOND_RESOURCE = uuidSchema.parse('44444444-4444-4444-8444-444444444444');
const MAP_ID = uuidSchema.parse('55555555-5555-4555-8555-555555555555');
const FIRST_GRAPH = uuidSchema.parse('66666666-6666-4666-8666-666666666666');
const SECOND_GRAPH = uuidSchema.parse('77777777-7777-4777-8777-777777777777');

const meta: SpaceSnapshot = {
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
    maps: [
      {
        id: MAP_ID,
        title: 'Only',
        kind: 'positioned',
        positions: { [FIRST_RESOURCE]: { x: 0, y: 0 } },
        graphs: [
          { id: FIRST_GRAPH, title: 'First', edges: [] },
          { id: SECOND_GRAPH, title: 'Second', edges: [] },
        ],
      },
    ],
  },
  resources: [
    {
      id: FIRST_RESOURCE,
      document: { title: 'First', kind: 'markdown', content: { source: 'One.\n' } },
    },
    {
      id: SECOND_RESOURCE,
      document: { title: 'Second', kind: 'markdown', content: { source: 'Two.\n' } },
    },
  ],
};

const other: SpaceSnapshot = {
  id: OTHER_ID,
  document: { version: 1, title: 'Other' },
  resources: [],
};

const stored = (spaces: readonly SpaceSnapshot[]): LoadedAggregate => ({
  metaSpaceId: META_ID,
  spaces: spaces.map((snapshot) => ({ snapshot, revision: 3n, exportedRevision: null })),
});

describe('classifyInitializedAggregate', () => {
  it('answers existing for the same authored aggregate in another Space and Resource order', () => {
    const reordered: SpaceSnapshot = { ...meta, resources: [...meta.resources].reverse() };

    expect(
      classifyInitializedAggregate(
        { metaSpaceId: META_ID, spaces: [other, reordered] },
        stored([meta, other]),
      ).kind,
    ).toBe('existing');
  });

  it('answers already-initialized when a nested value differs', () => {
    const retitled: SpaceSnapshot = {
      ...meta,
      resources: meta.resources.map((resource) =>
        resource.id === SECOND_RESOURCE
          ? { ...resource, document: { ...resource.document, title: 'Changed' } }
          : resource,
      ),
    };

    expect(
      classifyInitializedAggregate(
        { metaSpaceId: META_ID, spaces: [retitled, other] },
        stored([meta, other]),
      ).kind,
    ).toBe('already-initialized');
  });

  it('answers already-initialized when the Graphs a Map owns are in another order', () => {
    const onlyMap = meta.document.maps?.[0];
    if (onlyMap === undefined) throw new Error('The fixture has no Map');
    const reordered: SpaceSnapshot = {
      ...meta,
      document: { ...meta.document, maps: [{ ...onlyMap, graphs: [...onlyMap.graphs].reverse() }] },
    };

    expect(
      classifyInitializedAggregate({ metaSpaceId: META_ID, spaces: [reordered] }, stored([meta]))
        .kind,
    ).toBe('already-initialized');
  });

  it('answers already-initialized when a Space is missing or another Meta is named', () => {
    expect(
      classifyInitializedAggregate({ metaSpaceId: META_ID, spaces: [meta] }, stored([meta, other]))
        .kind,
    ).toBe('already-initialized');
    expect(
      classifyInitializedAggregate(
        { metaSpaceId: OTHER_ID, spaces: [meta, other] },
        stored([meta, other]),
      ).kind,
    ).toBe('already-initialized');
  });
});
