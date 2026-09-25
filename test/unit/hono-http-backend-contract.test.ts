import { describe, expect, it } from 'vitest';
import { uuidSchema } from '@project/core';
import {
  encodeCommitRequest,
  type LoadedSpace,
  type StoredSpaceRepository,
} from '@project/persistence';
import { spaceBackendContract } from '@project/persistence/test-support';
import { createSpaceHttpApp, HttpSpaceBackend } from '@project/http';
import { MemorySpaceRepository } from '../support/memory-space-repository';
import { RESOURCE_ID, SPACE_ID, oneResourceSnapshot as snapshot } from '../support/space-fixtures';

const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000005');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000006');

const loaded: LoadedSpace = {
  snapshot: {
    ...snapshot,
    document: {
      ...snapshot.document,
      defaultMap: MAP_ID,
      maps: [
        {
          id: MAP_ID,
          title: 'Map 1',
          kind: 'positioned',
          positions: { [RESOURCE_ID]: { x: 0, y: 0, open: false } },
          graphs: [{ id: GRAPH_ID, title: 'Graph 1', edges: [] }],
          activeGraph: GRAPH_ID,
        },
      ],
    },
  },
  revision: 4n,
  exportedRevision: 3n,
};

const repository = (overrides: Partial<StoredSpaceRepository> = {}): StoredSpaceRepository => ({
  listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: 'One' }]),
  loadSpace: () => Promise.resolve(undefined),
  loadAggregate: () =>
    Promise.resolve({ kind: 'loaded', aggregate: { metaSpaceId: SPACE_ID, spaces: [] } }),
  commit: () =>
    Promise.resolve({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 1n }],
      deletedSpaceIds: [],
    }),
  ...overrides,
});

/*
 * Only the string form needs a base: a Request's URL is absolute by
 * construction, so rebasing it is unnecessary, while `new Request(relative)`
 * throws outright. Rebuilding a Request from its URL alone drops the method,
 * headers and body with it, which is why the clone-with-init form is used
 * instead of re-reading `input.url`.
 */
const appFetch =
  (app: ReturnType<typeof createSpaceHttpApp>): typeof globalThis.fetch =>
  (input, init) =>
    Promise.resolve(
      app.fetch(
        input instanceof Request
          ? new Request(input, init)
          : new Request(new URL(String(input), 'http://hyper.test'), init),
      ),
    );

/**
 * The application is composed over a real `SpaceRepository`, which is what it is
 * given in every runtime, rather than a browser-side backend adapted to the
 * repository's shape: that would exercise the HTTP path through a mapping no
 * production code performs.
 *
 * The contract names the Meta identity it seeds under, which is what lets
 * `MemorySpaceRepository`'s overloads be satisfied honestly rather than by
 * reading it off the first element.
 */
spaceBackendContract('Hono HttpSpaceBackend', ({ spaces, metaSpaceId }) =>
  Promise.resolve({
    backend: new HttpSpaceBackend('http://hyper.test', {
      fetch: appFetch(createSpaceHttpApp(new MemorySpaceRepository(spaces, metaSpaceId))),
    }),
    close: () => Promise.resolve(),
  }),
);

describe('HttpSpaceBackend', () => {
  it('lists spaces through the typed Hono application contract', async () => {
    const app = createSpaceHttpApp(repository());
    const backend = new HttpSpaceBackend('http://hyper.test', { fetch: appFetch(app) });

    await expect(backend.listSpaces()).resolves.toEqual([{ id: SPACE_ID, title: 'One' }]);
  });

  it('loads a space through the typed Hono application contract', async () => {
    const app = createSpaceHttpApp(repository({ loadSpace: () => Promise.resolve(loaded) }));
    const backend = new HttpSpaceBackend('http://hyper.test', { fetch: appFetch(app) });

    await expect(backend.loadSpace(SPACE_ID)).resolves.toEqual(loaded);
  });

  // The helper is declared `typeof globalThis.fetch`, so it promises to accept a
  // Request. Reading only its URL would silently degrade every such call to a
  // bodyless GET — the contract suite above would still pass while proving
  // nothing about the commit path. Hono's client sends a URL and an init today;
  // that is its choice to change, not a guarantee this harness may rely on.
  it('preserves a Request input through the application boundary', async () => {
    const app = createSpaceHttpApp(
      repository({
        commit: () =>
          Promise.resolve({
            kind: 'committed',
            revisions: [{ spaceId: SPACE_ID, revision: 7n }],
            deletedSpaceIds: [],
          }),
      }),
    );

    const response = await appFetch(app)(
      new Request('http://hyper.test/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          encodeCommitRequest({
            changes: [
              {
                kind: 'update',
                spaceId: SPACE_ID,
                snapshot,
                expectedRevision: 4n,
              },
            ],
          }),
        ),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      revisions: [{ spaceId: SPACE_ID, revision: '7' }],
      deletedSpaceIds: [],
    });
  });

  it('commits through the typed Hono application contract', async () => {
    const app = createSpaceHttpApp(
      repository({
        commit: () =>
          Promise.resolve({
            kind: 'committed',
            revisions: [{ spaceId: SPACE_ID, revision: 5n }],
            deletedSpaceIds: [],
          }),
      }),
    );
    const backend = new HttpSpaceBackend('http://hyper.test', { fetch: appFetch(app) });

    await expect(
      backend.commit({
        changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot, expectedRevision: 4n }],
      }),
    ).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: SPACE_ID, revision: 5n }],
      deletedSpaceIds: [],
    });
  });
});
