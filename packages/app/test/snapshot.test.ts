import { expect, it } from 'vitest';
import { spaceSnapshotSchema, uuidSchema } from '@project/core';
import { loadSpaceSnapshot, Placement } from '@project/graph';
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
  const changed = updatePositionedLayout(snapshot, {
    layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
    title: 'Layout',
    positions: Placement.fromEntries([['00000000-0000-4000-8000-000000000002', { x: 10, y: 20 }]]),
    activeRouteId: uuidSchema.parse('00000000-0000-4000-8000-000000000004'),
  });

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

// The active Route and the minted Route are both a `RouteId`, and a Layout puts
// them in two different places: `activeRoute`, and the `routes` filter. Every
// other case passes one id or the same id twice, so only a case where the two
// must differ tells a transposed pair from a correct one.
it('opens on the active Route while showing the minted Route the Edit added', () => {
  const twoRoutes = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      routes: [
        ...snapshot.document.routes,
        {
          id: '00000000-0000-4000-8000-000000000005',
          title: 'Minted',
          edges: [
            {
              from: '00000000-0000-4000-8000-000000000002',
              to: '00000000-0000-4000-8000-000000000002',
            },
          ],
        },
      ],
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000021',
          title: 'Layout',
          kind: 'positioned',
          positions: {},
          routes: ['00000000-0000-4000-8000-000000000004'],
        },
      ],
    },
  });

  const changed = updatePositionedLayout(twoRoutes, {
    layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
    title: 'Layout',
    positions: Placement.fromEntries([['00000000-0000-4000-8000-000000000002', { x: 1, y: 2 }]]),
    activeRouteId: uuidSchema.parse('00000000-0000-4000-8000-000000000004'),
    mintedRouteId: uuidSchema.parse('00000000-0000-4000-8000-000000000005'),
  });

  expect(changed.document.layouts).toEqual([
    {
      id: '00000000-0000-4000-8000-000000000021',
      title: 'Layout',
      kind: 'positioned',
      positions: { '00000000-0000-4000-8000-000000000002': { x: 1, y: 2 } },
      routes: ['00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005'],
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

  const changed = updatePositionedLayout(withLayouts, {
    layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
    title: 'Layout',
    positions: Placement.fromEntries([['00000000-0000-4000-8000-000000000002', { x: 5, y: 6 }]]),
    activeRouteId: uuidSchema.parse('00000000-0000-4000-8000-000000000004'),
  });

  expect(changed.document.layouts).toHaveLength(2);
  expect(changed.document.layouts?.map((layout) => layout.id)).toEqual([
    '00000000-0000-4000-8000-000000000021',
    '00000000-0000-4000-8000-000000000022',
  ]);
  expect(changed.document.layouts?.[0]?.routes).toEqual(['00000000-0000-4000-8000-000000000004']);
  expect(changed.cards).toEqual(snapshot.cards);
});

/**
 * `activeRoute` is authored, like the `routes` filter beside it, and the app has
 * no surface for clearing one. An Edit completed with no active Route therefore
 * has nothing to say about it, and must leave what the author wrote alone rather
 * than read its own silence as an instruction to erase.
 */
it('leaves an authored active Route alone when the Edit names none', () => {
  const withActiveRoute = spaceSnapshotSchema.parse({
    ...snapshot,
    document: {
      ...snapshot.document,
      layouts: [
        {
          id: '00000000-0000-4000-8000-000000000021',
          title: 'Layout',
          kind: 'positioned',
          positions: {},
          activeRoute: '00000000-0000-4000-8000-000000000004',
        },
      ],
    },
  });

  const changed = updatePositionedLayout(withActiveRoute, {
    layoutId: uuidSchema.parse('00000000-0000-4000-8000-000000000021'),
    title: 'Layout',
    positions: Placement.fromEntries([['00000000-0000-4000-8000-000000000002', { x: 5, y: 6 }]]),
    activeRouteId: null,
  });

  expect(changed.document.layouts?.[0]?.activeRoute).toBe('00000000-0000-4000-8000-000000000004');
  expect(loadSpaceSnapshot(changed).ok).toBe(true);
});
