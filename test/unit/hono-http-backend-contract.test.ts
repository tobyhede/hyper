import { describe, expect, it } from 'vitest';
import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { MemorySpaceBackend, type LoadedSpace } from '@project/persistence';
import { spaceBackendContract } from '../../packages/persistence/test/backend-contract';
import { createSpaceHttpApp, HttpSpaceBackend, type SpaceResourceRepository } from '@project/http';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 2, title: 'One', routes: [] },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};
const loaded: LoadedSpace = { snapshot, revision: 4n, exportedRevision: 3n };

const repository = (overrides: Partial<SpaceResourceRepository> = {}): SpaceResourceRepository => ({
  listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: 'One' }]),
  loadSpace: () => Promise.resolve(undefined),
  commitSpace: () => Promise.resolve({ kind: 'committed', revision: 1n }),
  ...overrides,
});

const appFetch =
  (app: ReturnType<typeof createSpaceHttpApp>): typeof globalThis.fetch =>
  (input, init) => {
    const target = input instanceof Request ? input.url : input;
    return Promise.resolve(app.fetch(new Request(new URL(target, 'http://hyper.test'), init)));
  };

spaceBackendContract('Hono HttpSpaceBackend', (initial) => {
  const memory = new MemorySpaceBackend(initial);
  const app = createSpaceHttpApp({
    listSpaces: () => memory.listSpaces(),
    loadSpace: (id) => memory.loadSpace(id),
    commitSpace: async (nextSnapshot, expectedRevision) => {
      const result = await memory.commitSpace(nextSnapshot, expectedRevision);
      if (result.kind === 'committed' || result.kind === 'conflict') return result;
      return {
        kind: 'rejected',
        code: result.code === 'not-found' ? 'not-found' : 'invalid-snapshot',
        message: result.message,
      };
    },
  });
  return Promise.resolve({
    backend: new HttpSpaceBackend('http://hyper.test', { fetch: appFetch(app) }),
    close: () => Promise.resolve(),
  });
});

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

  it('commits through the typed Hono application contract', async () => {
    const app = createSpaceHttpApp(
      repository({ commitSpace: () => Promise.resolve({ kind: 'committed', revision: 5n }) }),
    );
    const backend = new HttpSpaceBackend('http://hyper.test', { fetch: appFetch(app) });

    await expect(backend.commitSpace(snapshot, 4n)).resolves.toEqual({
      kind: 'committed',
      revision: 5n,
    });
  });
});
