import { describe, expect, it } from 'vitest';
import { encodeCommitRequest, MemorySpaceBackend, type LoadedSpace } from '@project/persistence';
import { spaceBackendContract } from '@project/persistence/test-support';
import { createSpaceHttpApp, HttpSpaceBackend, type SpaceResourceRepository } from '@project/http';
import { SPACE_ID, oneCardSnapshot as snapshot } from '../support/space-fixtures';

const loaded: LoadedSpace = { snapshot, revision: 4n, exportedRevision: 3n };

const repository = (overrides: Partial<SpaceResourceRepository> = {}): SpaceResourceRepository => ({
  listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: 'One' }]),
  loadSpace: () => Promise.resolve(undefined),
  commitSpace: () => Promise.resolve({ kind: 'committed', revision: 1n }),
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

spaceBackendContract('Hono HttpSpaceBackend', (initial) => {
  const memory = new MemorySpaceBackend(initial);
  const app = createSpaceHttpApp({
    listSpaces: () => memory.listSpaces(),
    loadSpace: (id) => memory.loadSpace(id),
    commitSpace: async (nextSnapshot, expectedRevision) => {
      const result = await memory.commitSpace(nextSnapshot, expectedRevision);
      if (result.kind === 'committed' || result.kind === 'conflict') return result;
      // `SpaceResourceRepository` declares two rejection codes; `CommitResult`
      // carries eight. Collapsing the rest into `invalid-snapshot` would let a
      // transport or authorization failure reach the contract disguised as a
      // domain rejection, and the assertions downstream would still pass.
      if (result.code !== 'not-found' && result.code !== 'invalid-snapshot') {
        throw new Error(`Unmapped commitSpace failure in contract harness: ${result.code}`);
      }
      return { kind: 'rejected', code: result.code, message: result.message };
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

  // The helper is declared `typeof globalThis.fetch`, so it promises to accept a
  // Request. Reading only its URL would silently degrade every such call to a
  // bodyless GET — the contract suite above would still pass while proving
  // nothing about the commit path. Hono's client sends a URL and an init today;
  // that is its choice to change, not a guarantee this harness may rely on.
  it('preserves a Request input through the application boundary', async () => {
    const app = createSpaceHttpApp(
      repository({ commitSpace: () => Promise.resolve({ kind: 'committed', revision: 7n }) }),
    );

    const response = await appFetch(app)(
      new Request(`http://hyper.test/api/spaces/${SPACE_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encodeCommitRequest(snapshot, 4n)),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revision: '7' });
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
