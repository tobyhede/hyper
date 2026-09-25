import { describe, expect, it, vi } from 'vitest';
import { uuidSchema, type SpaceSnapshot, type UUID } from '@project/core';
import {
  canRetry,
  createSpaceSessionRegistry,
  encodeCommitRequest,
  openSpaceSession,
  type LoadedSpace,
  type SpaceCommit,
  type SpaceSession,
} from '@project/persistence';
import { createSpaceHttpApp, HttpSpaceBackend, MAX_COMMIT_BODY_BYTES } from '@project/http';
import { MemorySpaceRepository } from '../support/memory-space-repository';

/**
 * Code-quality ticket 22 across the HTTP boundary: the browser transport, the
 * Hono application and a real repository behind it. A request over
 * `MAX_COMMIT_BODY_BYTES` is refused as `payload-too-large` with nothing
 * stored; the session keeps the Edits and offers Retry; a request under the
 * limit saves. For a coordinated save the limit is on the whole request.
 */

const META_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const RESOURCE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const MAP_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const GRAPH_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000004');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000010');

const withBody = (body: string): SpaceSnapshot => ({
  id: META_ID,
  document: {
    version: 1,
    title: 'Meta',
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
  resources: [{ id: RESOURCE_ID, document: { title: 'Notes', kind: 'markdown', body } }],
});

const reduced = (space: SpaceSnapshot, body: string): SpaceSnapshot => ({
  ...space,
  resources: space.resources.map((resource) =>
    resource.id === RESOURCE_ID
      ? { ...resource, document: { title: 'Notes', kind: 'markdown', body } }
      : resource,
  ),
});

const bodyOf = (space: SpaceSnapshot): string | undefined => {
  const document = space.resources.find(({ id }) => id === RESOURCE_ID)?.document;
  return document?.kind === 'markdown' ? document.body : undefined;
};

const requestBytes = (request: SpaceCommit): number =>
  new TextEncoder().encode(JSON.stringify(encodeCommitRequest(request))).byteLength;

const update = (snapshot: SpaceSnapshot, expectedRevision: bigint): SpaceCommit => ({
  changes: [{ kind: 'update', spaceId: snapshot.id, snapshot, expectedRevision }],
});

/** A body that makes Meta's own update request exactly `bytes` long. */
const bodyForRequestOf = (bytes: number): string =>
  'x'.repeat(bytes - requestBytes(update(withBody(''), 3n)));

const overHttp = (stored: LoadedSpace) => {
  const repository = new MemorySpaceRepository([stored], META_ID);
  const app = createSpaceHttpApp(repository);
  const posted: number[] = [];
  const backend = new HttpSpaceBackend('http://hyper.test', {
    fetch: async (input, init) => {
      const request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(new URL(String(input), 'http://hyper.test'), init);
      if (request.method === 'POST') posted.push((await request.clone().arrayBuffer()).byteLength);
      return app.fetch(request);
    },
  });
  return { repository, backend, posted };
};

const settles = (session: SpaceSession, kind: string) =>
  vi.waitFor(() => expect(session.getState().persistence.kind).toBe(kind));

describe('A save over the request size limit, across the HTTP boundary', () => {
  it('refuses an oversized candidate with nothing stored, and stores one under the limit', async () => {
    const stored: LoadedSpace = { snapshot: withBody(''), revision: 3n, exportedRevision: null };
    const { repository, backend, posted } = overHttp(stored);
    const over = withBody(bodyForRequestOf(MAX_COMMIT_BODY_BYTES + 1));

    await expect(backend.commit(update(over, 3n))).resolves.toEqual({
      kind: 'permanent-failure',
      code: 'payload-too-large',
    });
    expect(posted).toEqual([MAX_COMMIT_BODY_BYTES + 1]);
    await expect(repository.loadSpace(META_ID)).resolves.toEqual(stored);

    const under = withBody(bodyForRequestOf(MAX_COMMIT_BODY_BYTES));
    await expect(backend.commit(update(under, 3n))).resolves.toEqual({
      kind: 'committed',
      revisions: [{ spaceId: META_ID, revision: 4n }],
      deletedSpaceIds: [],
    });
    expect(posted[1]).toBe(MAX_COMMIT_BODY_BYTES);
    const saved = await repository.loadSpace(META_ID);
    expect(saved?.revision).toBe(4n);
    expect(saved === undefined ? undefined : bodyOf(saved.snapshot)).toBe(bodyOf(under));
  });

  it('keeps the Edits through a Retry still over the limit, and saves a reduction', async () => {
    const stored: LoadedSpace = { snapshot: withBody(''), revision: 3n, exportedRevision: null };
    const { repository, backend } = overHttp(stored);
    const session = openSpaceSession(backend, stored);
    const tooLong = bodyForRequestOf(MAX_COMMIT_BODY_BYTES + 100);

    session.submit(withBody(tooLong));
    await settles(session, 'rejected');
    expect(session.getState().persistence).toEqual({
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'payload-too-large' },
    });
    expect(canRetry(session.getState().persistence)).toBe(true);

    session.retry();
    expect(session.getState().persistence.kind).toBe('pending');
    await settles(session, 'rejected');
    expect(bodyOf(session.getState().working)).toBe(tooLong);

    // Short by less than the excess: still over, still refused, still kept.
    session.submit(reduced(session.getState().working, tooLong.slice(50)));
    await settles(session, 'rejected');
    expect(canRetry(session.getState().persistence)).toBe(true);
    expect(bodyOf(session.getState().working)).toBe(tooLong.slice(50));
    await expect(repository.loadSpace(META_ID)).resolves.toEqual(stored);

    session.submit(reduced(session.getState().working, tooLong.slice(200)));
    await settles(session, 'settled');
    const saved = await repository.loadSpace(META_ID);
    expect(saved?.revision).toBe(4n);
    expect(saved === undefined ? undefined : bodyOf(saved.snapshot)).toBe(tooLong.slice(200));
  });

  it('limits a coordinated save by its whole request, not by any one Space', async () => {
    // Meta's own update request sits 256 bytes under the limit, so Meta saves
    // alone; creating a Space Resource carries the new Space in the same request.
    const large = withBody(bodyForRequestOf(MAX_COMMIT_BODY_BYTES - 256));
    const stored: LoadedSpace = { snapshot: large, revision: 3n, exportedRevision: null };
    const { repository, backend, posted } = overHttp(stored);
    const registry = createSpaceSessionRegistry(backend);
    const meta = registry.open(stored);

    meta.submit({ ...large, document: { ...large.document, title: 'Meta alone' } });
    await settles(meta, 'settled');
    expect(meta.getState().acknowledgedRevision).toBe(4n);

    const ids: UUID[] = [
      TARGET_ID,
      uuidSchema.parse('00000000-0000-4000-8000-000000000011'),
      uuidSchema.parse('00000000-0000-4000-8000-000000000012'),
      uuidSchema.parse('00000000-0000-4000-8000-000000000013'),
      uuidSchema.parse('00000000-0000-4000-8000-000000000014'),
    ];
    const lifecycle = registry.spaceResources(() => {
      const id = ids.shift();
      if (id === undefined) throw new Error('test identity source was exhausted');
      return id;
    });
    await lifecycle.create({
      containingSpaceId: META_ID,
      mapId: MAP_ID,
      title: 'Architecture',
      position: { x: 240, y: 0 },
    });
    await settles(meta, 'rejected');
    const target = registry.session(TARGET_ID);
    const tooLarge = {
      kind: 'rejected',
      failure: { kind: 'permanent-failure', code: 'payload-too-large' },
    };
    expect(meta.getState().persistence).toEqual(tooLarge);
    expect(target?.getState().persistence).toEqual(tooLarge);
    expect(posted[1]).toBeGreaterThan(MAX_COMMIT_BODY_BYTES);

    meta.retry();
    await registry.waitUntilRetirable(META_ID);
    expect(posted).toHaveLength(3);
    expect(meta.getState().persistence).toEqual(tooLarge);
    await expect(repository.loadSpace(TARGET_ID)).resolves.toBeUndefined();
    await expect(repository.loadSpace(META_ID)).resolves.toMatchObject({ revision: 4n });

    const body = bodyOf(meta.getState().working) ?? '';
    meta.submit(reduced(meta.getState().working, body.slice(4096)));
    await settles(meta, 'settled');
    expect(target?.getState().persistence.kind).toBe('settled');
    expect(posted[3]).toBeLessThanOrEqual(MAX_COMMIT_BODY_BYTES);
    await expect(repository.loadSpace(TARGET_ID)).resolves.toMatchObject({ revision: 0n });
    const saved = await repository.loadSpace(META_ID);
    expect(saved?.revision).toBe(5n);
    expect(saved === undefined ? undefined : bodyOf(saved.snapshot)).toBe(body.slice(4096));
  });
});
