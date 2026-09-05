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
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const LAYOUT_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const snapshot = (id = SPACE_ID, cardId = CARD_ID, title = 'Stored space'): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  cards: [{ id: cardId, document: { title: 'Start here', kind: 'markdown', body: 'Stored body' } }],
});

const metaReferencingOther = (): SpaceSnapshot => ({
  id: SPACE_ID,
  document: { version: 1, title: 'Stored space' },
  cards: [
    {
      id: CARD_ID,
      document: { title: 'Other space', kind: 'space', spaceId: OTHER_SPACE_ID },
    },
  ],
});

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
  it('initializes a layoutless Space through an injected memory backend before opening it', async () => {
    const backend = new MemorySpaceBackend([
      { snapshot: snapshot(), revision: 0n, exportedRevision: null },
    ]);
    const ids = [LAYOUT_ID, GRAPH_ID];
    const startup = startupOver(backend, () => {
      const id = ids.shift();
      if (id === undefined) throw new Error('initializer minted too many identities');
      return id;
    });

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: SPACE_ID }),
    );

    expect(result.opened.initialization).toBe('created-layout');
    expect(result.opened.session.getState().acknowledgedRevision).toBe(1n);
    expect(result.opened.app.currentSpace().lookup.layout(LAYOUT_ID)?.layout.positions).toEqual({});
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
      snapshot(OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space'),
    );

    await expect(
      startup.resolve(productDestinationPath({ kind: 'space', spaceId: SPACE_ID })),
    ).rejects.toThrow('The product URL does not resolve.');
  });

  it('opens the exact named Space when several are stored', async () => {
    const startup = startupFor(
      SPACE_ID,
      metaReferencingOther(),
      snapshot(OTHER_SPACE_ID, OTHER_CARD_ID, 'Other space'),
    );

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: OTHER_SPACE_ID }),
    );

    expect(result.opened.app.currentSpace().id).toBe(OTHER_SPACE_ID);
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

  it('opens a resolved Layout from one backend load', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          defaultLayout: LAYOUT_ID,
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Layout 1',
              kind: 'positioned' as const,
              positions: { [CARD_ID]: { x: 0, y: 0, open: false as const } },
              graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const backend = new MemorySpaceBackend([loaded]);
    const loadSpace = vi.spyOn(backend, 'loadSpace');
    const startup = startupOver(backend);

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'layout',
        spaceId: SPACE_ID,
        layoutId: LAYOUT_ID,
      }),
    );

    expect(result.opening?.selection).toBe(LAYOUT_ID);
    expect(result.opened.app.currentSpace().id).toBe(SPACE_ID);
    expect(loadSpace).toHaveBeenCalledOnce();
    expect(loadSpace).toHaveBeenCalledWith(SPACE_ID);
  });

  it('reuses the live Space session when the runtime reopens the same Space', async () => {
    const loaded = { snapshot: snapshot(), revision: 0n, exportedRevision: null };
    const backend = new MemorySpaceBackend([loaded]);
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
    const startup = startupOver(new MemorySpaceBackend([loaded]));

    const result = await startup.resolve(
      productDestinationPath({ kind: 'graph', spaceId: SPACE_ID, graphId: GRAPH_ID }),
    );

    expect(result.opening?.selection).toBe(LAYOUT_ID);
    expect(result.opening?.graphId).toBe(GRAPH_ID);
  });

  it('opens an exact presentation point with its named View, Graph and Card', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        cards: [
          ...snapshot().cards,
          { id: OTHER_CARD_ID, document: { title: 'Next', kind: 'markdown' as const, body: '' } },
        ],
        document: {
          version: 1 as const,
          title: 'Stored space',
          layouts: [
            {
              id: LAYOUT_ID,
              title: 'Layout',
              kind: 'positioned' as const,
              positions: {
                [CARD_ID]: { x: 0, y: 0, open: false as const },
                [OTHER_CARD_ID]: { x: 320, y: 0, open: false as const },
              },
              graphs: [
                {
                  id: GRAPH_ID,
                  title: 'Graph',
                  edges: [{ from: CARD_ID, to: OTHER_CARD_ID }],
                },
              ],
            },
          ],
        },
      },
      revision: 0n,
      exportedRevision: null,
    };
    const startup = startupOver(new MemorySpaceBackend([loaded]));

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'presentation',
        spaceId: SPACE_ID,
        layoutId: LAYOUT_ID,
        graphId: GRAPH_ID,
        cardId: OTHER_CARD_ID,
      }),
    );

    expect(result.opening?.selection).toBe(LAYOUT_ID);
    expect(result.opening?.graphId).toBe(GRAPH_ID);
    expect(result.opening?.presentationCardId).toBe(OTHER_CARD_ID);
  });

  it('opens a contextual Card in its named Layout without authoring it open', async () => {
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
    const startup = startupOver(new MemorySpaceBackend([loaded]));

    const result = await startup.resolve(
      productDestinationPath({
        kind: 'layout-card',
        spaceId: SPACE_ID,
        layoutId: layoutId,
        cardId: CARD_ID,
      }),
    );

    expect(result.opening?.selection).toBe(layoutId);
    expect(result.opening?.cardId).toBe(CARD_ID);
    expect(
      result.opened.app.currentSpace().lookup.layout(layoutId)?.layout.positions[CARD_ID]?.open,
    ).toBe(false);
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
          defaultLayout: layoutId,
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
    const startup = startupOver(new MemorySpaceBackend([loaded]));

    const result = await startup.resolve(
      productDestinationPath({ kind: 'card', spaceId: SPACE_ID, cardId: omittedId }),
    );

    expect(result.opening?.selection).toBe(layoutId);
    expect(result.opening?.cardId).toBe(omittedId);
    expect(
      result.opened.app.currentSpace().lookup.layout(layoutId)?.layout.positions[omittedId],
    ).toBeUndefined();
  });
});
