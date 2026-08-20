import { uuidSchema, type SpaceSnapshot } from '@project/core';
import {
  decodeProblemDetails,
  encodeCommitRequest,
  problemCatalogue,
  type HyperProblemCode,
  type SpaceResourceRepository,
} from '@project/persistence';
import { HTTPException } from 'hono/http-exception';
import { describe, expect, it, vi } from 'vitest';
import { createSpaceHttpApp, MAX_COMMIT_BODY_BYTES } from '@project/http';

const SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000001');
const CARD_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000002');
const OTHER_SPACE_ID = uuidSchema.parse('00000000-0000-4000-8000-000000000003');
const snapshot: SpaceSnapshot = {
  id: SPACE_ID,
  document: { version: 1, title: 'One' },
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: '' } }],
};

/** A snapshot whose serialized commit request is comfortably over the 1 MiB cap. */
const oversizedSnapshot: SpaceSnapshot = {
  ...snapshot,
  cards: [{ id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'x'.repeat(1_048_576) } }],
};

const repository = (overrides: Partial<SpaceResourceRepository> = {}): SpaceResourceRepository => ({
  listSpaces: () => Promise.resolve([{ id: SPACE_ID, title: 'One' }]),
  loadSpace: () => Promise.resolve({ snapshot, revision: 0n, exportedRevision: null }),
  commitSpace: () => Promise.resolve({ kind: 'committed' as const, revision: 1n }),
  ...overrides,
});

const expectProblem = async (response: Response, code: HyperProblemCode, detail?: string) => {
  expect(response.status).toBe(problemCatalogue[code].status);
  expect(response.headers.get('content-type')).toBe('application/problem+json');
  const decoded = decodeProblemDetails(await response.json());
  expect(decoded.type).toBe(problemCatalogue[code].type);
  expect(decoded.title).toBe(problemCatalogue[code].title);
  if (detail !== undefined) expect(decoded.detail).toBe(detail);
  return decoded;
};

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

    expect(response.headers.get('cache-control')).toBe('no-store');
    await expectProblem(response, 'persistence-unavailable', 'Try the request again later.');
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

    await expectProblem(
      response,
      'not-found',
      `Choose a Space that exists; Space ${OTHER_SPACE_ID} does not.`,
    );
  });

  it('hides and logs a repository failure while loading a space', async () => {
    const failure = new Error('connection string leaked');
    const logged: unknown[] = [];
    const app = createSpaceHttpApp(repository({ loadSpace: () => Promise.reject(failure) }), {
      logError: (message, error) => logged.push(message, error),
    });

    const response = await app.request(`/api/spaces/${SPACE_ID}`);

    await expectProblem(response, 'persistence-unavailable', 'Try the request again later.');
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
            message: 'Graph names an absent card',
          }),
      }),
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    const problem = await expectProblem(
      response,
      'invalid-snapshot',
      'Correct the snapshot: Graph names an absent card',
    );
    expect(problem.errors).toEqual([{ code: 'invalid-value', pointer: '/snapshot' }]);
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

    await expectProblem(response, 'not-found', `Choose a Space that exists; ${message}`);
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

    await expectProblem(response, 'persistence-unavailable', 'Try the request again later.');
    expect(logged).toEqual([`Failed to commit space ${SPACE_ID}`, failure]);
  });

  it('returns service unavailable when failure logging itself throws a non-Error', async () => {
    const failure = new Error('repository failure');
    const options = {
      logError: () => {
        // JavaScript callers can violate the TypeScript convention; that is the regression case.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'logger failure';
      },
    };
    const responses = await Promise.all([
      createSpaceHttpApp(
        repository({ listSpaces: () => Promise.reject(failure) }),
        options,
      ).request('/api/spaces'),
      createSpaceHttpApp(repository({ loadSpace: () => Promise.reject(failure) }), options).request(
        `/api/spaces/${SPACE_ID}`,
      ),
      createSpaceHttpApp(
        repository({ commitSpace: () => Promise.reject(failure) }),
        options,
      ).request(`/api/spaces/${SPACE_ID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
      }),
    ]);

    await Promise.all(
      responses.map((response) =>
        expectProblem(response, 'persistence-unavailable', 'Try the request again later.'),
      ),
    );
  });

  it('rejects a commit without a JSON media type', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    await expectProblem(
      response,
      'unsupported-media-type',
      'Send the request as application/json.',
    );
  });

  it('rejects a non-JSON media type', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    await expectProblem(
      response,
      'unsupported-media-type',
      'Send the request as application/json.',
    );
  });

  it('rejects a JSON charset other than UTF-8', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset=utf-16' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    await expectProblem(response, 'unsupported-media-type', 'Encode the JSON request as UTF-8.');
  });

  it('rejects duplicate charset parameters', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8; charset=utf-16',
      },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    await expectProblem(
      response,
      'unsupported-media-type',
      'Send the request as application/json.',
    );
  });

  it('rejects a malformed charset parameter', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json; charset="utf-8' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    await expectProblem(
      response,
      'unsupported-media-type',
      'Send the request as application/json.',
    );
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

    await expectProblem(
      response,
      'unsupported-media-type',
      'Send the request without content encoding.',
    );
  });

  /*
   * One size policy: what arrives is counted, and `Content-Length` is never
   * trusted. `bodyLimit` returns without reading a byte when it believes the
   * header, so the header is deleted before it runs — that deletion is the
   * load-bearing half. The three cases below are the same cap seen through
   * every declaration a client might send.
   */
  it('measures the body rather than trusting an over-declared length', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': '1048577',
      },
      body: '{}',
    });

    await expectProblem(response, 'invalid-request', 'commit request has unexpected fields');
  });

  it('rejects an actual body over 1 MiB when its declared length is honest', async () => {
    const body = JSON.stringify(encodeCommitRequest(oversizedSnapshot, 0n));
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(new TextEncoder().encode(body).byteLength),
      },
      body,
    });

    await expectProblem(
      response,
      'payload-too-large',
      'Send a request body no larger than 1048576 bytes.',
    );
  });

  it('rejects a streamed body over 1 MiB without a declared length', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: `{"padding":"${'x'.repeat(1_048_576)}"}`,
    });

    await expectProblem(
      response,
      'payload-too-large',
      'Send a request body no larger than 1048576 bytes.',
    );
  });

  it('rejects an actual body over 1 MiB when its declared length is understated', async () => {
    let commitCalls = 0;
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

    await expectProblem(
      response,
      'payload-too-large',
      'Send a request body no larger than 1048576 bytes.',
    );
    expect(commitCalls).toBe(0);
  });

  /*
   * An oversized body is drained so the 413 leaves the connection reusable, and
   * that drain is itself bounded — a client that never stops sending must not be
   * able to hold the read loop open indefinitely. The stream below never ends,
   * so an unbounded drain fails this by hanging; the byte assertion fails it
   * fast if the bound merely moves somewhere too generous to matter.
   */
  it('stops draining a body that keeps arriving past the drain allowance', async () => {
    const chunk = 64 * 1024;
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk;
        controller.enqueue(new Uint8Array(chunk));
      },
    });

    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: endless,
      duplex: 'half',
    } as RequestInit);

    expect(response.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(MAX_COMMIT_BODY_BYTES * 16);
  });

  // A client that disconnects mid-drain costs its own connection, not the 413
  // this app already decided to answer with — the drain's own read failure
  // must not turn into a second, worse response.
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

    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: flaky,
      duplex: 'half',
    } as RequestInit);

    expect(response.status).toBe(413);
  });

  it('proceeds past the body-size guard when the request has no body at all', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(400);
  });

  // The limit is a maximum, not a threshold the body must stay under. Both size
  // checks compare with `>`, and neither existing case would notice one of them
  // becoming `>=` — the oversize tests would still pass while every commit of
  // exactly the permitted size started failing.
  it('accepts a body of exactly the 1 MiB limit through both size checks', async () => {
    const padded = (length: number): SpaceSnapshot => ({
      ...snapshot,
      cards: [
        { id: CARD_ID, document: { title: 'A', kind: 'markdown', body: 'x'.repeat(length) } },
      ],
    });
    const overhead = JSON.stringify(encodeCommitRequest(padded(0), 0n)).length;
    const body = JSON.stringify(encodeCommitRequest(padded(MAX_COMMIT_BODY_BYTES - overhead), 0n));
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_COMMIT_BODY_BYTES);

    const declared = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(MAX_COMMIT_BODY_BYTES),
      },
      body,
    });

    expect(declared.status).toBe(200);
    await expect(declared.json()).resolves.toEqual({ revision: '1' });

    const streamed = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(streamed.status).toBe(200);
    await expect(streamed.json()).resolves.toEqual({ revision: '1' });
  });

  // The body is genuinely oversized, so this fails as 400 only if the identity
  // is settled before the body is measured. A small body with a lying length
  // would pass whichever order the two ran in, and prove nothing.
  it('rejects an invalid path identity before inspecting the request body', async () => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(oversizedSnapshot, 0n)),
    });

    await expectProblem(response, 'invalid-space-id', 'Use a UUID for the Space id.');
  });

  // `validateSpaceId` guards both methods, but only the commit graph proved it.
  // A load graph that dropped the validator would hand the repository an
  // unvalidated path segment and answer 404 rather than 400.
  it('rejects an invalid path identity before loading a space', async () => {
    const response = await createSpaceHttpApp(
      repository({ loadSpace: () => Promise.reject(new Error('must not be reached')) }),
    ).request('/api/spaces/not-a-uuid');

    await expectProblem(response, 'invalid-space-id', 'Use a UUID for the Space id.');
  });

  it('rejects a path and snapshot identity mismatch before repository access', async () => {
    const response = await createSpaceHttpApp(
      repository({ commitSpace: () => Promise.reject(new Error('must not be reached')) }),
    ).request(`/api/spaces/${OTHER_SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(encodeCommitRequest(snapshot, 0n)),
    });

    const problem = await expectProblem(
      response,
      'invalid-request',
      'Use the path Space id as the snapshot id.',
    );
    expect(problem.errors).toEqual([{ code: 'invalid-value', pointer: '/snapshot/id' }]);
  });

  it('returns JSON when the request body is malformed JSON', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    await expectProblem(response, 'invalid-request', 'Malformed JSON in request body');
  });

  // Each case carries the guard that should reject it. Asserting only the 400
  // let any case pass on any other guard's refusal — a noncanonical revision
  // rejected as an unexpected field would have read as green.
  it.each([
    ['an array envelope', [], /commit request must be an object/],
    [
      'an unexpected envelope field',
      { ...encodeCommitRequest(snapshot, 0n), extra: true },
      /commit request has unexpected fields/,
    ],
    [
      'a noncanonical revision',
      { snapshot, expectedRevision: '01' },
      /expectedRevision must be a canonical non-negative decimal string/,
    ],
    [
      'a schema-invalid snapshot',
      {
        snapshot: { ...snapshot, document: { ...snapshot.document, title: '' } },
        expectedRevision: '0',
      },
      // The snapshot guard, naming the field it refused: a bare /title/ would
      // also pass on an envelope guard that happened to mention the word.
      /commit request snapshot is invalid: document\.title/,
    ],
  ])('rejects %s as an invalid request', async (_name, body, expectedMessage) => {
    const response = await createSpaceHttpApp(
      repository({ commitSpace: () => Promise.reject(new Error('must not be reached')) }),
    ).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const problem = await expectProblem(response, 'invalid-request');
    expect(problem.detail).toMatch(expectedMessage);
  });

  /*
   * Problem `detail` is the display-prose contract, and every other 400 honours
   * it with a sentence. Zod serializes its whole issue array into
   * `Error.message`, so a snapshot that fails the schema used to answer with
   * hundreds of characters of internal schema shape — a JSON document nested
   * inside a field the client renders as prose.
   */
  it('describes a schema-invalid snapshot in prose rather than serialized issues', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshot: { ...snapshot, document: { ...snapshot.document, title: '' } },
        expectedRevision: '0',
      }),
    });

    expect(response.status).toBe(400);
    const problem = await expectProblem(response, 'invalid-request');
    expect(problem.detail).toContain('snapshot is invalid');
    expect(problem.detail).toContain('document.title');
    expect(problem.detail).not.toContain('{');
    expect(problem.detail.length).toBeLessThan(200);
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

  // The collection and the resource are separate arms of the HEAD guard, and only
  // the collection was proven. A resource arm that stopped matching would fall
  // through to the GET graph and answer 200 with a silently dropped body.
  it('does not add an implicit HEAD resource for a space', async () => {
    const response = await createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, {
      method: 'HEAD',
    });

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, PUT');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  // The declared methods reject a non-UUID through `validateSpaceId`, so this
  // reaches the same judgement by the other graph: an undeclared method has no
  // validator to run and lands in `app.notFound()`, which has to identify the
  // path itself rather than advertise `Allow` for a resource that cannot exist.
  //
  // HEAD is in that same position and must reach the same judgement. A guard
  // that matches the resource shape without reading the identity answers 405
  // `Allow: GET, PUT` for a path no method can address, so it advertises a
  // resource that cannot exist and disagrees with GET on the same URL.
  it.each([
    ['an undeclared method', 'POST'],
    // Hono strips a HEAD response's body itself, so the guard that intercepts
    // HEAD is observable only in the status and headers. The empty string is
    // asserted rather than ignored: it is why the guard cannot simply be
    // deleted and left to the GET graph, which answers 200 with nothing.
    ['HEAD', 'HEAD'],
  ])('rejects an invalid path identity for %s', async (_name, method) => {
    const response = await createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid', {
      method,
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('allow')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/problem+json');
    if (method === 'HEAD') {
      await expect(response.text()).resolves.toBe('');
    } else {
      await expectProblem(response, 'invalid-space-id', 'Use a UUID for the Space id.');
    }
  });

  // The normalization matches `Content-Type` exactly, which holds only while
  // `c.json()` sets a bare `application/json` for Hono to rewrite. An upgrade
  // that emitted its own `charset` would not match, and every JSON response
  // would silently carry a different header than the three pinned above — so
  // the invariant is asserted across the whole status range, not one path.
  it('normalizes the media type of every JSON response', async () => {
    const swallowed: unknown[] = [];
    const oversized = 'x'.repeat(MAX_COMMIT_BODY_BYTES + 10);
    const commit = JSON.stringify(encodeCommitRequest(snapshot, 0n));
    const put = (body: string, contentType = 'application/json') => ({
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body,
    });
    const JSON_MEDIA = 'application/json; charset=utf-8';
    const PROBLEM_MEDIA = 'application/problem+json';

    const cases = [
      {
        status: 200,
        contentType: JSON_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces'),
      },
      {
        status: 200,
        contentType: JSON_MEDIA,
        request: () => createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`),
      },
      {
        status: 404,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository({ loadSpace: () => Promise.resolve(undefined) })).request(
            `/api/spaces/${SPACE_ID}`,
          ),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid'),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request('/api/spaces/not-a-uuid', { method: 'POST' }),
      },
      {
        status: 404,
        contentType: PROBLEM_MEDIA,
        request: () => createSpaceHttpApp(repository()).request('/off-contract'),
      },
      {
        status: 200,
        contentType: JSON_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, put(commit)),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, put('not json')),
      },
      {
        status: 400,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, put('{}')),
      },
      {
        status: 415,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request(
            `/api/spaces/${SPACE_ID}`,
            put('{}', 'text/plain; charset=utf-8'),
          ),
      },
      {
        status: 413,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository()).request(`/api/spaces/${SPACE_ID}`, put(oversized)),
      },
      // The conflict branch encodes a whole loaded space rather than a message,
      // so it reaches `context.json` by a different graph than its neighbours.
      {
        status: 409,
        contentType: JSON_MEDIA,
        request: () =>
          createSpaceHttpApp(
            repository({
              commitSpace: () =>
                Promise.resolve({
                  kind: 'conflict' as const,
                  current: { snapshot, revision: 1n, exportedRevision: null },
                }),
            }),
          ).request(`/api/spaces/${SPACE_ID}`, put(commit)),
      },
      {
        status: 422,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(
            repository({
              commitSpace: () =>
                Promise.resolve({
                  kind: 'rejected' as const,
                  code: 'invalid-snapshot' as const,
                  message: 'bad',
                }),
            }),
          ).request(`/api/spaces/${SPACE_ID}`, put(commit)),
      },
      {
        status: 503,
        contentType: PROBLEM_MEDIA,
        request: () =>
          createSpaceHttpApp(repository({ listSpaces: () => Promise.reject(new Error('down')) }), {
            logError: (message) => swallowed.push(message),
          }).request('/api/spaces'),
      },
    ];

    const responses = await Promise.all(
      cases.map((testCase) => Promise.resolve(testCase.request())),
    );

    expect(swallowed).toEqual(['Failed to list spaces']);
    responses.forEach((response, index) => {
      expect(response.status).toBe(cases[index]?.status);
      expect(response.headers.get('content-type')).toBe(cases[index]?.contentType);
    });
  });

  it.each([
    ['the collection', '/api/spaces'],
    ['a space resource', `/api/spaces/${SPACE_ID}`],
  ])('returns Problem Details for a disallowed method on %s', async (_name, path) => {
    const response = await createSpaceHttpApp(repository()).request(path, { method: 'POST' });

    await expectProblem(response, 'method-not-allowed');
  });

  // `c.notFound()` inside the handler installed by `app.notFound()` calls that
  // same handler — Hono seeds the Context's not-found handler from the app's —
  // so it recurses until the stack blows. Every path off the declared contract
  // reached it, including the trailing slash a browser address bar produces.
  it.each(['/', '/api', '/api/spaces/', '/index.html', '/api/spaces/one/two'])(
    'answers %s outside the declared contract without recursing',
    async (path) => {
      const response = await createSpaceHttpApp(repository()).request(path);

      expect(response.headers.get('cache-control')).toBe('no-store');
      await expectProblem(response, 'not-found', 'Use a declared Space API path.');
    },
  );

  it('logs through the default console sink when no logError option is given', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const app = createSpaceHttpApp(
      repository({ listSpaces: () => Promise.reject(new Error('database is down')) }),
    );
    const response = await app.request('/api/spaces');

    expect(consoleError).toHaveBeenCalledWith('Failed to list spaces', expect.any(Error));
    await expectProblem(response, 'persistence-unavailable', 'Try the request again later.');

    consoleError.mockRestore();
  });

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

    expect(response.headers.get('cache-control')).toBe('no-store');
    await expectProblem(response, 'internal-error', 'Try the request again later.');
  });

  /*
   * Problem Details is the whole error contract, and `HttpSpaceBackend` decodes
   * every non-200/409 commit response through it. `HTTPException`'s own
   * `getResponse()` answers `text/plain` with no `Cache-Control`, so forwarding
   * it for any status but 400 left the typed client a body it cannot read and a
   * cacheable error. A throwing log sink is the seam that reaches this branch
   * with a status the application does not itself produce.
   */
  it.each([
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
  ] as const)(
    'answers an HTTPException with %i in the declared JSON error shape',
    async (status, code) => {
      const app = createSpaceHttpApp(
        repository({ listSpaces: () => Promise.reject(new Error('database is down')) }),
        {
          logError: () => {
            throw new HTTPException(status, { message: `Refused with ${status}` });
          },
        },
      );

      const response = await app.request('/api/spaces');

      expect(response.headers.get('cache-control')).toBe('no-store');
      await expectProblem(response, code, `Refused with ${status}`);
    },
  );

  /*
   * `new HTTPException(status)` with no `options.message` carries an empty
   * `Error#message`, and Problem Details requires a non-empty `detail`. This
   * must not throw out of `onError` itself — Hono has no third attempt, so
   * that throw would otherwise escape as the exception-with-no-message case,
   * losing the real status and code behind a generic 500.
   */
  it('answers an HTTPException with no message using its code title as detail', async () => {
    const app = createSpaceHttpApp(
      repository({ listSpaces: () => Promise.reject(new Error('database is down')) }),
      {
        logError: () => {
          throw new HTTPException(404);
        },
      },
    );

    const response = await app.request('/api/spaces');

    expect(response.headers.get('cache-control')).toBe('no-store');
    await expectProblem(response, 'not-found', problemCatalogue['not-found'].title);
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
