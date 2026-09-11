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
const THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_THING_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const DIAGRAM_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const snapshot = (id = SPACE_ID, thingId = THING_ID, title = 'Stored space'): SpaceSnapshot => ({
  id,
  document: { version: 1, title },
  things: [
    { id: thingId, document: { title: 'Start here', kind: 'markdown', body: 'Stored body' } },
  ],
});

const metaReferencingOther = (): SpaceSnapshot => ({
  id: SPACE_ID,
  document: { version: 1, title: 'Stored space' },
  things: [
    {
      id: THING_ID,
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
  it('initializes a diagramless Space through an injected memory backend before opening it', async () => {
    const backend = new MemorySpaceBackend([
      { snapshot: snapshot(), revision: 0n, exportedRevision: null },
    ]);
    const ids = [DIAGRAM_ID, GRAPH_ID];
    const startup = startupOver(backend, () => {
      const id = ids.shift();
      if (id === undefined) throw new Error('initializer minted too many identities');
      return id;
    });

    const result = await startup.resolve(
      productDestinationPath({ kind: 'space', spaceId: SPACE_ID }),
    );

    expect(result.opened.initialization).toBe('created-diagram');
    expect(result.opened.session.getState().acknowledgedRevision).toBe(1n);
    expect(result.opened.app.currentSpace().lookup.diagram(DIAGRAM_ID)?.diagram.positions).toEqual(
      {},
    );
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
      snapshot(OTHER_SPACE_ID, OTHER_THING_ID, 'Other space'),
    );

    await expect(
      startup.resolve(productDestinationPath({ kind: 'space', spaceId: SPACE_ID })),
    ).rejects.toThrow('The product URL does not resolve.');
  });

  it('opens the exact named Space when several are stored', async () => {
    const startup = startupFor(
      SPACE_ID,
      metaReferencingOther(),
      snapshot(OTHER_SPACE_ID, OTHER_THING_ID, 'Other space'),
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

  it('opens a resolved Diagram from one backend load', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          defaultDiagram: DIAGRAM_ID,
          diagrams: [
            {
              id: DIAGRAM_ID,
              title: 'Diagram 1',
              kind: 'positioned' as const,
              positions: { [THING_ID]: { x: 0, y: 0, open: false as const } },
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
        kind: 'diagram',
        spaceId: SPACE_ID,
        diagramId: DIAGRAM_ID,
      }),
    );

    expect(result.opening?.selection).toBe(DIAGRAM_ID);
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

  it('opens a canonical Graph in its owning Diagram as navigation context', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          diagrams: [
            {
              id: DIAGRAM_ID,
              title: 'Diagram',
              kind: 'positioned' as const,
              positions: { [THING_ID]: { x: 0, y: 0, open: false as const } },
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

    expect(result.opening?.selection).toBe(DIAGRAM_ID);
    expect(result.opening?.graphId).toBe(GRAPH_ID);
  });

  it('opens an exact presentation point with its named View, Graph and Thing', async () => {
    const loaded = {
      snapshot: {
        ...snapshot(),
        things: [
          ...snapshot().things,
          { id: OTHER_THING_ID, document: { title: 'Next', kind: 'markdown' as const, body: '' } },
        ],
        document: {
          version: 1 as const,
          title: 'Stored space',
          diagrams: [
            {
              id: DIAGRAM_ID,
              title: 'Diagram',
              kind: 'positioned' as const,
              positions: {
                [THING_ID]: { x: 0, y: 0, open: false as const },
                [OTHER_THING_ID]: { x: 320, y: 0, open: false as const },
              },
              graphs: [
                {
                  id: GRAPH_ID,
                  title: 'Graph',
                  edges: [{ from: THING_ID, to: OTHER_THING_ID }],
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
        diagramId: DIAGRAM_ID,
        graphId: GRAPH_ID,
        thingId: OTHER_THING_ID,
      }),
    );

    expect(result.opening?.selection).toBe(DIAGRAM_ID);
    expect(result.opening?.graphId).toBe(GRAPH_ID);
    expect(result.opening?.presentationThingId).toBe(OTHER_THING_ID);
  });

  it('opens a contextual Thing in its named Diagram without authoring it open', async () => {
    const diagramId = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          diagrams: [
            {
              id: diagramId,
              title: 'Diagram',
              kind: 'positioned' as const,
              positions: { [THING_ID]: { x: 0, y: 0, open: false as const } },
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
        kind: 'diagram-thing',
        spaceId: SPACE_ID,
        diagramId: diagramId,
        thingId: THING_ID,
      }),
    );

    expect(result.opening?.selection).toBe(diagramId);
    expect(result.opening?.thingId).toBe(THING_ID);
    expect(
      result.opened.app.currentSpace().lookup.diagram(diagramId)?.diagram.positions[THING_ID]?.open,
    ).toBe(false);
  });

  it('reveals a canonical Thing omitted by the default Diagram in the Things collection', async () => {
    const diagramId = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
    const omittedId = uuidSchema.parse('00000000-0000-4000-8000-000000000007');
    const loaded = {
      snapshot: {
        ...snapshot(),
        document: {
          version: 1 as const,
          title: 'Stored space',
          defaultDiagram: diagramId,
          diagrams: [
            {
              id: diagramId,
              title: 'Diagram',
              kind: 'positioned' as const,
              positions: { [THING_ID]: { x: 0, y: 0, open: false as const } },
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
        things: [
          ...snapshot().things,
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
      productDestinationPath({ kind: 'thing', spaceId: SPACE_ID, thingId: omittedId }),
    );

    expect(result.opening?.selection).toBe(diagramId);
    expect(result.opening?.thingId).toBe(omittedId);
    expect(
      result.opened.app.currentSpace().lookup.diagram(diagramId)?.diagram.positions[omittedId],
    ).toBeUndefined();
  });
});
