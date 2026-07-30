import { expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema } from '@project/core';
import { loadSpaceSnapshot } from '@project/graph';
import { snapshotFromSpace, updatePositionedLayout } from '../src/snapshot';

const snapshot = spaceSnapshotSchema.parse({
  id: '00000000-0000-4000-8000-000000000001',
  document: {
    version: 2,
    title: 'Space',
    routes: [
      {
        id: '00000000-0000-4000-8000-000000000004',
        title: 'Main',
        edges: [
          {
            from: '00000000-0000-4000-8000-000000000002',
            to: '00000000-0000-4000-8000-000000000003',
          },
        ],
      },
    ],
  },
  cards: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      document: { title: 'Card', kind: 'markdown', body: 'Body' },
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      document: { title: 'Next', kind: 'markdown', body: 'More' },
    },
  ],
});

it('updates placement as a complete valid persistence snapshot', () => {
  const changed = updatePositionedLayout(
    snapshot,
    uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
    'Layout',
    new Map([['00000000-0000-4000-8000-000000000002', { x: 10, y: 20 }]]),
    uuidSchema.parse('00000000-0000-4000-8000-000000000004'),
  );

  expect(changed.cards).toEqual(snapshot.cards);
  expect(changed.document.defaultView).toBe('00000000-0000-4000-8000-000000000021');
  expect(changed.document.layouts).toEqual([
    {
      id: '00000000-0000-4000-8000-000000000021',
      title: 'Layout',
      kind: 'positioned',
      positions: { '00000000-0000-4000-8000-000000000002': { x: 10, y: 20 } },
      activeRoute: '00000000-0000-4000-8000-000000000004',
    },
  ]);
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});

it('converts the validated runtime aggregate back to the persistence seam', () => {
  const loaded = loadSpaceSnapshot(snapshot);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;

  expect(snapshotFromSpace(loaded.space)).toEqual(snapshot);
});

it('preserves authored view scope and unrelated layouts while replacing placement', () => {
  const withLayouts = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000021',
          title: 'Layout',
          kind: 'positioned',
          positions: {},
          routes: ['00000000-0000-4000-8000-000000000004'],
        },
        {
          id: '00000000-0000-4000-8000-000000000022',
          title: 'Other',
          kind: 'positioned',
          positions: {},
        },
      ],
    },
  });

  const changed = updatePositionedLayout(
    withLayouts,
    uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
    'Layout',
    new Map([['00000000-0000-4000-8000-000000000002', { x: 5, y: 6 }]]),
    uuidSchema.parse('00000000-0000-4000-8000-000000000004'),
  );

  expect(changed.document.layouts).toHaveLength(2);
  expect(changed.document.layouts?.map((layout) => layout.id)).toEqual([
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000022',
  ]);
  expect(changed.document.layouts?.[0]?.routes).toEqual(['00000000-0000-4000-8000-000000000004']);
  expect(changed.cards).toEqual(snapshot.cards);
});
