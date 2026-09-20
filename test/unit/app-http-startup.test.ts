import { newUuid, uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import { createSpaceHttpApp, HttpSpaceBackend, productDestinationPath } from '@project/http';
import { MemorySpaceBackend, type SpaceBackend } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { createSpaceStartup, type SpaceStartup } from '../../packages/app/src/space';
import { recordingHistory } from '../../packages/app/test/browser-history';

/**
 * Startup over the recording browser rather than the ambient one.
 *
 * `createSpaceStartup` is the one module that names `window.history` and
 * `window.location`, and it names them as the default third seam (ADR 0081).
 * These tests run in the node environment, so each supplies the other adapter —
 * which is what a seam required below the composition root is for.
 */
const startupOver = (backend: SpaceBackend, newId: () => UUID = newUuid): SpaceStartup =>
  createSpaceStartup(backend, newId, recordingHistory());

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');
const OTHER_MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
const OTHER_GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000008');

const snapshot = (
  id = SPACE_ID,
  resourceId = RESOURCE_ID,
  title = 'Stored space',
): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  resources: [
    { id: resourceId, document: { title: 'Start here', kind: 'markdown', body: 'Stored body' } },
  ],
});

const metaReferencingOther = (): SpaceSnapshot => ({
  id: SPACE_ID,
  document: { version: 1, title: 'Stored space' },
  resources: [
    {
      id: RESOURCE_ID,
      document: {
        title: 'Other space',
        kind: 'space',
        spaceId: OTHER_SPACE_ID,
        map: OTHER_MAP_ID,
        graph: OTHER_GRAPH_ID,
      },
    },
  ],
});

/**
 * The Space the Meta Space above points at, carrying the Map and Graph that
 * Space Resource selects.
 *
 * A Space Resource names a Map of its target and a Graph that Map owns
 * (ADR 0079), so the target cannot be the structureless `snapshot` — a Map
 * the target minted for itself on first working load would carry an identity
 * this fixture could not have written down.
 */
const otherSnapshot = (): SpaceSnapshot => {
  const base = snapshot(OTHER_SPACE_ID, OTHER_RESOURCE_ID, 'Other space');
  return {
    ...base,
    document: {
      ...base.document,
      defaultMap: OTHER_MAP_ID,
      maps: [
        {
          id: OTHER_MAP_ID,
          title: 'Map 1',
          kind: 'positioned',
          positions: { [OTHER_RESOURCE_ID]: { x: 0, y: 0, open: false } },
          graphs: [{ id: OTHER_GRAPH_ID, title: 'Graph 1', edges: [] }],
          activeGraph: OTHER_GRAPH_ID,
        },
      ],
    },
  };
};

const startupFor = (metaSpaceId: UUID, ...snapshots: SpaceSnapshot[]) => {
  const repository = new E2eMemorySpaceRepository(
    snapshots.map((value) => ({ snapshot: value, revision: 0n, exportedRevision: null })),
    metaSpaceId,
  );
  const app = createSpaceHttpApp(repository);
  return startupOver(
    new HttpSpaceBackend('http://hyper.test', {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    }),
  );
};

describe('HTTP space startup composition', () => {
  it('initializes a mapless Space through an injected memory backend before opening it', async () => {
    const backend = MemorySpaceBackend.asMeta({
      snapshot: snapshot(),
      revision: 0n,
      exportedRevision: null,
    });
    const ids = [MAP_ID, GRAPH_ID];
    const startup = startupOver(backend, () => {
      const id = ids.shift();
      if (id === undefined) throw new Error('initializer minted too many identities');
      return id;
    });

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: SPACE_ID }),
    );

    // The repair is read off what it wrote rather than off an announcement: the
    // `initialization` field and the header behind it went with the disclosure
    // they existed to trigger (`.scratch/command-dock/issues/13`).
    expect(result.opened.session.getState().acknowledgedRevision).toBe(1n);
    expect(result.opened.app.currentSpace().lookup.map(MAP_ID)?.map.positions).toEqual({});
  });

  it('opens the Space named by the compact product-route id through HTTP', async () => {
    const startup = startupFor(SPACE_ID, snapshot());

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: SPACE_ID }),
    );

    expect(result.kind).toBe('opened');
    expect(result.opened.app.currentSpace().id).toBe(SPACE_ID);
    expect(result.opened.session.getState().acknowledgedRevision).toBe(1n);
  });

  it('fails when the product-route id no longer resolves', async () => {
    const startup = startupFor(
      OTHER_SPACE_ID,
      snapshot(OTHER_SPACE_ID, OTHER_RESOURCE_ID, 'Other space'),
    );

    await expect(
      startup.resolve(productDestinationPath({ kind: 'space', spaceId: SPACE_ID })),
    ).rejects.toThrow('The product URL does not resolve.');
  });

  it('opens the exact named Space when several are stored', async () => {
    const startup = startupFor(SPACE_ID, metaReferencingOther(), otherSnapshot());

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: OTHER_SPACE_ID }),
    );

    expect(result.opened.app.currentSpace().id).toBe(OTHER_SPACE_ID);
  });

  it('names the Meta Space from the aggregate it loaded while Meta is not open', async () => {
    const startup = startupFor(SPACE_ID, metaReferencingOther(), otherSnapshot());

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: OTHER_SPACE_ID }),
    );

    expect(result.spaces.entry(SPACE_ID)).toBeUndefined();
    expect(result.spaces.meta()).toEqual({ spaceId: SPACE_ID, title: 'Stored space' });
  });

  it('retries a startup whose first aggregate load failed', async () => {
    class FlakyAggregateBackend extends MemorySpaceBackend {
      failNextLoad = true;

      override loadAggregate(): ReturnType<MemorySpaceBackend['loadAggregate']> {
        if (this.failNextLoad) {
          this.failNextLoad = false;
          return Promise.reject(new Error('aggregate transport exploded'));
        }
        return super.loadAggregate();
      }
    }

    const backend = new FlakyAggregateBackend(SPACE_ID, [
      { snapshot: snapshot(), revision: 0n, exportedRevision: null },
    ]);
    const startup = startupOver(backend);
    const destination = productDestinationPath({ kind: 'space', spaceId: SPACE_ID });

    await expect(startup.resolve(destination)).rejects.toThrow('aggregate transport exploded');

    // A transport failure is not a permanent verdict on the repository. Keeping
    // the rejected attempt would answer every later startup with a stale error.
    const result = await startup.resolve(destination);
    expect(result.kind).toBe('opened');
  });

  it('rejects a malformed compact product-route id', async () => {
    const startup = startupFor(SPACE_ID, snapshot());

    await expect(startup.resolve('/spaces/not-a-compact-uuid')).rejects.toThrow(
      'The product URL is malformed.',
    );
  });

  it('opens a resolved Map from one backend load', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          defaultMap: MAP_ID,
          maps: [
            {
              id: MAP_ID,
              title: 'Map 1',
              kind: 'positioned' as const,
              positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false as const } },
              graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const backend = MemorySpaceBackend.asMeta(loaded);
    const loadSpace = vi.spyOn(backend, 'loadSpace');
    const startup = startupOver(backend);

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'map',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
      }),
    );

    expect(result.opening?.selection).toBe(MAP_ID);
    expect(result.opened.app.currentSpace().id).toBe(SPACE_ID);
    expect(loadSpace).toHaveBeenCalledOnce();
    expect(loadSpace).toHaveBeenCalledWith(SPACE_ID);
  });

  it('reuses the live Space session when the runtime reopens the same Space', async () => {
    const loaded = { snapshot: snapshot(), revision: 0n, exportedRevision: null };
    const backend = MemorySpaceBackend.asMeta(loaded);
    const loadSpace = vi.spyOn(backend, 'loadSpace');
    const startup = startupOver(backend);
    const destination = productDestinationPath({ kind: 'space', spaceId: SPACE_ID });

    const first = await startup.resolve(destination);
    const reopened = await startup.resolve(destination);

    expect(reopened.opened.session).toBe(first.opened.session);
    expect(loadSpace).toHaveBeenCalledTimes(2);
    expect(loadSpace).toHaveBeenNthCalledWith(1, SPACE_ID);
    expect(loadSpace).toHaveBeenNthCalledWith(2, SPACE_ID);
  });

  it('opens a canonical Graph in its owning Map as navigation context', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          maps: [
            {
              id: MAP_ID,
              title: 'Map',
              kind: 'positioned' as const,
              positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false as const } },
              graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const startup = startupOver(MemorySpaceBackend.asMeta(loaded));

    const result = await startup.resolve(
      productDestinationPath({ kind: 'graph', spaceId: SPACE_ID, graphId: GRAPH_ID }),
    );

    expect(result.opening?.selection).toBe(MAP_ID);
    expect(result.opening?.graphId).toBe(GRAPH_ID);
  });

  it('opens an exact presentation point with its named View, Graph and Resource', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        resources: [
          ...snapshot().resources,
          {
            id: OTHER_RESOURCE_ID,
            document: { title: 'Next', kind: 'markdown' as const, body: '' },
          },
        ],
        document: {
          version: 1 as const,
          title: 'Stored space',
          maps: [
            {
              id: MAP_ID,
              title: 'Map',
              kind: 'positioned' as const,
              positions: {
                [RESOURCE_ID]: { x: 0, y: 0, open: false as const },
                [OTHER_RESOURCE_ID]: { x: 320, y: 0, open: false as const },
              },
              graphs: [
                {
                  id: GRAPH_ID,
                  title: 'Graph',
                  edges: [{ from: RESOURCE_ID, to: OTHER_RESOURCE_ID }],
                },
              ],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const startup = startupOver(MemorySpaceBackend.asMeta(loaded));

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'presentation',
        spaceId: SPACE_ID,
        mapId: MAP_ID,
        graphId: GRAPH_ID,
        resourceId: OTHER_RESOURCE_ID,
      }),
    );

    expect(result.opening?.selection).toBe(MAP_ID);
    expect(result.opening?.graphId).toBe(GRAPH_ID);
    expect(result.opening?.presentationResourceId).toBe(OTHER_RESOURCE_ID);
  });

  it('opens a contextual Resource in its named Map without authoring it open', async () => {
    const mapId = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          maps: [
            {
              id: mapId,
              title: 'Map',
              kind: 'positioned' as const,
              positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false as const } },
              graphs: [
                {
                  id: uuidSchema.parse('00000000-0000-4000-8000-000000000006'),
                  title: 'Graph',
                  edges: [],
                },
              ],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const startup = startupOver(MemorySpaceBackend.asMeta(loaded));

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'map-resource',
        spaceId: SPACE_ID,
        mapId: mapId,
        resourceId: RESOURCE_ID,
      }),
    );

    expect(result.opening?.selection).toBe(mapId);
    expect(result.opening?.resourceId).toBe(RESOURCE_ID);
    expect(
      result.opened.app.currentSpace().lookup.map(mapId)?.map.positions[RESOURCE_ID]?.open,
    ).toBe(false);
  });

  it('reveals a canonical Resource omitted by the default Map in the Resources collection', async () => {
    const mapId = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const omittedId = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          defaultMap: mapId,
          maps: [
            {
              id: mapId,
              title: 'Map',
              kind: 'positioned' as const,
              positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false as const } },
              graphs: [
                {
                  id: uuidSchema.parse('00000000-0000-4000-8000-000000000006'),
                  title: 'Graph',
                  edges: [],
                },
              ],
            },
          ],
        },
        resources: [
          ...snapshot().resources,
          {
            id: omittedId,
            document: { title: 'Omitted', kind: 'markdown' as const, body: '' },
          },
        ],
      },
      revision: 0n,
      exportedRevision: null,
    };
    const startup = startupOver(MemorySpaceBackend.asMeta(loaded));

    const result = await startup.resolve(
      productDestinationPath({ kind: 'resource', spaceId: SPACE_ID, resourceId: omittedId }),
    );

    expect(result.opening?.selection).toBe(mapId);
    expect(result.opening?.resourceId).toBe(omittedId);
    expect(
      result.opened.app.currentSpace().lookup.map(mapId)?.map.positions[omittedId],
    ).toBeUndefined();
  });
});
