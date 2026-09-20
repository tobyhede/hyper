import { encodeCompactUuid, spaceSnapshotSchema, uuidSchema } from '@project/core';
import type { LoadedSpace, SpaceBackend } from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import {
  productDestinationPath,
  resolveProductDestination,
  resolveProductDestinationInSnapshot,
} from '../src';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const loaded: LoadedSpace = {
  snapshot: spaceSnapshotSchema.parse({
    id: SPACE_ID,
    document: {
      version: 1,
      title: 'Space',
      maps: [
        {
          id: MAP_ID,
          title: 'Map',
          kind: 'positioned',
          positions: { [RESOURCE_ID]: { x: 10, y: 20, open: false } },
          graphs: [
            { id: GRAPH_ID, title: 'Graph', edges: [{ from: RESOURCE_ID, to: OTHER_RESOURCE_ID }] },
          ],
        },
      ],
    },
    resources: [
      { id: RESOURCE_ID, document: { title: 'Resource', kind: 'markdown', body: '' } },
      { id: OTHER_RESOURCE_ID, document: { title: 'Other', kind: 'markdown', body: '' } },
    ],
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
  it('formats canonical Space and explicit Map destinations', () => {
    expect(productDestinationPath({ kind: 'space', spaceId: SPACE_ID })).toBe(
      `/spaces/${encodeCompactUuid(SPACE_ID)}`,
    );
    expect(productDestinationPath({ kind: 'map', spaceId: SPACE_ID, mapId: MAP_ID })).toBe(
      `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}`,
    );
  });

  it('formats and resolves canonical and contextual Resource destinations', async () => {
    const canonical = `/spaces/${encodeCompactUuid(SPACE_ID)}/resources/${encodeCompactUuid(RESOURCE_ID)}`;
    const contextual = `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/resources/${encodeCompactUuid(RESOURCE_ID)}`;

    expect(
      productDestinationPath({ kind: 'resource', spaceId: SPACE_ID, resourceId: RESOURCE_ID }),
    ).toBe(canonical);
    expect(
      productDestinationPath({
        kind: 'map-resource',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        resourceId: RESOURCE_ID,
      }),
    ).toBe(contextual);
    await expect(resolveProductDestination(loader(), canonical)).resolves.toMatchObject({
      kind: 'resolved',
      destination: { kind: 'resource', spaceId: SPACE_ID, resourceId: RESOURCE_ID },
    });
    await expect(resolveProductDestination(loader(), contextual)).resolves.toMatchObject({
      kind: 'resolved',
      destination: {
        kind: 'map-resource',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        resourceId: RESOURCE_ID,
      },
    });
    await expect(
      resolveProductDestination(
        loader(),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}`,
      ),
    ).resolves.toMatchObject({
      kind: 'resolved',
      destination: { kind: 'map-graph', mapId: MAP_ID },
    });
  });

  it('classifies malformed and missing Graph destinations', async () => {
    const missing = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

    await expect(
      resolveProductDestination(
        loader(),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/graphs/not-a-compact-uuid`,
      ),
    ).resolves.toEqual({ kind: 'malformed' });
    await expect(
      resolveProductDestination(
        loader(),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/not-graphs/${encodeCompactUuid(GRAPH_ID)}`,
      ),
    ).resolves.toEqual({ kind: 'malformed' });
    await expect(
      resolveProductDestination(
        loader(),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/graphs/${encodeCompactUuid(missing)}`,
      ),
    ).resolves.toEqual({ kind: 'unresolved' });
  });

  it('formats and resolves canonical and contextual Graph destinations', async () => {
    const canonical = `/spaces/${encodeCompactUuid(SPACE_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}`;
    const contextual = `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}`;

    expect(productDestinationPath({ kind: 'graph', spaceId: SPACE_ID, graphId: GRAPH_ID })).toBe(
      canonical,
    );
    expect(
      productDestinationPath({
        kind: 'map-graph',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        graphId: GRAPH_ID,
      }),
    ).toBe(contextual);
    await expect(resolveProductDestination(loader(), canonical)).resolves.toMatchObject({
      kind: 'resolved',
      destination: { kind: 'graph', spaceId: SPACE_ID, graphId: GRAPH_ID },
    });
    await expect(resolveProductDestination(loader(), contextual)).resolves.toMatchObject({
      kind: 'resolved',
      destination: {
        kind: 'map-graph',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        graphId: GRAPH_ID,
      },
    });
  });

  it('formats and resolves an exact contextual presentation destination', async () => {
    const presentation = `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_ID)}`;

    expect(
      productDestinationPath({
        kind: 'presentation',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        graphId: GRAPH_ID,
        resourceId: RESOURCE_ID,
      }),
    ).toBe(presentation);
    await expect(resolveProductDestination(loader(), presentation)).resolves.toMatchObject({
      kind: 'resolved',
      destination: {
        kind: 'presentation',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        graphId: GRAPH_ID,
        resourceId: RESOURCE_ID,
      },
    });
    expect(resolveProductDestinationInSnapshot(loaded.snapshot, presentation)).toEqual({
      kind: 'resolved',
      destination: {
        kind: 'presentation',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        graphId: GRAPH_ID,
        resourceId: RESOURCE_ID,
      },
    });
  });

  it.each([
    ['an unknown Resource', '00000000-0000-4000-8000-000000000099', false],
    ['a Resource outside the Graph', '00000000-0000-4000-8000-000000000006', true],
  ])(
    'does not resolve a presentation destination for %s',
    async (_name, resourceValue, isStored) => {
      const resourceId = uuidSchema.parse(resourceValue);
      const withOutsideResource: LoadedSpace = {
        ...loaded,
        snapshot: {
          ...loaded.snapshot,
          resources: isStored
            ? [
                ...loaded.snapshot.resources,
                { id: resourceId, document: { title: 'Outside', kind: 'markdown', body: '' } },
              ]
            : loaded.snapshot.resources,
        },
      };
      const presentation = `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}/present/${encodeCompactUuid(resourceId)}`;

      await expect(
        resolveProductDestination(loader(withOutsideResource), presentation),
      ).resolves.toEqual({
        kind: 'unresolved',
      });
    },
  );

  it.each([
    `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}/present/not-a-compact-uuid`,
    `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_ID)}/extra`,
    `/spaces/${encodeCompactUuid(SPACE_ID)}/graphs/${encodeCompactUuid(GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_ID)}`,
  ])('classifies the invalid presentation path %s as malformed', async (path) => {
    await expect(resolveProductDestination(loader(), path)).resolves.toEqual({ kind: 'malformed' });
  });

  it('does not resolve a contextual Map-and-Graph destination when the Map does not own the Graph', async () => {
    const otherMap = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
    const withOtherMap: LoadedSpace = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        document: {
          ...loaded.snapshot.document,
          maps: [
            ...(loaded.snapshot.document.maps ?? []),
            {
              id: otherMap,
              title: 'Other Map',
              kind: 'positioned',
              positions: { [RESOURCE_ID]: { x: 30, y: 40, open: false } },
              graphs: [],
            },
          ],
        },
      },
    };

    await expect(
      resolveProductDestination(
        loader(withOtherMap),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(otherMap)}/graphs/${encodeCompactUuid(GRAPH_ID)}`,
      ),
    ).resolves.toEqual({ kind: 'unresolved' });
    await expect(
      resolveProductDestination(
        loader(withOtherMap),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(otherMap)}/graphs/${encodeCompactUuid(GRAPH_ID)}/present/${encodeCompactUuid(RESOURCE_ID)}`,
      ),
    ).resolves.toEqual({ kind: 'unresolved' });
  });

  it('does not resolve a contextual Map-and-Resource destination when the Map omits the Resource', async () => {
    const omitted = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const withOmittedResource: LoadedSpace = {
      ...loaded,
      snapshot: {
        ...loaded.snapshot,
        resources: [
          ...loaded.snapshot.resources,
          { id: omitted, document: { title: 'Omitted', kind: 'markdown', body: '' } },
        ],
      },
    };

    await expect(
      resolveProductDestination(
        loader(withOmittedResource),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/resources/${encodeCompactUuid(omitted)}`,
      ),
    ).resolves.toEqual({ kind: 'unresolved' });
  });

  it('classifies a malformed contextual Resource id without loading the Space', async () => {
    const backend = loader();

    await expect(
      resolveProductDestination(
        backend,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}/resources/not-a-compact-uuid`,
      ),
    ).resolves.toEqual({ kind: 'malformed' });
    expect(backend.loadSpace).not.toHaveBeenCalled();
  });

  it('resolves a browser-history destination against an already loaded snapshot', () => {
    expect(
      resolveProductDestinationInSnapshot(
        loaded.snapshot,
        `/spaces/${encodeCompactUuid(SPACE_ID)}/resources/${encodeCompactUuid(RESOURCE_ID)}`,
      ),
    ).toEqual({
      kind: 'resolved',
      destination: { kind: 'resource', spaceId: SPACE_ID, resourceId: RESOURCE_ID },
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
      name: 'Map',
      path: `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}`,
      destination: {
        kind: 'map' as const,
        spaceId: SPACE_ID,
        mapId: MAP_ID,
      },
    },
    {
      name: 'Map',
      path: `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(MAP_ID)}`,
      destination: { kind: 'map' as const, spaceId: SPACE_ID, mapId: MAP_ID },
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

  it.each(['/spaces', '/spaces/not-a-compact-uuid'])(
    'classifies the claimed product address %s as malformed',
    async (path) => {
      const backend = loader();

      await expect(resolveProductDestination(backend, path)).resolves.toEqual({
        kind: 'malformed',
      });
      expect(backend.loadSpace).not.toHaveBeenCalled();
    },
  );

  it('classifies a missing root Space as unresolved', async () => {
    await expect(
      resolveProductDestination(missingLoader(), `/spaces/${encodeCompactUuid(SPACE_ID)}`),
    ).resolves.toEqual({ kind: 'unresolved' });
  });

  it('classifies an unknown Map as unresolved', async () => {
    const missing = uuidSchema.parse('00000000-0000-4000-8000-000000000099');

    await expect(
      resolveProductDestination(
        loader(),
        `/spaces/${encodeCompactUuid(SPACE_ID)}/maps/${encodeCompactUuid(missing)}`,
      ),
    ).resolves.toEqual({ kind: 'unresolved' });
  });
});
