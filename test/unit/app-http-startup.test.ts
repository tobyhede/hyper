import { FLOW_SPACE_VIEW_ID, uuidSchema, type SpaceSnapshot } from '@project/core';
import { createSpaceHttpApp, HttpSpaceBackend, productDestinationPath } from '@project/http';
import { MemorySpaceBackend } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import { E2eMemorySpaceRepository } from '../support/e2e-memory-space-repository';
import { createSpaceStartup } from '../../packages/app/src/space';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const snapshot = (id = SPACE_ID, cardId = CARD_ID, title = 'Stored space'): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  cards: [{ id: cardId, document: { title: 'Start here', kind: 'markdown', body: 'Stored body' } }],
});

const startupFor = (...snapshots: SpaceSnapshot[]) => {
  const repository = new E2eMemorySpaceRepository(
    snapshots.map((value) => ({ snapshot: value, revision: 0n, exportedRevision: null })),
  );
  const app = createSpaceHttpApp(repository);
  return createSpaceStartup(
    new HttpSpaceBackend('http://hyper.test', {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    }),
  );
};

describe('HTTP space startup composition', () => {
  it('opens the Space named by the compact product-route id through HTTP', async () => {
    const startup = startupFor(snapshot());

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: SPACE_ID }),
    );

    expect(result.kind).toBe('opened');
    expect(result.opened.space.id).toBe(SPACE_ID);
    expect(result.opened.spaceSession.getState().acknowledgedRevision).toBe(0n);
  });

  it('fails when the product-route id no longer resolves', async () => {
    const startup = startupFor();

    await expect(
      startup.resolve(productDestinationPath({ kind: 'space', spaceId: SPACE_ID })),
    ).rejects.toThrow('The product URL does not resolve.');
  });

  it('opens the exact named Space when several are stored', async () => {
    const startup = startupFor(snapshot(), snapshot(OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space'));

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: OTHER_SPACE_ID }),
    );

    expect(result.opened.space.id).toBe(OTHER_SPACE_ID);
  });

  it('rejects a malformed compact product-route id', async () => {
    const startup = startupFor(snapshot());

    await expect(startup.resolve('/spaces/not-a-compact-uuid')).rejects.toThrow(
      'The product URL is malformed.',
    );
  });

  it('opens a resolved Space View from one backend load', async () => {
    const loaded = { snapshot: snapshot(), revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
    const loadSpace = vi.spyOn(backend, 'loadSpace');
    const startup = createSpaceStartup(backend);

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'space-view',
        spaceId: SPACE_ID,
        spaceViewId: FLOW_SPACE_VIEW_ID,
      }),
    );

    expect(result.selection).toBe(FLOW_SPACE_VIEW_ID);
    expect(result.opened.space.id).toBe(SPACE_ID);
    expect(loadSpace).toHaveBeenCalledOnce();
    expect(loadSpace).toHaveBeenCalledWith(SPACE_ID);
  });

  it('opens a canonical Graph in its owning Layout as navigation context', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Layout',
              kind: 'positioned' as const,
              positions: { [CARD_ID]: { x: 0, y: 0, open: false as const } },
              graphs: [{ id: GRAPH_ID, title: 'Graph', edges: [] }],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const startup = createSpaceStartup(new MemorySpaceBackend([loaded]));

    const result = await startup.resolve(
      productDestinationPath({ kind: 'graph', spaceId: SPACE_ID, graphId: GRAPH_ID }),
    );

    expect(result.selection).toBe(LAYOUT_ID);
    expect(result.graphId).toBe(GRAPH_ID);
  });

  it('opens a contextual Card in its named Space View without authoring it open', async () => {
    const layoutId = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          layouts: [
            {
              id: layoutId,
              title: 'Layout',
              kind: 'positioned' as const,
              positions: { [CARD_ID]: { x: 0, y: 0, open: false as const } },
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
    const startup = createSpaceStartup(new MemorySpaceBackend([loaded]));

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'space-view-card',
        spaceId: SPACE_ID,
        spaceViewId: layoutId,
        cardId: CARD_ID,
      }),
    );

    expect(result.selection).toBe(layoutId);
    expect(result.cardId).toBe(CARD_ID);
    expect(result.opened.space.lookup.layout(layoutId)?.layout.positions[CARD_ID]?.open).toBe(
      false,
    );
  });

  it('reveals a canonical Card omitted by the default Layout in the Cards collection', async () => {
    const layoutId = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const omittedId = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          defaultRenderer: layoutId,
          layouts: [
            {
              id: layoutId,
              title: 'Layout',
              kind: 'positioned' as const,
              positions: { [CARD_ID]: { x: 0, y: 0, open: false as const } },
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
        cards: [
          ...snapshot().cards,
          {
            id: omittedId,
            document: { title: 'Omitted', kind: 'markdown' as const, body: '' },
          },
        ],
      },
      revision: 0n,
      exportedRevision: null,
    };
    const startup = createSpaceStartup(new MemorySpaceBackend([loaded]));

    const result = await startup.resolve(
      productDestinationPath({ kind: 'card', spaceId: SPACE_ID, cardId: omittedId }),
    );

    expect(result.selection).toBe(FLOW_SPACE_VIEW_ID);
    expect(result.cardId).toBe(omittedId);
    expect(
      result.opened.space.lookup.layout(layoutId)?.layout.positions[omittedId],
    ).toBeUndefined();
  });
});
