import {
  FLOW_SPACE_VIEW_ID,
  encodeCompactUuid,
  spaceSnapshotSchema,
  uuidSchema,
} from '@project/core';
import type { LoadedSpace, SpaceBackend } from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import {
  productDestinationPath,
  resolveProductDestination,
  resolveProductDestinationInSnapshot,
} from '../src';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const loaded: LoadedSpace = {
  snapshot: spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      layouts: [
        {
          id: LAYOUT_ID,
          title: 'Layout',
          kind: 'positioned',
          positions: { [CARD_ID]: { x: 10, y: 20, open: false } },
          graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
        },
      ],
    },
    cards: [{ id: CARD_ID, document: { title: 'Card', kind: 'markdown', body: '' } }],
  }),
  revision: 7n,
  exportedRevision: 6n,
};

const loader = (result: LoadedSpace | undefined = loaded): Pick<SpaceBackend, 'loadSpace'> => ({
  loadSpace: vi.fn(() => Promise.resolve(result)),
});
const missingLoader = (): Pick<SpaceBackend, 'loadSpace'> => ({
  loadSpace: vi.fn(() => Promise.resolve(undefined)),
});

describe('product destinations', () => {
  it('formats canonical Space and explicit Space View destinations', () => {
    expect(productDestinationPath({ kind: 'space', spaceId: SPACE_ID })).toBe(
      `/spaces/${encodeCompactUuid(SPACE_ID)}`,
    );
    expect(
      productDestinationPath({ kind: 'space-view', spaceId: SPACE_ID, spaceViewId: LAYOUT_ID }),
    ).toBe(`/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}`);
  });

  it('formats and resolves canonical and contextual Card destinations', async () => {
    const canonical = `/spaces/${encodeCompactUuid(SPACE_ID)}/cards/${encodeCompactUuid(CARD_ID)}`;
    const contextual = `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}/cards/${encodeCompactUuid(CARD_ID)}`;

    expect(productDestinationPath({ kind: 'card', spaceId: SPACE_ID, cardId: CARD_ID })).toBe(
      canonical,
    );
    expect(
      productDestinationPath({
        kind: 'space-view-card',
        spaceId: SPACE_ID,
        spaceViewId: LAYOUT_ID,
        cardId: CARD_ID,
      }),
    ).toBe(contextual);
    await expect(resolveProductDestination(loader(), canonical)).resolves.toMatchObject({
      kind: 'resolved',
      destination: { kind: 'card', spaceId: SPACE_ID, cardId: CARD_ID },
    });
    await expect(resolveProductDestination(loader(), contextual)).resolves.toMatchObject({
      kind: 'resolved',
      destination: {
        kind: 'space-view-card',
        spaceId: SPACE_ID,
        spaceViewId: LAYOUT_ID,
        cardId: CARD_ID,
      },
    });
  });

  it('does not resolve a contextual Layout-and-Card destination when the Layout omits the Card', async () => {
    const omitted = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const withOmittedCard: LoadedSpace = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        cards: [
          ...loaded.snapshot.cards,
          { id: omitted, document: { title: 'Omitted', kind: 'markdown', body: '' } },
        ],
      },
    };

    await expect(
      resolveProductDestination(
        loader(withOmittedCard),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}/cards/${encodeCompactUuid(omitted)}`,
      ),
    ).resolves.toEqual({ kind: 'unresolved' });
  });

  it('resolves a browser-history destination against an already loaded snapshot', () => {
    expect(
      resolveProductDestinationInSnapshot(
        loaded.snapshot,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/cards/${encodeCompactUuid(CARD_ID)}`,
      ),
    ).toEqual({
      kind: 'resolved',
      destination: { kind: 'card', spaceId: SPACE_ID, cardId: CARD_ID },
    });
  });

  it.each([
    ['/assets/hyper.svg', { kind: 'outside' }],
    ['/spaces/not-a-compact-uuid', { kind: 'malformed' }],
    [
      `/spaces/${encodeCompactUuid(uuidSchema.parse('00000000-0000-4000-8000-000000000099'))}`,
      { kind: 'unresolved' },
    ],
  ] as const)('classifies an already-loaded browser-history path %s', (path, expected) => {
    expect(resolveProductDestinationInSnapshot(loaded.snapshot, path)).toEqual(expected);
  });

  it.each([
    {
      name: 'canonical Space',
      path: `/spaces/${encodeCompactUuid(SPACE_ID)}`,
      destination: { kind: 'space' as const, spaceId: SPACE_ID },
    },
    {
      name: 'Computed View',
      path: `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
      destination: {
        kind: 'space-view' as const,
        spaceId: SPACE_ID,
        spaceViewId: FLOW_SPACE_VIEW_ID,
      },
    },
    {
      name: 'Layout',
      path: `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(LAYOUT_ID)}`,
      destination: { kind: 'space-view' as const, spaceId: SPACE_ID, spaceViewId: LAYOUT_ID },
    },
  ])('loads and resolves a $name destination', async ({ path, destination }) => {
    const backend = loader();

    await expect(resolveProductDestination(backend, path)).resolves.toEqual({
      kind: 'resolved',
      destination,
      loaded,
    });
    expect(backend.loadSpace).toHaveBeenCalledOnce();
    expect(backend.loadSpace).toHaveBeenCalledWith(SPACE_ID);
  });

  it('classifies paths outside product addressing without loading', async () => {
    const backend = loader();

    await expect(resolveProductDestination(backend, '/assets/hyper.svg')).resolves.toEqual({
      kind: 'outside',
    });
    expect(backend.loadSpace).not.toHaveBeenCalled();
  });

  it.each([
    '/spaces',
    '/spaces/not-a-compact-uuid',
    `/spaces/${encodeCompactUuid(SPACE_ID)}/graphs/${encodeCompactUuid(LAYOUT_ID)}`,
  ])('classifies the claimed product address %s as malformed', async (path) => {
    const backend = loader();

    await expect(resolveProductDestination(backend, path)).resolves.toEqual({ kind: 'malformed' });
    expect(backend.loadSpace).not.toHaveBeenCalled();
  });

  it('classifies a missing root Space as unresolved', async () => {
    await expect(
      resolveProductDestination(missingLoader(), `/spaces/${encodeCompactUuid(SPACE_ID)}`),
    ).resolves.toEqual({ kind: 'unresolved' });
  });

  it('classifies an unknown Space View as unresolved', async () => {
    const missing = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

    await expect(
      resolveProductDestination(
        loader(),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(missing)}`,
      ),
    ).resolves.toEqual({ kind: 'unresolved' });
  });

  it('throws when a Computed View and Layout collide', async () => {
    const collision: LoadedSpace = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          layouts: loaded.snapshot.document.layouts?.map((layout) => ({
            ...layout,
            id: FLOW_SPACE_VIEW_ID,
          })),
        },
      },
    };

    await expect(
      resolveProductDestination(
        loader(collision),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/views/${encodeCompactUuid(FLOW_SPACE_VIEW_ID)}`,
      ),
    ).rejects.toThrow(/collision/);
  });

  it('throws for a canonical Space when a Computed View and Layout collide', async () => {
    const collision: LoadedSpace = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          layouts: loaded.snapshot.document.layouts?.map((layout) => ({
            ...layout,
            id: FLOW_SPACE_VIEW_ID,
          })),
        },
      },
    };
    const path = `/spaces/${encodeCompactUuid(SPACE_ID)}`;

    expect(() => resolveProductDestinationInSnapshot(collision.snapshot, path)).toThrow(
      /collision/,
    );
    await expect(resolveProductDestination(loader(collision), path)).rejects.toThrow(/collision/);
  });
});
