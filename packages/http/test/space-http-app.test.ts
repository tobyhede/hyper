import { uuidSchema, type SpaceSnapshot } from '@project/core';
import { encodeCommitRequest } from '@project/persistence';
import { describe, expect, it } from 'vitest';
import { createSpaceHttpApp, type SpaceResourceRepository } from '@project/http';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 2, title: 'One', routes: [] },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};

const repository = (overrides: Partial<SpaceResourceRepository> = {}): SpaceResourceRepository => ({
  listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: 'One' }]),
  loadSpace: () => Promise.resolve({ snapshot, revision: 0n, exportedRevision: null }),
  commitSpace: () => Promise.resolve({ kind: 'committed' as const, revision: 1n }),
  ...overrides,
});

describe('Space HTTP application', () => {
  it('lists spaces as non-cacheable UTF-8 JSON', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual([{ id: SPACE_ID, title: 'One' }]);
  });

  it('hides and logs a repository failure while listing spaces', async () => {
    const failure = new Error('database credentials leaked');
    const logged: unknown[] = [];
    const app = createSpaceHttpApp(repository({ listSpaces: () => Promise.reject(failure) }), {
      logError: (message, error) => logged.push(message, error),
    });

    const response = await app.request('/api/spaces');

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ message: 'Persistence service unavailable' });
    expect(logged).toEqual(['Failed to list spaces', failure]);
  });

  it('loads a space with decimal revisions on the wire', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      snapshot,
      revision: '0',
      exportedRevision: null,
    });
  });

  it('reports an absent space while loading', async () => {
    const response = await createSpaceHttpApp(
      repository({ loadSpace: () => Promise.resolve(undefined) }),
    ).request(`/api/spaces/${OTHER_SPACE_ID}`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: `Space ${OTHER_SPACE_ID} does not exist`,
    });
  });

  it('hides and logs a repository failure while loading a space', async () => {
    const failure = new Error('connection string leaked');
    const logged: unknown[] = [];
    const app = createSpaceHttpApp(repository({ loadSpace: () => Promise.reject(failure) }), {
      logError: (message, error) => logged.push(message, error),
    });

    const response = await app.request(`/api/spaces/${SPACE_ID}`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Persistence service unavailable' });
    expect(logged).toEqual([`Failed to load space ${SPACE_ID}`, failure]);
  });

  it('commits a complete snapshot at the expected revision', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'Application/JSON; charset="UTF-8"',
        'Content-Encoding': 'identity',
      },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revision: '1' });
  });

  it('returns the current stored space when a commit conflicts', async () => {
    const current = { snapshot, revision: 7n, exportedRevision: 4n };
    const response = await createSpaceHttpApp(
      repository({ commitSpace: () => Promise.resolve({ kind: 'conflict', current }) }),
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 6n)),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      snapshot,
      revision: '7',
      exportedRevision: '4',
    });
  });

  it('reports an inadmissible snapshot as an unprocessable commit', async () => {
    const response = await createSpaceHttpApp(
      repository({
        commitSpace: () =>
          Promise.resolve({
            kind: 'rejected',
            code: 'invalid-snapshot',
            message: 'Route names an absent card',
          }),
      }),
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ message: 'Route names an absent card' });
  });

  it('reports an absent space while committing', async () => {
    const message = `Space ${SPACE_ID} does not exist`;
    const response = await createSpaceHttpApp(
      repository({
        commitSpace: () => Promise.resolve({ kind: 'rejected', code: 'not-found', message }),
      }),
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message });
  });

  it('hides and logs a repository failure while committing a space', async () => {
    const failure = new Error('database host leaked');
    const logged: unknown[] = [];
    const response = await createSpaceHttpApp(
      repository({ commitSpace: () => Promise.reject(failure) }),
      { logError: (message, error) => logged.push(message, error) },
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Persistence service unavailable' });
    expect(logged).toEqual([`Failed to commit space ${SPACE_ID}`, failure]);
  });

  it('rejects a commit without a JSON media type', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'Content-Type must be application/json',
    });
  });

  it('rejects a non-JSON media type', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'Content-Type must be application/json',
    });
  });

  it('rejects a JSON charset other than UTF-8', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-16' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'JSON charset must be UTF-8',
    });
  });

  it('rejects duplicate charset parameters', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8; charset=utf-16',
      },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'Content-Type must be application/json',
    });
  });

  it('rejects a malformed charset parameter', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset="utf-8' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'Content-Type must be application/json',
    });
  });

  it('rejects compressed request bodies', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({
      message: 'Content-Encoding must be identity',
    });
  });

  it('rejects a declared body over 1 MiB', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '1048577',
      },
      body: '{}',
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: 'Request body exceeds 1048576 bytes',
    });
  });

  it('rejects a streamed body over 1 MiB without a declared length', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: `{"padding":"${'x'.repeat(1_048_576)}"}`,
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: 'Request body exceeds 1048576 bytes',
    });
  });

  it('rejects an actual body over 1 MiB when its declared length is understated', async () => {
    let commitCalls = 0;
    const oversizedSnapshot: SpaceSnapshot = {
      ...snapshot,
      cards: [
        {
          id: CARD_ID,
          document: { title: 'A', kind: 'markdown', body: 'x'.repeat(1_048_576) },
        },
      ],
    };
    const response = await createSpaceHttpApp(
      repository({
        commitSpace: () => {
          commitCalls += 1;
          return Promise.resolve({ kind: 'committed', revision: 1n });
        },
      }),
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '1',
      },
      body: JSON.stringify(encodeCommitRequest(oversizedSnapshot, 0n)),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: 'Request body exceeds 1048576 bytes',
    });
    expect(commitCalls).toBe(0);
  });

  it('rejects an invalid path identity before inspecting the request body', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '1048577',
      },
      body: '{}',
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: 'Space id must be a UUID' });
  });

  it('rejects a path and snapshot identity mismatch before repository access', async () => {
    const response = await createSpaceHttpApp(
      repository({ commitSpace: () => Promise.reject(new Error('must not be reached')) }),
    ).request(`/api/spaces/${OTHER_SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: 'Path id must match snapshot id' });
  });

  it('returns JSON when the request body is malformed JSON', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    await expect(response.json()).resolves.toEqual({ message: 'Malformed JSON in request body' });
  });

  it.each([
    ['an array envelope', []],
    [
      'an unexpected envelope field',
      { ...(encodeCommitRequest(snapshot, 0n) as object), extra: true },
    ],
    ['a noncanonical revision', { snapshot, expectedRevision: '01' }],
    [
      'a schema-invalid snapshot',
      {
        snapshot: { ...snapshot, document: { ...snapshot.document, title: '' } },
        expectedRevision: '0',
      },
    ],
  ])('rejects %s as an invalid request', async (_name, body) => {
    const response = await createSpaceHttpApp(
      repository({ commitSpace: () => Promise.reject(new Error('must not be reached')) }),
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('advertises the methods supported by a space resource', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'POST',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, PUT');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('advertises that the space collection is read-only', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });

  it('does not add implicit HEAD resources outside the declared contract', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'HEAD',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });

  // `c.notFound()` inside the handler installed by `app.notFound()` calls that
  // same handler — Hono seeds the Context's not-found handler from the app's —
  // so it recurses until the stack blows. Every path off the declared contract
  // reached it, including the trailing slash a browser address bar produces.
  it.each(['/', '/api', '/api/spaces/', '/index.html', '/api/spaces/one/two'])(
    'answers %s outside the declared contract without recursing',
    async (path) => {
      const response = await createSpaceHttpApp(repository()).request(path);

      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      await expect(response.json()).resolves.toEqual({ message: 'Not found' });
    },
  );

  // Hono does not turn a rethrow from `onError` into a 500: it re-invokes the
  // custom handler and lets the throw escape, so `app.fetch()` returns a
  // rejected promise. A host without a `.catch` then has an unhandled rejection
  // rather than a response, and Node 24 defaults to killing the process.
  it('answers an unexpected failure with a response rather than a rejection', async () => {
    const app = createSpaceHttpApp(
      repository({ listSpaces: () => Promise.reject(new Error('database is down')) }),
      {
        logError: () => {
          throw new Error('log sink is down');
        },
      },
    );

    const response = await app.request('/api/spaces');

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ message: 'Internal server error' });
  });

  // Hono's own json validator applies a stricter Content-Type regex than this
  // module's media policy, and when it disagrees it does not parse the body and
  // hands the validator `{}` — surfacing as a 400 about fields, for a body that
  // was never read. One policy has to decide, so the media guard rewrites the
  // header it has already validated.
  it.each([
    ['optional whitespace before the parameter separator', 'application/json ; charset=utf-8'],
    ['whitespace around the parameter equals', 'application/json; charset = utf-8'],
    ['an underscore in a parameter name', 'application/json; x_1=2'],
    ['a quoted parameter containing a separator', 'application/json; foo="a;b"'],
  ])('commits a request whose media type carries %s', async (_name, contentType) => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revision: '1' });
  });
});
