import { uuidSchema, type SpaceSnapshot } from '@project/core';
import {
  decodeProblemDetails,
  encodeCommitRequest,
  problemCatalogue,
  type HyperProblemCode,
  type SpaceCommit,
  type SpaceResourceRepository,
} from '@project/persistence';
import { describe, expect, it, vi } from 'vitest';
import { createSpaceHttpApp, MAX_COMMIT_BODY_BYTES } from '@project/http';
import { HTTPException } from 'hono/http-exception';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const TARGET_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};
const loaded = { snapshot, revision: 0n, exportedRevision: null };

const updateCommit = (next = snapshot): SpaceCommit => ({
  changes: [{ kind: 'update', spaceId: SPACE_ID, snapshot: next, expectedRevision: 0n }],
});

const repository = (overrides: Partial<SpaceResourceRepository> = {}): SpaceResourceRepository => ({
  listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: 'One' }]),
  loadSpace: () => Promise.resolve(loaded),
  loadAggregate: () => Promise.resolve({ metaSpaceId: SPACE_ID, spaces: [loaded] }),
  commit: () =>
    Promise.resolve({
      kind: 'committed' as const,
      revisions: [{ spaceId: SPACE_ID, revision: 1n }],
      deletedSpaceIds: [],
    }),
  ...overrides,
});

const expectProblem = async (response: Response, code: HyperProblemCode, detail?: string) => {
  expect(response.status).toBe(problemCatalogue[code].status);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  const decoded = decodeProblemDetails(await response.json());
  if (detail !== undefined) expect(decoded.detail).toBe(detail);
  return decoded;
};

const postCommit = (app: ReturnType<typeof createSpaceHttpApp>, commit = updateCommit()) =>
  app.request('/api/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(encodeCommitRequest(commit)),
  });

const oversizedSnapshot: SpaceSnapshot = {
  ...snapshot,
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'x'.repeat(1_048_576) } }],
};

describe('commit wire policy', () => {
  it.each([
    ['missing media type', undefined, 'Send the request as application/json.'],
    ['non-JSON media type', 'text/plain; charset=utf-8', 'Send the request as application/json.'],
    ['non-UTF-8 charset', 'application/json; charset=utf-16', 'Encode the JSON request as UTF-8.'],
    [
      'duplicate charset',
      'application/json; charset=utf-8; charset=utf-16',
      'Send the request as application/json.',
    ],
    [
      'malformed charset',
      'application/json; charset="utf-8',
      'Send the request as application/json.',
    ],
  ])('rejects %s', async (_name, contentType, detail) => {
    const body = JSON.stringify(encodeCommitRequest(updateCommit()));
    const request: RequestInit =
      contentType === undefined
        ? { method: 'POST', body }
        : { method: 'POST', headers: { 'Content-Type': contentType }, body };
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', request);

    await expectProblem(response, 'unsupported-media-type', detail);
  });

  it('rejects compressed request bodies', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: JSON.stringify(encodeCommitRequest(updateCommit())),
    });

    await expectProblem(
      response,
      'unsupported-media-type',
      'Send the request without content encoding.',
    );
  });

  it.each([
    ['honest', String(MAX_COMMIT_BODY_BYTES + 500)],
    ['understated', '1'],
  ])('rejects a body over 1 MiB with an %s declared length', async (_name, contentLength) => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': contentLength },
      body: JSON.stringify(encodeCommitRequest(updateCommit(oversizedSnapshot))),
    });

    await expectProblem(response, 'payload-too-large');
  });

  it('measures the body rather than trusting an over-declared length', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': '1048577' },
      body: '{}',
    });

    await expectProblem(response, 'invalid-request');
  });

  it('rejects a streamed body over 1 MiB without a declared length', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `{"padding":"${'x'.repeat(1_048_576)}"}`,
    });

    await expectProblem(response, 'payload-too-large');
  });

  it('stops draining a body that keeps arriving past the drain allowance', async () => {
    const chunk = 64 * 1024;
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk;
        controller.enqueue(new Uint8Array(chunk));
      },
    });
    const streamingRequest: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: endless,
      duplex: 'half',
    };
    const response = await createSpaceHttpApp(repository()).request(
      '/api/spaces',
      streamingRequest,
    );

    expect(response.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(MAX_COMMIT_BODY_BYTES * 16);
  });

  it('still answers 413 when the client vanishes mid-drain', async () => {
    let reads = 0;
    const flaky = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads += 1;
        if (reads > 20) {
          controller.error(new Error('client disconnected'));
          return;
        }
        controller.enqueue(new Uint8Array(64 * 1024));
      },
    });
    const streamingRequest: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: flaky,
      duplex: 'half',
    };
    const response = await createSpaceHttpApp(repository()).request(
      '/api/spaces',
      streamingRequest,
    );

    expect(response.status).toBe(413);
  });

  it('accepts a body of exactly the 1 MiB limit', async () => {
    const padded = (length: number): SpaceSnapshot => ({
      ...snapshot,
      cards: [
        { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'x'.repeat(length) } },
      ],
    });
    const overhead = JSON.stringify(encodeCommitRequest(updateCommit(padded(0)))).length;
    const body = JSON.stringify(
      encodeCommitRequest(updateCommit(padded(MAX_COMMIT_BODY_BYTES - overhead))),
    );
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_COMMIT_BODY_BYTES);

    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status).toBe(200);
  });

  it.each([
    'Application/JSON; charset="UTF-8"',
    'application/json ; charset=utf-8',
    'application/json; charset = utf-8',
  ])('normalizes and accepts legal JSON media type %s', async (contentType) => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: JSON.stringify(encodeCommitRequest(updateCommit())),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });
});

describe('Space HTTP reads', () => {
  it('retains collection listing and lazy resource loading', async () => {
    const app = createSpaceHttpApp(repository());

    const collection = await app.request('/api/spaces');
    const resource = await app.request(`/api/spaces/${SPACE_ID}`);

    await expect(collection.json()).resolves.toEqual([{ id: SPACE_ID, title: 'One' }]);
    await expect(resource.json()).resolves.toEqual({
      snapshot,
      revision: '0',
      exportedRevision: null,
    });
    expect(collection.headers.get('cache-control')).toBe('no-store');
    expect(resource.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('loads the complete aggregate from its own resource', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/aggregate');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      metaSpaceId: SPACE_ID,
      spaces: [{ snapshot, revision: '0', exportedRevision: null }],
    });
  });

  it('returns not found for an absent lazy resource', async () => {
    const response = await createSpaceHttpApp(
      repository({ loadSpace: () => Promise.resolve(undefined) }),
    ).request(`/api/spaces/${TARGET_ID}`);

    await expectProblem(response, 'not-found');
  });

  it('hides and logs aggregate repository failures', async () => {
    const failure = new Error('database credentials');
    const logError = vi.fn();
    const response = await createSpaceHttpApp(
      repository({ loadAggregate: () => Promise.reject(failure) }),
      { logError },
    ).request('/api/aggregate');

    await expectProblem(response, 'persistence-unavailable');
    expect(logError).toHaveBeenCalledWith('Failed to load the Space aggregate', failure);
  });

  it('hides and logs collection and lazy-resource repository failures', async () => {
    const failure = new Error('database credentials');
    const logError = vi.fn();
    const app = createSpaceHttpApp(
      repository({
        listSpaces: () => Promise.reject(failure),
        loadSpace: () => Promise.reject(failure),
      }),
      { logError },
    );

    await expectProblem(await app.request('/api/spaces'), 'persistence-unavailable');
    await expectProblem(await app.request(`/api/spaces/${SPACE_ID}`), 'persistence-unavailable');
    expect(logError).toHaveBeenCalledWith('Failed to list spaces', failure);
    expect(logError).toHaveBeenCalledWith(`Failed to load space ${SPACE_ID}`, failure);
  });

  it('contains a failing repository log sink as an internal error', async () => {
    const response = await createSpaceHttpApp(
      repository({ listSpaces: () => Promise.reject(new Error('database')) }),
      {
        logError: () => {
          throw new Error('logger');
        },
      },
    ).request('/api/spaces');

    await expectProblem(response, 'internal-error');
  });

  it('reports repository failures through the default error sink', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('database');

    const response = await createSpaceHttpApp(
      repository({ listSpaces: () => Promise.reject(failure) }),
    ).request('/api/spaces');

    await expectProblem(response, 'persistence-unavailable');
    expect(logged).toHaveBeenCalledWith('Failed to list spaces', failure);
  });
});

describe('Space HTTP aggregate commit', () => {
  it('posts the decoded non-empty change set to the repository', async () => {
    const commit = updateCommit();
    const commitRepository = vi.fn(() =>
      Promise.resolve({
        kind: 'committed' as const,
        revisions: [{ spaceId: SPACE_ID, revision: 7n }],
        deletedSpaceIds: [TARGET_ID],
      }),
    );

    const response = await postCommit(
      createSpaceHttpApp(repository({ commit: commitRepository })),
      commit,
    );

    expect(commitRepository).toHaveBeenCalledWith(commit);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      revisions: [{ spaceId: SPACE_ID, revision: '7' }],
      deletedSpaceIds: [TARGET_ID],
    });
  });

  it('returns every conflict through the persistence codec', async () => {
    const response = await postCommit(
      createSpaceHttpApp(
        repository({
          commit: () =>
            Promise.resolve({
              kind: 'conflict',
              conflicts: [{ spaceId: SPACE_ID, current: loaded }],
            }),
        }),
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      conflicts: [
        {
          spaceId: SPACE_ID,
          current: { snapshot, revision: '0', exportedRevision: null },
        },
      ],
    });
  });

  it('preserves stable aggregate-refusal identity and location fields', async () => {
    const error = {
      kind: 'space-card-target-missing' as const,
      spaceId: SPACE_ID,
      cardId: CARD_ID,
      targetSpaceId: TARGET_ID,
    };
    const response = await postCommit(
      createSpaceHttpApp(
        repository({
          commit: () => Promise.resolve({ kind: 'aggregate-refused', errors: [error] }),
        }),
      ),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ errors: [error] });
  });

  it('maps a rejected commit to request correction', async () => {
    const response = await postCommit(
      createSpaceHttpApp(
        repository({
          commit: () =>
            Promise.resolve({ kind: 'rejected', code: 'invalid-commit', message: 'Duplicate id' }),
        }),
      ),
    );

    const problem = await expectProblem(response, 'invalid-request', 'Duplicate id');
    expect(problem.errors).toEqual([{ code: 'invalid-value', pointer: '' }]);
  });

  it('hides and logs repository failures', async () => {
    const failure = new Error('database host');
    const logError = vi.fn();
    const response = await postCommit(
      createSpaceHttpApp(repository({ commit: () => Promise.reject(failure) }), { logError }),
    );

    await expectProblem(response, 'persistence-unavailable');
    expect(logError).toHaveBeenCalledWith('Failed to commit spaces', failure);
  });
});

describe('Space HTTP commit request policy', () => {
  it.each([
    [{}, 'Send the request as application/json.'],
    [{ 'Content-Type': 'text/plain' }, 'Send the request as application/json.'],
    [
      { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      'Send the request without content encoding.',
    ],
    [{ 'Content-Type': 'application/json; charset=utf-16' }, 'Encode the JSON request as UTF-8.'],
  ])('rejects unsupported request media %#', async (headers, detail) => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers,
      body: JSON.stringify(encodeCommitRequest(updateCommit())),
    });

    await expectProblem(response, 'unsupported-media-type', detail);
  });

  it('rejects an oversized body after measuring arriving bytes', async () => {
    const oversized: SpaceSnapshot = {
      ...snapshot,
      cards: [
        {
          id: CARD_ID,
          document: { title: 'A', kind: 'markdown', body: 'x'.repeat(MAX_COMMIT_BODY_BYTES) },
        },
      ],
    };
    const response = await postCommit(createSpaceHttpApp(repository()), updateCommit(oversized));

    await expectProblem(response, 'payload-too-large');
  });

  it('rejects malformed and empty commit bodies without calling the repository', async () => {
    const commit = vi.fn();
    const app = createSpaceHttpApp(repository({ commit }));
    const responses = await Promise.all(
      ['{', JSON.stringify({ changes: [] })].map(async (body) =>
        app.request('/api/spaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
      ),
    );

    await Promise.all(responses.map((response) => expectProblem(response, 'invalid-request')));
    expect(commit).not.toHaveBeenCalled();
  });

  it('rejects a media-typed request with no body', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    await expectProblem(response, 'invalid-request');
  });
});

describe('Space HTTP method and path policy', () => {
  it.each([
    ['/api/spaces', 'GET, POST'],
    ['/api/aggregate', 'GET'],
    [`/api/spaces/${SPACE_ID}`, 'GET'],
  ])('advertises the methods for %s', async (path, allow) => {
    const response = await createSpaceHttpApp(repository()).request(path, { method: 'DELETE' });

    await expectProblem(response, 'method-not-allowed');
    expect(response.headers.get('allow')).toBe(allow);
  });

  it('refuses the retired PUT resource commit', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(updateCommit())),
    });

    await expectProblem(response, 'method-not-allowed');
    expect(response.headers.get('allow')).toBe('GET');
  });

  it('keeps invalid ids distinct from undeclared paths', async () => {
    const app = createSpaceHttpApp(repository());

    await expectProblem(await app.request('/api/spaces/not-a-uuid'), 'invalid-space-id');
    await expectProblem(await app.request('/api/unknown'), 'not-found');
  });

  it('applies the same path policy to HEAD and unserved methods', async () => {
    const app = createSpaceHttpApp(repository());

    expect((await app.request('/api/spaces', { method: 'HEAD' })).status).toBe(405);
    expect((await app.request('/api/aggregate', { method: 'HEAD' })).status).toBe(405);
    expect((await app.request(`/api/spaces/${SPACE_ID}`, { method: 'HEAD' })).status).toBe(405);
    expect((await app.request('/api/spaces/not-a-uuid', { method: 'DELETE' })).status).toBe(400);
    expect((await app.request('/api/unknown', { method: 'HEAD' })).status).toBe(404);
  });
});

describe('Space HTTP exception containment', () => {
  it.each([
    [400, 'invalid-request'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not-found'],
    [405, 'method-not-allowed'],
    [408, 'request-timeout'],
    [413, 'payload-too-large'],
    [415, 'unsupported-media-type'],
    [422, 'invalid-snapshot'],
    [429, 'rate-limited'],
    [503, 'persistence-unavailable'],
    [418, 'internal-error'],
  ] as const)('maps an HTTP %s exception to %s', async (status, code) => {
    const app = createSpaceHttpApp(repository());
    app.get('/throw-http', () => {
      throw new HTTPException(status, { message: `status ${status}` });
    });

    await expectProblem(await app.request('/throw-http'), code, `status ${status}`);
  });

  it('supplies detail for a message-less HTTP exception', async () => {
    const app = createSpaceHttpApp(repository());
    app.get('/throw-http', () => {
      throw new HTTPException(401);
    });

    await expectProblem(await app.request('/throw-http'), 'unauthorized');
  });

  it('contains a non-HTTP throw even when its log sink also throws', async () => {
    const app = createSpaceHttpApp(repository(), {
      logError: () => {
        throw new Error('logger failed');
      },
    });
    app.get('/throw-value', () => {
      throw new Error('handler failed');
    });

    await expectProblem(await app.request('/throw-value'), 'internal-error');
  });
});
